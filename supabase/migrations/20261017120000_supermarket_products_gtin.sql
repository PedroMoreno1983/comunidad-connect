-- GTIN canónico para cruzar el mismo producto entre supermercados.
--
-- Hasta ahora el comparador cruzaba tiendas solo por nombre y la columna `ean`
-- quedaba sin usar: cada cadena la guarda distinto. Lider (y por herencia del
-- scraper, su sku) usa 14 dígitos con ceros a la izquierda y SIN dígito
-- verificador ("00780462162162" = 780462162162 + DV); Santa Isabel, Unimarc y
-- aCuenta guardan el EAN-13/UPC-A completo. Medido el 17-oct-2026: normalizado,
-- los códigos compartidos por 2+ tiendas pasan de 5.314 a ~7.700.
--
-- Regla (misma que src/lib/supermarketGtin.ts y scripts/supermarket_gtin.py):
--   1. Solo dígitos; se quitan los ceros a la izquierda.
--   2. Lider: si quedan <= 12 dígitos, se le calcula y agrega el DV.
--   3. Menos de 8 dígitos (PLU internos) -> NULL.
--   4. DV inválido -> NULL.
--   5. Códigos de circulación restringida (pesables y de uso interno: GTIN-13
--      2x, UPC 2x/4x, EAN-8 0x/2x) -> NULL; cada cadena los reutiliza.
--   6. Resultado: GTIN-13 con ceros a la izquierda, o GTIN-14 si trae indicador.

CREATE OR REPLACE FUNCTION public.supermarket_gtin_check_digit(p_body text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO ''
AS $$
  SELECT (10 - (
    SUM(
      substr(reverse(p_body), position_index, 1)::integer
      * CASE WHEN position_index % 2 = 1 THEN 3 ELSE 1 END
    ) % 10
  )) % 10
  FROM generate_series(1, length(p_body)) AS position_index;
$$;

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

  v_padded := lpad(v_digits, 13, '0');
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

ALTER TABLE public.supermarket_products
  ADD COLUMN IF NOT EXISTS gtin text;

COMMENT ON COLUMN public.supermarket_products.gtin IS
  'GTIN-13/14 canónico derivado de ean (Lider sin DV se completa). Lo llena el trigger supermarket_products_set_gtin.';

-- El trigger cubre todas las vías de escritura (ingest_supermarket_snapshot,
-- refresh en vivo, backfills) sin tocar la RPC de ingesta. Si alguien envía
-- `gtin` explícito sin `ean`, se valida igual.
CREATE OR REPLACE FUNCTION public.supermarket_products_set_gtin()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  NEW.gtin := COALESCE(
    public.supermarket_normalize_gtin(NEW.ean, NEW.store),
    public.supermarket_normalize_gtin(NEW.gtin, NULL)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS supermarket_products_set_gtin ON public.supermarket_products;
CREATE TRIGGER supermarket_products_set_gtin
  BEFORE INSERT OR UPDATE OF ean, gtin, store ON public.supermarket_products
  FOR EACH ROW
  EXECUTE FUNCTION public.supermarket_products_set_gtin();

UPDATE public.supermarket_products
SET gtin = public.supermarket_normalize_gtin(ean, store)
WHERE ean IS NOT NULL
  AND gtin IS DISTINCT FROM public.supermarket_normalize_gtin(ean, store);

CREATE INDEX IF NOT EXISTS supermarket_products_gtin_idx
  ON public.supermarket_products (gtin, store)
  WHERE gtin IS NOT NULL AND in_stock;
