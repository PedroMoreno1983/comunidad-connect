-- Twilio's webhook signature scheme has no timestamp/nonce, so a captured
-- valid request can otherwise be replayed indefinitely. Twilio's own
-- MessageSid is unique per message; recording it lets us reject replays
-- (and duplicate Twilio retries) without needing a time-window heuristic.
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  message_sid TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_processed_messages_processed_at_idx
  ON public.whatsapp_processed_messages (processed_at);

ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_processed_messages FROM anon;
REVOKE ALL ON public.whatsapp_processed_messages FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_processed_messages TO service_role;
