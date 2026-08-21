-- El catalogo por lote no devolvia el codigo de tienda.
--
-- `search_supermarket_products_batch_v2` es el camino principal del catalogo y
-- su jsonb_build_object omitia `sku`, asi que TODOS los candidatos llegaban sin
-- codigo. Consecuencias medidas el 2026-08-17 contra la funcion desplegada:
--   * La extension recibia `sku: undefined` y no podia cargar por API.
--   * La resolucion del carro necesitaba consultas extra por product_url y por
--     nombre, y lo que no calzaba quedaba fuera del carro.
-- Se agrega tambien `offer_id`, que la mutacion updateItems de Lider exige.
--
-- Ojo: `sku` y `offer_id` deben arrastrarse tambien en el CTE `matches`; sin eso
-- el jsonb_build_object los referencia y la funcion falla con
-- "column sku does not exist".
--
-- APLICADA en produccion el 2026-08-17 desde el SQL Editor.

CREATE OR REPLACE FUNCTION public.search_supermarket_products_batch_v2(
  p_queries JSONB,
  p_cutoff TIMESTAMPTZ,
  p_limit_per_store INTEGER DEFAULT 12
)
RETURNS JSONB
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH queries AS (
    SELECT
      LEFT(BTRIM(item ->> 'term'), 80) AS requested_term,
      LEFT(BTRIM(alternate.value), 80) AS anchor,
      LEFT(BTRIM(item ->> 'anchor'), 80) AS primary_anchor,
      CASE
        WHEN item ->> 'intent' = 'fresh_produce' THEN 'fresh_produce'
        ELSE 'general'
      END AS intent
    FROM jsonb_array_elements(COALESCE(p_queries, '[]'::jsonb)) AS item
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(item -> 'anchors') = 'array' THEN item -> 'anchors'
        ELSE jsonb_build_array(item ->> 'anchor')
      END
    ) AS alternate(value)
    WHERE BTRIM(item ->> 'term') <> ''
      AND BTRIM(alternate.value) <> ''
    LIMIT 1800
  ),
  matches AS (
    SELECT DISTINCT ON (query.requested_term, product.id)
      query.requested_term,
      query.intent,
      query.primary_anchor,
      query.anchor AS matched_anchor,
      product.id,
      product.store,
      product.name,
      product.brand,
      product.product_url,
      product.image_url,
      product.price,
      product.list_price,
      product.in_stock,
      product.last_seen_at,
      product.channel_type,
      product.pack_units,
      product.minimum_packs,
      product.sku,
      product.offer_id
    FROM queries AS query
    JOIN public.supermarket_products AS product
      ON product.in_stock
     AND product.last_seen_at >= p_cutoff
     AND to_tsvector('spanish', product.name)
       @@ plainto_tsquery('spanish', query.anchor)
    ORDER BY
      query.requested_term,
      product.id,
      (LOWER(product.name) LIKE LOWER(query.anchor) || '%') DESC
  ),
  ranked AS (
    SELECT
      matches.*,
      ROW_NUMBER() OVER (
        PARTITION BY requested_term, store
        ORDER BY
          CASE
            WHEN intent = 'fresh_produce'
             AND LOWER(name) ~
               '(apanad|artesanal|bebida|caldo|chips|cocid|congelad|conserva|crema|crispy|deshidratad|duquesa|frit|gajo|galleta|jugo|mermelada|polvo|prefrit|pure|rellen|rodaja|sal|salsa|sabor|sazonador|snack|sopa|souffle)'
              THEN 1
            ELSE 0
          END,
          CASE
            WHEN LOWER(name) LIKE LOWER(matched_anchor) || '%' THEN 0
            WHEN LOWER(name) LIKE 'bolsa ' || LOWER(matched_anchor) || '%' THEN 0
            WHEN LOWER(name) LIKE 'malla ' || LOWER(matched_anchor) || '%' THEN 0
            WHEN LOWER(name) LIKE 'pack ' || LOWER(matched_anchor) || '%' THEN 0
            ELSE 1
          END,
          ts_rank_cd(
            to_tsvector('spanish', name),
            plainto_tsquery('spanish', requested_term)
          ) DESC,
          price ASC,
          last_seen_at DESC
      ) AS store_rank
    FROM matches
  ),
  selected AS (
    SELECT *
    FROM ranked
    WHERE store_rank <= LEAST(GREATEST(p_limit_per_store, 1), 30)
  ),
  grouped AS (
    SELECT
      requested_term,
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'store', store,
          'name', name,
          'brand', brand,
          'product_url', product_url,
          'image_url', image_url,
          'price', price,
          'list_price', list_price,
          'in_stock', in_stock,
          'last_seen_at', last_seen_at,
          'channel_type', channel_type,
          'pack_units', pack_units,
          'minimum_packs', minimum_packs,
          'sku', sku,
          'offer_id', offer_id
        )
        ORDER BY store, store_rank
      ) AS candidates
    FROM selected
    GROUP BY requested_term
  )
  SELECT COALESCE(
    jsonb_object_agg(requested_term, candidates),
    '{}'::jsonb
  )
  FROM grouped;
$$;

REVOKE ALL ON FUNCTION public.search_supermarket_products_batch_v2(JSONB, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_supermarket_products_batch_v2(JSONB, TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.search_supermarket_products_batch_v2(JSONB, TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_supermarket_products_batch_v2(JSONB, TIMESTAMPTZ, INTEGER) TO service_role;
