BEGIN;

ALTER TABLE public.solidarity_applications
  ADD COLUMN IF NOT EXISTS sensitive_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sensitive_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS sensitive_consent_scope TEXT;

COMMIT;
