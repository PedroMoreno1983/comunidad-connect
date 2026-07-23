BEGIN;

ALTER TABLE public.supermarket_group_orders
  ADD COLUMN IF NOT EXISTS selected_items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.supermarket_group_orders
  DROP CONSTRAINT IF EXISTS supermarket_group_orders_selected_items_check;

ALTER TABLE public.supermarket_group_orders
  ADD CONSTRAINT supermarket_group_orders_selected_items_check
  CHECK (jsonb_typeof(selected_items) = 'array');

COMMIT;
