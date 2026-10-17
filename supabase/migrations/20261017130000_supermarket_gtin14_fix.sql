-- Corrige supermarket_normalize_gtin (migración 20261017120000) para GTIN-14.
--
-- lpad(v, 13, '0') trunca los valores de 14 dígitos, así que un GTIN-14 con
-- indicador ("17808709504252", 19 filas de Unimarc y Santa Isabel el
-- 17-oct-2026) quedaba como "1780870950425" o se descartaba como restringido,
-- distinto de normalizeGtin (TS) y normalize_gtin (Python), que lo conservan.

CREATE OR REPLACE FUNCTION public.supermarket_normalize_gtin(p_code text, p_store text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
DECLARE
  v_digits text;
  v_padded text;
BEGIN
  IF p_code IS NULL THEN
    RETURN NULL;
  END IF;
  v_digits := ltrim(regexp_replace(btrim(p_code), '[\s-]', '', 'g'), '0');
  IF v_digits = '' OR v_digits !~ '^[0-9]+$' THEN
    RETURN NULL;
  END IF;

  IF p_store = 'Lider' AND length(v_digits) BETWEEN 7 AND 12 THEN
    v_digits := v_digits || public.supermarket_gtin_check_digit(v_digits)::text;
  END IF;

  IF length(v_digits) < 8 OR length(v_digits) > 14 THEN
    RETURN NULL;
  END IF;

  IF public.supermarket_gtin_check_digit(left(v_digits, length(v_digits) - 1))
     <> right(v_digits, 1)::integer THEN
    RETURN NULL;
  END IF;

  -- lpad() de Postgres TRUNCA lo que pasa del largo pedido: un GTIN-14 con
  -- indicador ("17808709504252") quedaba cortado a 13 dígitos.
  v_padded := CASE WHEN length(v_digits) < 13 THEN lpad(v_digits, 13, '0') ELSE v_digits END;
  IF length(v_padded) = 13 AND (
    v_padded LIKE '2%'
    OR v_padded LIKE '02%'
    OR v_padded LIKE '04%'
    OR v_padded LIKE '000000%'
    OR v_padded LIKE '000002%'
  ) THEN
    RETURN NULL;
  END IF;

  RETURN v_padded;
END;
$$;

UPDATE public.supermarket_products
SET gtin = public.supermarket_normalize_gtin(ean, store)
WHERE ean IS NOT NULL
  AND length(ltrim(ean, '0')) >= 14
  AND gtin IS DISTINCT FROM public.supermarket_normalize_gtin(ean, store);
