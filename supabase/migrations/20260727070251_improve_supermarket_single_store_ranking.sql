CREATE OR REPLACE FUNCTION public.search_supermarket_products_batch(
  p_queries JSONB,
  p_cutoff TIMESTAMPTZ,
  p_limit_per_store INTEGER DEFAULT 20
)
RETURNS TABLE (
  requested_term TEXT,
  id UUID,
  store TEXT,
  name TEXT,
  brand TEXT,
  product_url TEXT,
  image_url TEXT,
  price INTEGER,
  list_price INTEGER,
  in_stock BOOLEAN,
  last_seen_at TIMESTAMPTZ,
  channel_type TEXT,
  pack_units INTEGER,
  minimum_packs INTEGER
)
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
               '(apanad|artesanal|bebida|caldo|chips|cocid|congelad|conserva|crema|crispy|deshidratad|frit|galleta|jugo|mermelada|polvo|prefrit|puré|pure|salsa|sabor|sazonador|snack|sopa)'
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
     AND to_tsvector('spanish', product.name)
       @@ plainto_tsquery('spanish', query.anchor)
  )
  SELECT
    ranked.requested_term,
    ranked.id,
    ranked.store,
    ranked.name,
    ranked.brand,
    ranked.product_url,
    ranked.image_url,
    ranked.price,
    ranked.list_price,
    ranked.in_stock,
    ranked.last_seen_at,
    ranked.channel_type,
    ranked.pack_units,
    ranked.minimum_packs
  FROM ranked
  WHERE ranked.store_rank <= LEAST(GREATEST(p_limit_per_store, 1), 40)
  ORDER BY ranked.requested_term, ranked.store, ranked.store_rank;
$$;

REVOKE ALL ON FUNCTION public.search_supermarket_products_batch(JSONB, TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_supermarket_products_batch(JSONB, TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.search_supermarket_products_batch(JSONB, TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.search_supermarket_products_batch(JSONB, TIMESTAMPTZ, INTEGER) TO service_role;
