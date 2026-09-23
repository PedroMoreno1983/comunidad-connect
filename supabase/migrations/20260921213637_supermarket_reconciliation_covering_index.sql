-- Ya aplicada en producción (2026-09-21). El conteo de la conciliación de
-- Tottus recorría la tabla y se iba a ~4,5 s de los 8 s del statement timeout.
-- Este índice cubre el filtro por tienda y la ventana de last_seen_at, e
-- incluye in_stock para no volver a la tabla en el conteo.

CREATE INDEX IF NOT EXISTS supermarket_products_reconciliation_counts_idx
  ON public.supermarket_products (store, last_seen_at)
  INCLUDE (in_stock);
