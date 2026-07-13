BEGIN;

CREATE TABLE IF NOT EXISTS public.commercial_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  admin_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  condo_name TEXT NOT NULL,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'landing_contact'
    CHECK (source IN ('landing_contact', 'commercial_tour', 'onboarding_preactivation')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'notified', 'delivery_pending', 'contacted', 'closed')),
  customer_email_sent_at TIMESTAMPTZ,
  team_email_sent_at TIMESTAMPTZ,
  customer_email_id TEXT,
  team_email_id TEXT,
  delivery_error TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commercial_leads_created_at_idx
  ON public.commercial_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_leads_status_idx
  ON public.commercial_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_leads_email_idx
  ON public.commercial_leads (LOWER(admin_email));

ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.commercial_leads FROM anon;
REVOKE ALL ON public.commercial_leads FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.commercial_leads TO service_role;

COMMIT;
