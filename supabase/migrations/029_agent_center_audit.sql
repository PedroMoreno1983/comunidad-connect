-- Agent Center audit trail for the GaaS transition.
-- The app treats these tables as best-effort so production keeps working
-- even before this migration is applied.

CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  agent_key TEXT NOT NULL,
  intent TEXT NOT NULL,
  user_message TEXT NOT NULL,
  autonomy_level TEXT NOT NULL DEFAULT 'manual'
    CHECK (autonomy_level IN ('manual', 'semi_autonomous', 'autonomous')),
  status TEXT NOT NULL DEFAULT 'preview'
    CHECK (status IN ('preview', 'awaiting_confirmation', 'executed', 'rejected', 'failed')),
  summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.agent_tool_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  args JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_confirmation BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'executed', 'failed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  executed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.agent_action_approvals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  tool_call_id UUID REFERENCES public.agent_tool_calls(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.agent_activity_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_key TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_action_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_tenant_select" ON public.agent_runs FOR SELECT USING (
  user_id = auth.uid()
  OR community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "agent_tool_calls_tenant_select" ON public.agent_tool_calls FOR SELECT USING (
  user_id = auth.uid()
  OR community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "agent_action_approvals_tenant_select" ON public.agent_action_approvals FOR SELECT USING (
  user_id = auth.uid()
  OR community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "agent_activity_log_tenant_select" ON public.agent_activity_log FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_user_created ON public.agent_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_runs_community_created ON public.agent_runs(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tool_calls_run ON public.agent_tool_calls(run_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_log_community_created ON public.agent_activity_log(community_id, created_at DESC);
