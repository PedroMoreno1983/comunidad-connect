-- La primera version filtraba con `word_similarity(...) > 0.55`, que el
-- planificador no puede resolver con el indice de trigramas: recorria las 91.892
-- filas y tardaba entre 550 y 700 ms, mas que el `ilike` que venia a reemplazar.
--
-- El operador `<%` expresa la misma pregunta de una forma que el indice GIN si
-- entiende, con el umbral por defecto de pg_trgm. Fijar un umbral propio pedia
-- `SET pg_trgm.word_similarity_threshold`, que el rol de migraciones no tiene
-- permiso para declarar en una funcion.
CREATE OR REPLACE FUNCTION public.suggest_supermarket_names(
  p_query text,
  p_limit integer DEFAULT 60
)
RETURNS TABLE (name text, score real)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  SELECT p.name, word_similarity(p_query, p.name) AS score
  FROM public.supermarket_products p
  WHERE p.in_stock
    AND p_query <% p.name
  ORDER BY score DESC, length(p.name) ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);
$$;

COMMENT ON FUNCTION public.suggest_supermarket_names(text, integer) IS
  'Nombres de productos con una palabra parecida al texto dado (trigramas). Para corregir listas de compra mal escritas.';
