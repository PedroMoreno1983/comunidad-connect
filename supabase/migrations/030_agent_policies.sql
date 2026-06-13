-- Persisted Agent Center policies per community.
-- These settings replace client-only autonomy toggles and make the agent layer auditable.

CREATE TABLE IF NOT EXISTS public.agent_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('finance', 'maintenance', 'concierge', 'community')),
  autonomy_level TEXT NOT NULL DEFAULT 'manual'
    CHECK (autonomy_level IN ('manual', 'semi_autonomous', 'autonomous')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  max_daily_actions INTEGER NOT NULL DEFAULT 100 CHECK (max_daily_actions > 0),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (community_id, agent_key)
);

ALTER TABLE public.agent_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_policies_tenant_select" ON public.agent_policies;
CREATE POLICY "agent_policies_tenant_select" ON public.agent_policies FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "agent_policies_admin_write" ON public.agent_policies;
CREATE POLICY "agent_policies_admin_write" ON public.agent_policies FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

CREATE INDEX IF NOT EXISTS idx_agent_policies_community
  ON public.agent_policies(community_id, agent_key);
