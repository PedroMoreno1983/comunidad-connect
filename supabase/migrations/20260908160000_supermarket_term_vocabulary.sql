-- Vocabulario de la lista de compras: los terminos que el catalogo realmente
-- puede responder, con cuantos productos tiene cada uno.
--
-- Sirve para las dos mitades del problema con una sola consulta:
--
--   - Autocompletar mientras se escribe, proponiendo solo terminos que ya
--     devuelven productos. Una sugerencia que no encuentra nada es peor que no
--     sugerir.
--   - Corregir lo mal escrito, comparando contra esta lista corta en vez de
--     contra las 91.892 filas.
--
-- Por que no se resolvio con trigramas, que era el camino obvio y ya tiene su
-- indice: medido el 2026-09-08 contra produccion, `word_similarity` atrapa las
-- letras faltantes ("detergnte", "hgienico") pero no las transposiciones, que
-- son el error de tipeo mas comun: "lehce" y "leche" comparten un solo trigrama
-- y ningun umbral util los junta. Bajar el umbral hasta alcanzarlas traia
-- basura ("arros" devolvia "tarros" y "abridor de tarros"). Contra una lista de
-- pocos miles de terminos, la distancia de edicion resuelve las dos formas de
-- error sin ese compromiso, y se calcula en memoria.
--
-- La funcion devuelve el vocabulario entero de una vez a proposito: la app lo
-- guarda en memoria y responde sin volver a consultar. El catalogo cambia una
-- vez por noche.
CREATE OR REPLACE FUNCTION public.supermarket_term_vocabulary(
  p_min_products integer DEFAULT 3,
  p_limit integer DEFAULT 4000
)
RETURNS TABLE (term text, products bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH parts AS (
    SELECT (
      SELECT array_agg(word)
      FROM unnest(
        regexp_split_to_array(
          translate(lower(p.name), 'áéíóúüñ', 'aeiouun'),
          '[^a-z0-9]+'
        )
      ) AS word
      -- Se descartan marca-agnosticos que no acotan nada: formatos, envases y
      -- conectores. Sin esto el vocabulario se llena de "pack" y "sabor".
      WHERE length(word) > 2
        AND word !~ '^[0-9]'
        AND word <> ALL (ARRAY[
          'pack', 'packs', 'unidad', 'unidades', 'kilo', 'kilos', 'gramos',
          'litro', 'litros', 'sabor', 'tipo', 'con', 'sin', 'para', 'del',
          'los', 'las', 'una', 'uno'
        ])
    ) AS words
    FROM public.supermarket_products p
    WHERE p.in_stock
  ),
  candidates AS (
    SELECT words[1] AS term FROM parts WHERE array_length(words, 1) >= 1
    UNION ALL
    SELECT words[1] || ' ' || words[2] FROM parts WHERE array_length(words, 1) >= 2
  )
  SELECT c.term, count(*) AS products
  FROM candidates c
  WHERE c.term IS NOT NULL
  GROUP BY c.term
  HAVING count(*) >= GREATEST(COALESCE(p_min_products, 3), 1)
  ORDER BY products DESC, c.term ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 4000), 1), 20000);
$$;

COMMENT ON FUNCTION public.supermarket_term_vocabulary(integer, integer) IS
  'Terminos de busqueda que el catalogo puede responder, con su cantidad de productos. Alimenta el autocompletado y la correccion de la lista de compras.';

-- La busqueda por similitud de trigramas quedo sin uso al cambiar de enfoque.
-- Se elimina en vez de dejarla como superficie muerta que alguien reutilice
-- creyendo que corrige transposiciones, que es lo que no hace.
DROP FUNCTION IF EXISTS public.suggest_supermarket_names(text, integer);
