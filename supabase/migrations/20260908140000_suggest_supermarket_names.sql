-- Corregir una lista mal escrita no se puede hacer por prefijo: quien escribe
-- "lehce" no comparte ni las tres primeras letras con "leche". `word_similarity`
-- compara el texto tecleado contra cada palabra del nombre del producto, que es
-- justo la forma de la pregunta ("¿que palabra del catalogo se parece a esto?"),
-- y se apoya en el indice de trigramas de la migracion anterior.
--
-- Va como funcion porque PostgREST no sabe expresar `word_similarity` en un
-- filtro; el resto de la busqueda del catalogo sigue por consulta normal.
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
    AND word_similarity(p_query, p.name) > 0.55
  ORDER BY score DESC, length(p.name) ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 60), 1), 200);
$$;

COMMENT ON FUNCTION public.suggest_supermarket_names(text, integer) IS
  'Nombres de productos cuya palabra mas parecida supera el umbral de similitud con el texto dado. Para corregir listas de compra mal escritas.';
