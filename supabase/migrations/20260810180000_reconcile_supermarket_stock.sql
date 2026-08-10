BEGIN;

CREATE INDEX IF NOT EXISTS supermarket_products_stock_freshness_idx
  ON public.supermarket_products (store, last_seen_at)
  WHERE in_stock = TRUE;

CREATE OR REPLACE FUNCTION public.finalize_supermarket_catalog_refresh(
  p_store TEXT,
  p_started_at TIMESTAMPTZ,
  p_finished_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_in_stock INTEGER;
  v_observed INTEGER;
  v_minimum_observed INTEGER;
  v_marked_out INTEGER := 0;
  v_run_id UUID;
BEGIN
  IF p_store NOT IN (
    'Jumbo',
    'Santa Isabel',
    'Lider',
    'Unimarc',
    'Tottus',
    'aCuenta',
    'Irurzun'
  ) THEN
    RAISE EXCEPTION 'Unsupported supermarket: %', p_store
      USING ERRCODE = '22023';
  END IF;

  IF p_started_at IS NULL
    OR p_finished_at IS NULL
    OR p_finished_at < p_started_at
    OR p_finished_at > NOW() + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'Invalid catalog refresh window'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*) FILTER (WHERE in_stock),
    count(*) FILTER (
      WHERE last_seen_at >= p_started_at
        AND last_seen_at <= p_finished_at
    )
  INTO v_current_in_stock, v_observed
  FROM public.supermarket_products
  WHERE store = p_store;

  IF v_observed = 0 THEN
    RAISE EXCEPTION 'Refusing to reconcile % with an empty catalog', p_store
      USING ERRCODE = '22023';
  END IF;

  v_minimum_observed := CEIL(v_current_in_stock * 0.50)::INTEGER;
  IF v_current_in_stock > 0 AND v_observed < v_minimum_observed THEN
    RAISE EXCEPTION
      'Refusing to reconcile %: observed % of % in-stock products; minimum safe coverage is %',
      p_store,
      v_observed,
      v_current_in_stock,
      v_minimum_observed
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supermarket_scrape_runs (
    requested_terms,
    source_status,
    product_count,
    status,
    fetched_at
  )
  VALUES (
    ARRAY['catalogo', p_store, 'stock-finalize'],
    jsonb_build_array(
      jsonb_build_object(
        'store', p_store,
        'query', 'catalogo-stock',
        'status', 'ok',
        'observed', v_observed,
        'previously_in_stock', v_current_in_stock
      )
    ),
    0,
    'completed',
    p_finished_at
  )
  RETURNING id INTO v_run_id;

  WITH changed AS (
    UPDATE public.supermarket_products
    SET
      in_stock = FALSE,
      last_run_id = v_run_id,
      updated_at = p_finished_at
    WHERE store = p_store
      AND in_stock = TRUE
      AND last_seen_at < p_started_at
    RETURNING id, price, list_price
  ),
  recorded AS (
    INSERT INTO public.supermarket_price_history (
      product_id,
      run_id,
      query,
      price,
      list_price,
      in_stock,
      observed_at
    )
    SELECT
      id,
      v_run_id,
      'catalogo-stock',
      price,
      list_price,
      FALSE,
      p_finished_at
    FROM changed
    RETURNING 1
  )
  SELECT count(*) INTO v_marked_out
  FROM recorded;

  UPDATE public.supermarket_scrape_runs
  SET
    product_count = v_marked_out,
    source_status = jsonb_build_array(
      jsonb_build_object(
        'store', p_store,
        'query', 'catalogo-stock',
        'status', 'ok',
        'observed', v_observed,
        'previously_in_stock', v_current_in_stock,
        'marked_out_of_stock', v_marked_out
      )
    )
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'store', p_store,
    'observed', v_observed,
    'previously_in_stock', v_current_in_stock,
    'marked_out_of_stock', v_marked_out,
    'started_at', p_started_at,
    'finished_at', p_finished_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_supermarket_catalog_refresh(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_supermarket_catalog_refresh(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

COMMIT;
