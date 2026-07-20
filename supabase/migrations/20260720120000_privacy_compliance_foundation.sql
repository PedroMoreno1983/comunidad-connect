-- Ley 21.719 compliance foundation: immutable consent evidence, data-subject
-- request workflow and opt-in-only WhatsApp activation.
BEGIN;

CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN (
    'terms', 'privacy_notice', 'whatsapp', 'ai_processing', 'sensitive_data'
  )),
  action TEXT NOT NULL CHECK (action IN ('granted', 'withdrawn')),
  policy_version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('signup', 'profile', 'privacy_center', 'admin_onboarding')),
  subject_email TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS privacy_consent_events_user_idx
  ON public.privacy_consent_events (user_id, consent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS privacy_consent_events_community_idx
  ON public.privacy_consent_events (community_id, created_at DESC);

ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "privacy_consent_events_select_own" ON public.privacy_consent_events;
CREATE POLICY "privacy_consent_events_select_own"
  ON public.privacy_consent_events FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.privacy_consent_events FROM anon, authenticated;
GRANT SELECT ON public.privacy_consent_events TO authenticated;
GRANT SELECT, INSERT ON public.privacy_consent_events TO service_role;

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN (
    'access', 'rectification', 'deletion', 'opposition', 'portability'
  )),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN (
    'received', 'identity_check', 'in_progress', 'completed', 'rejected', 'cancelled'
  )),
  subject_email TEXT NOT NULL,
  details TEXT,
  response_summary TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS data_subject_requests_user_idx
  ON public.data_subject_requests (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS data_subject_requests_status_idx
  ON public.data_subject_requests (status, due_at);

ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "data_subject_requests_select_own" ON public.data_subject_requests;
CREATE POLICY "data_subject_requests_select_own"
  ON public.data_subject_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.data_subject_requests FROM anon, authenticated;
GRANT SELECT ON public.data_subject_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.data_subject_requests TO service_role;

ALTER TABLE public.profiles ALTER COLUMN whatsapp_enabled SET DEFAULT FALSE;
UPDATE public.profiles SET whatsapp_enabled = FALSE WHERE whatsapp_enabled = TRUE;

COMMIT;
