-- Citófono digital: conserjería "llama" a la unidad y el residente aprueba o
-- rechaza la visita desde la app antes de que entre. La respuesta se graba con
-- un UPDATE condicionado a status = 'ringing', así dos residentes del mismo
-- departamento no pueden contestar distinto la misma llamada.
BEGIN;

CREATE TABLE IF NOT EXISTS public.intercom_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  visitor_name text NOT NULL CHECK (char_length(btrim(visitor_name)) BETWEEN 2 AND 120),
  visit_kind text NOT NULL DEFAULT 'visit' CHECK (visit_kind IN ('visit', 'delivery', 'service', 'other')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  status text NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'approved', 'rejected', 'cancelled', 'expired', 'admitted')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  answered_at timestamptz,
  expires_at timestamptz NOT NULL,
  visitor_log_id uuid REFERENCES public.visitor_logs(id) ON DELETE SET NULL,
  gate_status text CHECK (gate_status IS NULL OR gate_status IN ('opened', 'failed', 'not_configured')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS intercom_calls_community_recent_idx
  ON public.intercom_calls (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS intercom_calls_unit_ringing_idx
  ON public.intercom_calls (unit_id) WHERE status = 'ringing';
ALTER TABLE public.intercom_calls ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.intercom_calls FROM anon, authenticated;
GRANT ALL ON public.intercom_calls TO service_role;

-- Portón o barrera: cualquier controlador que reciba un POST firmado (HMAC
-- SHA-256) puede abrir al aprobar una visita. El secreto nunca vuelve al cliente.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS access_webhook_url text
    CHECK (access_webhook_url IS NULL OR access_webhook_url ~ '^https://'),
  ADD COLUMN IF NOT EXISTS access_webhook_secret text;

COMMIT;
