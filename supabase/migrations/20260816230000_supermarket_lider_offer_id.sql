-- Lider: offer_id y sales_unit para poder cargar el carro por API.
--
-- La mutacion `updateItems` del BFF Orchestra de Walmart exige `offerId` ademas
-- del `usItemId` (que es el mismo string que ya guardamos en `sku`). Son
-- identificadores distintos: para el SKU 00780433000693 el offerId es 821920.
-- Sin esta columna la carga solo puede hacerse recorriendo la interfaz, producto
-- por producto y con una navegacion completa por cada uno.
--
-- Contrato observado en extensions/convive-cart-loader/ADAPTADORES.md.
--
-- Ambas columnas son TEXT y nullable a proposito:
--   * TEXT porque los identificadores de Walmart llevan ceros a la izquierda y
--     convertirlos a numero destruye el codigo.
--   * Nullable porque solo se pueblan para Lider.
--
-- APLICADA en produccion el 2026-08-17 desde el SQL Editor.

ALTER TABLE public.supermarket_products
  ADD COLUMN IF NOT EXISTS offer_id TEXT,
  ADD COLUMN IF NOT EXISTS sales_unit TEXT;

COMMENT ON COLUMN public.supermarket_products.offer_id IS
  'Lider/Walmart: offerId exigido por la mutacion updateItems. Distinto del sku.';

COMMENT ON COLUMN public.supermarket_products.sales_unit IS
  'Unidad de venta que espera la tienda al agregar al carro (EACH, etc).';

CREATE INDEX IF NOT EXISTS supermarket_products_missing_offer_id_idx
  ON public.supermarket_products (store, sku)
  WHERE offer_id IS NULL;
