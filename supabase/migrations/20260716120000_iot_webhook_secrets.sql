-- Per-community IoT webhook secret. Nullable/opt-in: communities without one
-- fall back to the legacy global IOT_WEBHOOK_SECRET env var so existing
-- deployed gateways keep working during rollout, but a stolen device secret
-- can no longer be used to spoof sensor events for OTHER communities once a
-- per-community secret is set.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS iot_webhook_secret TEXT;
