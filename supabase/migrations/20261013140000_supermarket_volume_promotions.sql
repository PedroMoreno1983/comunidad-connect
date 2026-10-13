-- Issue #96: promociones por volumen y pedido minimo por tienda.
--
-- El comparador sumaba precio unitario x cantidad y no tenia donde guardar
-- "4 X $990" (aCuenta) ni "Combina 4 x $5.990" (Lider), asi que el orden de
-- tiendas se invertia frente al carro real. Tampoco sabia que aCuenta exige un
-- pedido minimo, y recomendaba una compra que la tienda no deja cursar.
--
-- Esta migracion:
--   1. Agrega a supermarket_products la promocion por volumen normalizada:
--      promo_total_price pesos por cada bloque de promo_min_qty unidades.
--      promo_group agrupa productos combinables dentro del mismo bloque
--      (bundleId de Lider, id de promocion de Jumbo). promo_checked_at dice
--      cuando el scraper miro el badge por ultima vez; NULL = nunca se reviso,
--      y la app trata ese total como estimado sin promociones.
--   2. Crea supermarket_store_policies con el pedido minimo por tienda.
--   3. Reemplaza ingest_supermarket_snapshot para persistir la promocion solo
--      cuando el producto trae "promo_checked": true (si no, conserva la que
--      habia). Parte de la version de 20260726030000_supermarket_add_tottus.sql.
--   4. Reemplaza search_supermarket_products_batch_v2 para devolver las
--      columnas nuevas. Parte de 20260911182622_supermarket_batch_include_sales_unit.sql.
--
-- Pendiente de aplicar en produccion (Pedro). Idempotente.

BEGIN;

ALTER TABLE public.supermarket_products
  ADD COLUMN IF NOT EXISTS promo_min_qty INTEGER,
  ADD COLUMN IF NOT EXISTS promo_total_price INTEGER,
  ADD COLUMN IF NOT EXISTS promo_label TEXT,
  ADD COLUMN IF NOT EXISTS promo_group TEXT,
  ADD COLUMN IF NOT EXISTS promo_checked_at TIMESTAMPTZ;

ALTER TABLE public.supermarket_products
  DROP CONSTRAINT IF EXISTS supermarket_products_volume_promo_check;
ALTER TABLE public.supermarket_products
  ADD CONSTRAINT supermarket_products_volume_promo_check
  CHECK (
    (promo_min_qty IS NULL AND promo_total_price IS NULL)
    OR (promo_min_qty BETWEEN 2 AND 1000 AND promo_total_price > 0)
  );
-- Que el bloque abarate frente a `price` se valida al ingerir y en la app, no
-- aqui: una ingesta posterior que solo baja el precio no debe hacer fallar el
-- lote entero por una promocion guardada antes.

COMMENT ON COLUMN public.supermarket_products.promo_min_qty IS
  'Promocion por volumen: unidades por bloque ("4" en "4 x $990"). NULL si no hay.';
COMMENT ON COLUMN public.supermarket_products.promo_total_price IS
  'Promocion por volumen: total en CLP de cada bloque de promo_min_qty unidades.';
COMMENT ON COLUMN public.supermarket_products.promo_label IS
  'Texto de la promocion tal como lo muestra la tienda.';
COMMENT ON COLUMN public.supermarket_products.promo_group IS
  'Clave de combinacion entre productos (Combina): bundleId de Lider o id de promocion de Jumbo.';
COMMENT ON COLUMN public.supermarket_products.promo_checked_at IS
  'Ultima vez que el scraper reviso el badge de promocion. NULL = nunca revisado.';

CREATE TABLE IF NOT EXISTS public.supermarket_store_policies (
  store TEXT PRIMARY KEY,
  minimum_order INTEGER,
  source TEXT,
  observed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT supermarket_store_policies_store_check
    CHECK (store IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun')),
  CONSTRAINT supermarket_store_policies_minimum_order_check
    CHECK (minimum_order IS NULL OR minimum_order > 0)
);

COMMENT ON TABLE public.supermarket_store_policies IS
  'Reglas de compra por tienda que el catalogo no trae, como el pedido minimo.';

ALTER TABLE public.supermarket_store_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supermarket_store_policies_read" ON public.supermarket_store_policies;
CREATE POLICY "supermarket_store_policies_read"
  ON public.supermarket_store_policies
  FOR SELECT
  TO authenticated
  USING (true);

-- Unico minimo medido: el carro real de aCuenta del issue #96 (2026-09-04)
-- avisaba "Te faltan $16.895 para completar el pedido minimo" sobre $8.105.
-- No se pisa un valor ya cargado a mano.
INSERT INTO public.supermarket_store_policies (store, minimum_order, source, observed_at)
VALUES ('aCuenta', 25000, 'Carro real, issue #96: $8.105 + faltan $16.895', '2026-09-04T12:00:00-04:00')
ON CONFLICT (store) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ingest_supermarket_snapshot(
  p_terms TEXT[],
  p_products JSONB,
  p_source_status JSONB,
  p_fetched_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID;
  v_product JSONB;
  v_product_id UUID;
  v_source_key TEXT;
  v_store TEXT;
  v_name TEXT;
  v_query TEXT;
  v_price INTEGER;
  v_list_price INTEGER;
  v_in_stock BOOLEAN;
  v_inserted INTEGER := 0;
  v_source_ok INTEGER := 0;
  v_source_total INTEGER := 0;
  v_run_status TEXT;
  v_channel_type TEXT;
  v_pack_units INTEGER;
  v_minimum_packs INTEGER;
  v_promo_checked BOOLEAN;
  v_promo_min_qty INTEGER;
  v_promo_total_price INTEGER;
  v_promo_label TEXT;
  v_promo_group TEXT;
BEGIN
  IF jsonb_typeof(p_products) <> 'array' OR jsonb_typeof(p_source_status) <> 'array' THEN
    RAISE EXCEPTION 'products and source_status must be JSON arrays';
  END IF;

  SELECT count(*), count(*) FILTER (WHERE value->>'status' = 'ok')
  INTO v_source_total, v_source_ok
  FROM jsonb_array_elements(p_source_status);

  v_run_status := CASE
    WHEN v_source_ok = 0 THEN 'failed'
    WHEN v_source_ok < v_source_total THEN 'partial'
    ELSE 'completed'
  END;

  INSERT INTO public.supermarket_scrape_runs (requested_terms, source_status, product_count, status, fetched_at)
  VALUES (COALESCE(p_terms, '{}'), p_source_status, jsonb_array_length(p_products), v_run_status, p_fetched_at)
  RETURNING id INTO v_run_id;

  FOR v_product IN SELECT value FROM jsonb_array_elements(p_products)
  LOOP
    v_store := NULLIF(btrim(v_product->>'store'), '');
    v_name := NULLIF(btrim(v_product->>'name'), '');
    v_query := COALESCE(NULLIF(btrim(v_product->>'query'), ''), 'catalogo');
    v_price := CASE
      WHEN COALESCE(v_product->>'price', '') ~ '^[0-9]+$' THEN (v_product->>'price')::INTEGER
      ELSE 0
    END;
    v_list_price := CASE
      WHEN COALESCE(v_product->>'list_price', '') ~ '^[0-9]+$' THEN (v_product->>'list_price')::INTEGER
      ELSE NULL
    END;
    v_in_stock := COALESCE((v_product->>'in_stock')::BOOLEAN, TRUE);
    v_channel_type := CASE
      WHEN v_product->>'channel_type' = 'wholesale' OR v_store IN ('aCuenta', 'Irurzun') THEN 'wholesale'
      ELSE 'retail'
    END;
    v_pack_units := LEAST(10000, GREATEST(1, COALESCE(NULLIF(v_product->>'pack_units', '')::INTEGER, 1)));
    v_minimum_packs := LEAST(1000, GREATEST(1, COALESCE(NULLIF(v_product->>'minimum_packs', '')::INTEGER, 1)));
    v_source_key := left(
      COALESCE(
        NULLIF(btrim(v_product->>'sku'), ''),
        NULLIF(btrim(v_product->>'ean'), ''),
        NULLIF(btrim(v_product->>'product_url'), ''),
        lower(v_name)
      ),
      1000
    );

    IF v_store NOT IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'Tottus', 'aCuenta', 'Irurzun')
      OR v_name IS NULL
      OR v_source_key IS NULL
      OR v_price <= 0
    THEN
      CONTINUE;
    END IF;

    IF v_list_price IS NOT NULL AND v_list_price < v_price THEN
      v_list_price := NULL;
    END IF;

    -- Promocion por volumen (issue #96). Solo se escribe cuando el scraper
    -- declara que miro el badge; si no, se conserva la guardada.
    v_promo_checked := COALESCE(v_product->>'promo_checked', '') = 'true';
    v_promo_min_qty := CASE
      WHEN COALESCE(v_product->>'promo_min_qty', '') ~ '^[0-9]{1,4}$' THEN (v_product->>'promo_min_qty')::INTEGER
      ELSE NULL
    END;
    v_promo_total_price := CASE
      WHEN COALESCE(v_product->>'promo_total_price', '') ~ '^[0-9]{1,9}$' THEN (v_product->>'promo_total_price')::INTEGER
      ELSE NULL
    END;
    IF v_promo_min_qty IS NULL
      OR v_promo_total_price IS NULL
      OR v_promo_min_qty < 2
      OR v_promo_min_qty > 1000
      OR v_promo_total_price <= 0
      OR v_promo_total_price::BIGINT >= v_promo_min_qty::BIGINT * v_price
    THEN
      v_promo_min_qty := NULL;
      v_promo_total_price := NULL;
      v_promo_label := NULL;
      v_promo_group := NULL;
    ELSE
      v_promo_label := left(NULLIF(btrim(v_product->>'promo_label'), ''), 120);
      v_promo_group := left(NULLIF(btrim(v_product->>'promo_group'), ''), 200);
    END IF;

    INSERT INTO public.supermarket_products (
      store, source_product_key, last_query, name, brand, sku, ean, product_url, image_url,
      price, list_price, in_stock, channel_type, pack_units, minimum_packs,
      promo_min_qty, promo_total_price, promo_label, promo_group, promo_checked_at,
      first_seen_at, last_seen_at, last_run_id
    ) VALUES (
      v_store, v_source_key, v_query, v_name, NULLIF(btrim(v_product->>'brand'), ''),
      NULLIF(btrim(v_product->>'sku'), ''), NULLIF(btrim(v_product->>'ean'), ''),
      NULLIF(btrim(v_product->>'product_url'), ''), NULLIF(btrim(v_product->>'image_url'), ''),
      v_price, v_list_price, v_in_stock, v_channel_type, v_pack_units, v_minimum_packs,
      v_promo_min_qty, v_promo_total_price, v_promo_label, v_promo_group,
      CASE WHEN v_promo_checked THEN p_fetched_at ELSE NULL END,
      p_fetched_at, p_fetched_at, v_run_id
    )
    ON CONFLICT (store, source_product_key) DO UPDATE SET
      last_query = EXCLUDED.last_query,
      name = EXCLUDED.name,
      brand = EXCLUDED.brand,
      sku = EXCLUDED.sku,
      ean = EXCLUDED.ean,
      product_url = EXCLUDED.product_url,
      image_url = EXCLUDED.image_url,
      price = EXCLUDED.price,
      list_price = EXCLUDED.list_price,
      in_stock = EXCLUDED.in_stock,
      channel_type = EXCLUDED.channel_type,
      pack_units = EXCLUDED.pack_units,
      minimum_packs = EXCLUDED.minimum_packs,
      promo_min_qty = CASE WHEN v_promo_checked THEN EXCLUDED.promo_min_qty ELSE public.supermarket_products.promo_min_qty END,
      promo_total_price = CASE WHEN v_promo_checked THEN EXCLUDED.promo_total_price ELSE public.supermarket_products.promo_total_price END,
      promo_label = CASE WHEN v_promo_checked THEN EXCLUDED.promo_label ELSE public.supermarket_products.promo_label END,
      promo_group = CASE WHEN v_promo_checked THEN EXCLUDED.promo_group ELSE public.supermarket_products.promo_group END,
      promo_checked_at = CASE WHEN v_promo_checked THEN EXCLUDED.promo_checked_at ELSE public.supermarket_products.promo_checked_at END,
      last_seen_at = EXCLUDED.last_seen_at,
      last_run_id = EXCLUDED.last_run_id,
      updated_at = NOW()
    RETURNING id INTO v_product_id;

    INSERT INTO public.supermarket_price_history (
      product_id, run_id, query, price, list_price, in_stock, observed_at
    )
    VALUES (
      v_product_id, v_run_id, v_query, v_price, v_list_price, v_in_stock, p_fetched_at
    )
    ON CONFLICT (run_id, product_id, query) DO NOTHING;

    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE public.supermarket_scrape_runs
  SET product_count = v_inserted
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'status', v_run_status,
    'product_count', v_inserted,
    'fetched_at', p_fetched_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_supermarket_snapshot(TEXT[], JSONB, JSONB, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_supermarket_snapshot(TEXT[], JSONB, JSONB, TIMESTAMPTZ)
  TO service_role;

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
      product.offer_id,
      product.sales_unit,
      product.promo_min_qty,
      product.promo_total_price,
      product.promo_label,
      product.promo_group,
      product.promo_checked_at
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
          'offer_id', offer_id,
          'sales_unit', sales_unit,
          'promo_min_qty', promo_min_qty,
          'promo_total_price', promo_total_price,
          'promo_label', promo_label,
          'promo_group', promo_group,
          'promo_checked_at', promo_checked_at
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

COMMIT;
