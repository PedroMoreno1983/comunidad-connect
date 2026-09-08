-- El vocabulario se calcula recorriendo las 91.892 filas del catalogo: medido
-- el 2026-09-08, entre 1,5 y 5,5 segundos segun la cache de la base. Eso esta
-- bien una vez por noche y esta mal cada vez que un proceso nuevo atiende la
-- primera tecla de alguien escribiendo su lista.
--
-- Asi que se guarda. La tabla se rellena cuando termina la carga nocturna del
-- catalogo, que es lo unico que puede cambiar el resultado, y leerla es una
-- consulta indexada de mil filas.
CREATE TABLE IF NOT EXISTS public.supermarket_search_terms (
  term TEXT PRIMARY KEY,
  products INTEGER NOT NULL CHECK (products > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supermarket_search_terms_products_idx
  ON public.supermarket_search_terms (products DESC);

ALTER TABLE public.supermarket_search_terms ENABLE ROW LEVEL SECURITY;

-- El vocabulario no dice nada de nadie: son nombres de productos de gondola.
-- Cualquier residente autenticado puede leerlo; escribirlo es cosa del proceso
-- de carga, que corre con service_role y no pasa por RLS.
DROP POLICY IF EXISTS "supermarket_search_terms_read" ON public.supermarket_search_terms;
CREATE POLICY "supermarket_search_terms_read"
  ON public.supermarket_search_terms
  FOR SELECT
  TO authenticated
  USING (true);

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

  DELETE FROM public.supermarket_search_terms;
  INSERT INTO public.supermarket_search_terms (term, products)
    SELECT term, products FROM nuevo_vocabulario;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_supermarket_search_terms(integer, integer) IS
  'Recalcula el vocabulario de busqueda del supermercado. Se llama al terminar la carga nocturna del catalogo.';
