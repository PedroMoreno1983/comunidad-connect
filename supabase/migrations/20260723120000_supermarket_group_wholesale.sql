BEGIN;

ALTER TABLE public.supermarket_products
  DROP CONSTRAINT IF EXISTS supermarket_products_store_check;
ALTER TABLE public.supermarket_products
  ADD CONSTRAINT supermarket_products_store_check
  CHECK (store IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta', 'Irurzun'));
ALTER TABLE public.supermarket_products
  ADD COLUMN IF NOT EXISTS channel_type TEXT NOT NULL DEFAULT 'retail'
    CHECK (channel_type IN ('retail', 'wholesale')),
  ADD COLUMN IF NOT EXISTS pack_units INTEGER NOT NULL DEFAULT 1 CHECK (pack_units > 0 AND pack_units <= 10000),
  ADD COLUMN IF NOT EXISTS minimum_packs INTEGER NOT NULL DEFAULT 1 CHECK (minimum_packs > 0 AND minimum_packs <= 1000);

CREATE TABLE IF NOT EXISTS public.supermarket_group_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'ready', 'locked', 'completed', 'cancelled')),
  closes_at DATE NOT NULL,
  selected_store TEXT,
  selected_total INTEGER CHECK (selected_total IS NULL OR selected_total > 0),
  selected_channel_type TEXT CHECK (selected_channel_type IS NULL OR selected_channel_type IN ('retail', 'wholesale')),
  retailer_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (selected_store IS NULL OR selected_store IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta', 'Irurzun'))
);

CREATE TABLE IF NOT EXISTS public.supermarket_group_order_members (
  order_id UUID NOT NULL REFERENCES public.supermarket_group_orders(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (order_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.supermarket_group_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.supermarket_group_orders(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_term TEXT NOT NULL CHECK (char_length(requested_term) BETWEEN 2 AND 80),
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, user_id, requested_term)
);

CREATE TABLE IF NOT EXISTS public.platform_operation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  actor_email TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_supermarket_group_orders_community
  ON public.supermarket_group_orders(community_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supermarket_group_members_community
  ON public.supermarket_group_order_members(community_id, order_id);
CREATE INDEX IF NOT EXISTS idx_supermarket_group_items_community
  ON public.supermarket_group_order_items(community_id, order_id);
CREATE INDEX IF NOT EXISTS idx_platform_operation_events_created
  ON public.platform_operation_events(created_at DESC);

ALTER TABLE public.supermarket_group_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supermarket_group_order_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supermarket_group_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_operation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS supermarket_group_orders_read_community ON public.supermarket_group_orders;
CREATE POLICY supermarket_group_orders_read_community
  ON public.supermarket_group_orders FOR SELECT TO authenticated
  USING (community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS supermarket_group_orders_insert_own ON public.supermarket_group_orders;
CREATE POLICY supermarket_group_orders_insert_own
  ON public.supermarket_group_orders FOR INSERT TO authenticated
  WITH CHECK (community_id = public.current_profile_community_id() AND created_by = auth.uid());

DROP POLICY IF EXISTS supermarket_group_orders_update_owner_admin ON public.supermarket_group_orders;
CREATE POLICY supermarket_group_orders_update_owner_admin
  ON public.supermarket_group_orders FOR UPDATE TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND (created_by = auth.uid() OR public.current_profile_role() = 'admin')
  )
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND (created_by = auth.uid() OR public.current_profile_role() = 'admin')
  );

DROP POLICY IF EXISTS supermarket_group_members_read_community ON public.supermarket_group_order_members;
CREATE POLICY supermarket_group_members_read_community
  ON public.supermarket_group_order_members FOR SELECT TO authenticated
  USING (community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS supermarket_group_members_insert_own ON public.supermarket_group_order_members;
CREATE POLICY supermarket_group_members_insert_own
  ON public.supermarket_group_order_members FOR INSERT TO authenticated
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.supermarket_group_orders orders
      WHERE orders.id = supermarket_group_order_members.order_id
        AND orders.community_id = supermarket_group_order_members.community_id
        AND orders.status IN ('open', 'ready')
    )
  );

DROP POLICY IF EXISTS supermarket_group_items_read_community ON public.supermarket_group_order_items;
CREATE POLICY supermarket_group_items_read_community
  ON public.supermarket_group_order_items FOR SELECT TO authenticated
  USING (community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS supermarket_group_items_insert_own ON public.supermarket_group_order_items;
CREATE POLICY supermarket_group_items_insert_own
  ON public.supermarket_group_order_items FOR INSERT TO authenticated
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.supermarket_group_orders orders
      WHERE orders.id = supermarket_group_order_items.order_id
        AND orders.community_id = supermarket_group_order_items.community_id
        AND orders.status IN ('open', 'ready')
    )
  );

DROP POLICY IF EXISTS supermarket_group_items_update_own ON public.supermarket_group_order_items;
CREATE POLICY supermarket_group_items_update_own
  ON public.supermarket_group_order_items FOR UPDATE TO authenticated
  USING (community_id = public.current_profile_community_id() AND user_id = auth.uid())
  WITH CHECK (community_id = public.current_profile_community_id() AND user_id = auth.uid());

REVOKE ALL ON public.platform_operation_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_operation_events TO service_role;

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

    IF v_store NOT IN ('Jumbo', 'Santa Isabel', 'Lider', 'Unimarc', 'aCuenta', 'Irurzun')
      OR v_name IS NULL
      OR v_source_key IS NULL
      OR v_price <= 0
    THEN
      CONTINUE;
    END IF;

    IF v_list_price IS NOT NULL AND v_list_price < v_price THEN
      v_list_price := NULL;
    END IF;

    INSERT INTO public.supermarket_products (
      store, source_product_key, last_query, name, brand, sku, ean, product_url, image_url,
      price, list_price, in_stock, channel_type, pack_units, minimum_packs,
      first_seen_at, last_seen_at, last_run_id
    ) VALUES (
      v_store, v_source_key, v_query, v_name, NULLIF(btrim(v_product->>'brand'), ''),
      NULLIF(btrim(v_product->>'sku'), ''), NULLIF(btrim(v_product->>'ean'), ''),
      NULLIF(btrim(v_product->>'product_url'), ''), NULLIF(btrim(v_product->>'image_url'), ''),
      v_price, v_list_price, v_in_stock, v_channel_type, v_pack_units, v_minimum_packs,
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

COMMIT;
