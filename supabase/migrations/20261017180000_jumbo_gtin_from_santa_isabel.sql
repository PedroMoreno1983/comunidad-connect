-- Jumbo hereda el GTIN de Santa Isabel cuando el nombre es idéntico.
--
-- Jumbo y Santa Isabel son de Cencosud y publican los mismos nombres de
-- producto. Las filas de Jumbo que siguen sin GTIN (respaldo JSON-LD sin EAN,
-- ~8.700 el 17-oct-2026) toman el de una fila de Santa Isabel con el mismo
-- nombre normalizado (minúsculas, espacios colapsados, igual que _same_name en
-- scripts/jumbo_vtex_ean.py), solo si ese nombre apunta a UN único GTIN.
--
-- El trigger supermarket_products_set_gtin revalida el valor, y como el upsert
-- del crawl no escribe `gtin`, el valor heredado sobrevive a las corridas
-- siguientes mientras la fila no traiga su propio EAN. El crawl de Jumbo llama
-- a esta función al terminar para cubrir las filas nuevas.

CREATE OR REPLACE FUNCTION public.inherit_jumbo_gtin_from_santa_isabel()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
SET statement_timeout TO '60s'
AS $$
DECLARE
  v_updated integer;
BEGIN
  WITH santa AS (
    SELECT
      lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS name_key,
      min(gtin) AS gtin
    FROM public.supermarket_products
    WHERE store = 'Santa Isabel'
      AND gtin IS NOT NULL
    GROUP BY 1
    HAVING count(DISTINCT gtin) = 1
  )
  UPDATE public.supermarket_products AS jumbo
  SET gtin = santa.gtin
  FROM santa
  WHERE jumbo.store = 'Jumbo'
    AND jumbo.in_stock
    AND jumbo.gtin IS NULL
    AND lower(regexp_replace(btrim(jumbo.name), '\s+', ' ', 'g')) = santa.name_key;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.inherit_jumbo_gtin_from_santa_isabel() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inherit_jumbo_gtin_from_santa_isabel() FROM anon;
REVOKE ALL ON FUNCTION public.inherit_jumbo_gtin_from_santa_isabel() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.inherit_jumbo_gtin_from_santa_isabel() TO service_role;

SELECT public.inherit_jumbo_gtin_from_santa_isabel();
