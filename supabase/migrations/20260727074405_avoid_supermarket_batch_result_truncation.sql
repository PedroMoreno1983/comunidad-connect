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
      LEFT(BTRIM(item ->> 'anchor'), 80) AS anchor,
      CASE
        WHEN jsonb_typeof(item -> 'anchors') = 'array' THEN item -> 'anchors'
        ELSE jsonb_build_array(item ->> 'anchor')
      END AS anchors,
      CASE
        WHEN item ->> 'intent' = 'fresh_produce' THEN 'fresh_produce'
        ELSE 'general'
      END AS intent
    FROM jsonb_array_elements(COALESCE(p_queries, '[]'::jsonb)) AS item
    WHERE BTRIM(item ->> 'term') <> ''
      AND BTRIM(item ->> 'anchor') <> ''
    LIMIT 600
  ),
  ranked AS (
    SELECT
      query.requested_term,
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
      ROW_NUMBER() OVER (
        PARTITION BY query.requested_term, product.store
        ORDER BY
          CASE
            WHEN query.intent = 'fresh_produce'
             AND LOWER(product.name) ~
               '(apanad|artesanal|bebida|caldo|chips|cocid|congelad|conserva|crema|crispy|deshidratad|duquesa|frit|gajo|galleta|jugo|mermelada|polvo|prefrit|pure|rellen|rodaja|sal|salsa|sabor|sazonador|snack|sopa)'
              THEN 1
            ELSE 0
          END,
          CASE
            WHEN LOWER(product.name) LIKE LOWER(query.anchor) || '%' THEN 0
            WHEN LOWER(product.name) LIKE 'bolsa ' || LOWER(query.anchor) || '%' THEN 0
            WHEN LOWER(product.name) LIKE 'malla ' || LOWER(query.anchor) || '%' THEN 0
            WHEN LOWER(product.name) LIKE 'pack ' || LOWER(query.anchor) || '%' THEN 0
            ELSE 1
          END,
          ts_rank_cd(
            to_tsvector('spanish', product.name),
            plainto_tsquery('spanish', query.requested_term)
          ) DESC,
          product.price ASC,
          product.last_seen_at DESC
      ) AS store_rank
    FROM queries AS query
    JOIN public.supermarket_products AS product
      ON product.in_stock
     AND product.last_seen_at >= p_cutoff
     AND (
       to_tsvector('spanish', product.name)
         @@ plainto_tsquery('spanish', query.anchor)
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements_text(query.anchors) AS alternate(value)
         WHERE to_tsvector('simple', LOWER(product.name))
           @@ to_tsquery(
             'simple',
             regexp_replace(LOWER(alternate.value), '[^a-z0-9]', '', 'g') || ':*'
           )
       )
     )
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
          'minimum_packs', minimum_packs
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
