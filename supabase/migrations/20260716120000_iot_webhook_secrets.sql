-- Per-community IoT webhook secret. Every active IoT community must use an
-- independent value; the application no longer accepts a shared fallback.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS iot_webhook_secret TEXT;
