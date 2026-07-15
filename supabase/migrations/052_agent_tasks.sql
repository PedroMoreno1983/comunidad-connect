-- Persistent execution layer for Agent Center goals and verified steps.
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  agent_key TEXT NOT NULL CHECK (agent_key IN ('finance', 'maintenance', 'concierge', 'community')),
  playbook_key TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'running', 'waiting_human', 'completed', 'failed', 'escalated', 'cancelled')),
  current_step INTEGER NOT NULL DEFAULT 0 CHECK (current_step >= 0),
  retry_count INTEGER NOT NULL DEFAULT 0 CHECK (retry_count >= 0),
  max_retries INTEGER NOT NULL DEFAULT 1 CHECK (max_retries BETWEEN 0 AND 5),
  context JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_error TEXT,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.agent_task_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.agent_tasks(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  step_key TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'waiting_human', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  output JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (task_id, position),
  UNIQUE (task_id, step_key)
);

ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_task_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agent_tasks_tenant_select" ON public.agent_tasks;
CREATE POLICY "agent_tasks_tenant_select" ON public.agent_tasks FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "agent_tasks_admin_write" ON public.agent_tasks;
CREATE POLICY "agent_tasks_admin_write" ON public.agent_tasks FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

DROP POLICY IF EXISTS "agent_task_steps_tenant_select" ON public.agent_task_steps;
CREATE POLICY "agent_task_steps_tenant_select" ON public.agent_task_steps FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.agent_tasks task
    WHERE task.id = task_id
      AND task.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
);

DROP POLICY IF EXISTS "agent_task_steps_admin_write" ON public.agent_task_steps;
CREATE POLICY "agent_task_steps_admin_write" ON public.agent_task_steps FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.agent_tasks task
    WHERE task.id = task_id
      AND task.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agent_tasks task
    WHERE task.id = task_id
      AND task.community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
      AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
);

CREATE INDEX IF NOT EXISTS idx_agent_tasks_community_status_updated
  ON public.agent_tasks(community_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_next_run
  ON public.agent_tasks(next_run_at) WHERE status IN ('planned', 'failed');
CREATE INDEX IF NOT EXISTS idx_agent_task_steps_task_position
  ON public.agent_task_steps(task_id, position);
