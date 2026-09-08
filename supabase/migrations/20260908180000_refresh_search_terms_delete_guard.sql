-- Supabase rechaza un DELETE sin WHERE ("DELETE requires a WHERE clause"), una
-- guarda contra el borrado accidental de una tabla entera. Aca el borrado total
-- es justamente la intencion -el vocabulario se reemplaza completo-, asi que se
-- declara explicito.
CREATE OR REPLACE FUNCTION public.refresh_supermarket_search_terms(
  p_min_products integer DEFAULT 3,
  p_limit integer DEFAULT 4000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  CREATE TEMP TABLE nuevo_vocabulario ON COMMIT DROP AS
    SELECT term, products
    FROM public.supermarket_term_vocabulary(p_min_products, p_limit);

  SELECT count(*) INTO v_count FROM nuevo_vocabulario;

  -- Un catalogo a medio cargar no puede vaciar el vocabulario: sin esta guarda,
  -- una carga fallida dejaria el autocompletado mudo y la correccion sin contra
  -- que comparar, en silencio.
  IF v_count < 100 THEN
    RAISE EXCEPTION 'Vocabulario sospechosamente corto (% terminos); no se reemplaza el vigente', v_count
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.supermarket_search_terms WHERE true;
  INSERT INTO public.supermarket_search_terms (term, products)
    SELECT term, products FROM nuevo_vocabulario;

  RETURN v_count;
END;
$$;
