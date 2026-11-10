-- Compra comunitaria: el total que de verdad se pagó en el supermercado.
--
-- Hasta ahora el reparto entre vecinos salía del precio de catálogo con que se
-- cerró la compra (selected_total). La boleta casi nunca coincide: precios que
-- cambiaron, un producto reemplazado, una promoción aplicada en caja. Con
-- final_total registrado, el reparto se ajusta a lo pagado y la compra queda
-- en estado 'completed' (ya permitido por supermarket_group_orders_status_check).

ALTER TABLE public.supermarket_group_orders
    ADD COLUMN IF NOT EXISTS final_total integer,
    ADD COLUMN IF NOT EXISTS purchased_at timestamp with time zone;

ALTER TABLE public.supermarket_group_orders
    DROP CONSTRAINT IF EXISTS supermarket_group_orders_final_total_check;

ALTER TABLE public.supermarket_group_orders
    ADD CONSTRAINT supermarket_group_orders_final_total_check
    CHECK (final_total IS NULL OR final_total > 0);
