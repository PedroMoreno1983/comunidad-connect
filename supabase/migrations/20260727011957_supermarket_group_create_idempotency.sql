ALTER TABLE public.supermarket_group_orders
  ADD COLUMN IF NOT EXISTS client_request_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS uq_supermarket_group_orders_create_request
  ON public.supermarket_group_orders (created_by, client_request_id)
  WHERE client_request_id IS NOT NULL;

COMMENT ON COLUMN public.supermarket_group_orders.client_request_id IS
  'Client-generated UUID used to make group-order creation idempotent across retries.';

