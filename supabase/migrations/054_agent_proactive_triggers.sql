-- Proactive, deduplicated Agent Center signals. Triggered work always becomes
-- an auditable proposal and still requires human confirmation before writes.
CREATE TABLE IF NOT EXISTS public.agent_trigger_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('finance', 'maintenance', 'concierge', 'community')),
  playbook_key TEXT NOT NULL,
  name TEXT NOT NULL,
  signal_key TEXT NOT NULL CHECK (signal_key IN ('overdue_expenses', 'maintenance_backlog', 'onboarding_gap', 'emergency_readiness')),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  interval_minutes INTEGER NOT NULL DEFAULT 1440 CHECK (interval_minutes BETWEEN 15 AND 43200),
  cooldown_minutes INTEGER NOT NULL DEFAULT 720 CHECK (cooldown_minutes BETWEEN 15 AND 43200),
  threshold JSONB NOT NULL DEFAULT '{"minimum":1}'::jsonb,
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_evaluated_at TIMESTAMPTZ,
  last_triggered_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, signal_key)
);

CREATE TABLE IF NOT EXISTS public.agent_trigger_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id UUID NOT NULL REFERENCES public.agent_trigger_rules(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  signal_key TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  metric NUMERIC NOT NULL DEFAULT 0,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'detected' CHECK (status IN ('detected', 'proposal_created', 'skipped', 'failed')),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  tool_call_id UUID REFERENCES public.agent_tool_calls(id) ON DELETE SET NULL,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

ALTER TABLE public.agent_trigger_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_trigger_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_trigger_rules_admin" ON public.agent_trigger_rules;
CREATE POLICY "agent_trigger_rules_admin" ON public.agent_trigger_rules FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "agent_trigger_events_admin" ON public.agent_trigger_events;
CREATE POLICY "agent_trigger_events_admin" ON public.agent_trigger_events FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE INDEX IF NOT EXISTS idx_agent_trigger_rules_due
  ON public.agent_trigger_rules(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_agent_trigger_events_community_created
  ON public.agent_trigger_events(community_id, created_at DESC);

INSERT INTO public.agent_trigger_rules (
  id, community_id, agent_key, playbook_key, name, signal_key,
  interval_minutes, cooldown_minutes, threshold
)
SELECT * FROM (VALUES
  ('b392cf17-0700-4000-8000-000000000001'::uuid, 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid, 'finance', 'finance_collection_review', 'Morosidad que requiere revision', 'overdue_expenses', 1440, 720, '{"minimum":1}'::jsonb),
  ('b392cf17-0700-4000-8000-000000000002'::uuid, 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid, 'maintenance', 'maintenance_ticket_triage', 'Tickets vencidos o estancados', 'maintenance_backlog', 360, 180, '{"minimum":1}'::jsonb),
  ('b392cf17-0700-4000-8000-000000000003'::uuid, 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid, 'community', 'onboarding_import_review', 'Brecha entre unidades y residentes', 'onboarding_gap', 1440, 720, '{"minimum":1}'::jsonb),
  ('b392cf17-0700-4000-8000-000000000004'::uuid, 'b392cf17-fd6b-47dd-b0b4-72b0e007824e'::uuid, 'maintenance', 'iot_emergency_readiness', 'Preparacion operativa incompleta', 'emergency_readiness', 720, 360, '{"minimum":1}'::jsonb)
) AS seed(id, community_id, agent_key, playbook_key, name, signal_key, interval_minutes, cooldown_minutes, threshold)
WHERE EXISTS (SELECT 1 FROM public.communities community WHERE community.id = seed.community_id)
ON CONFLICT (community_id, signal_key) DO NOTHING;
