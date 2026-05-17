-- AI usage accounting and budget guardrails.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.ai_budgets (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  plan text NOT NULL DEFAULT 'pro' CHECK (plan IN ('demo', 'essential', 'pro', 'enterprise')),
  is_enabled boolean NOT NULL DEFAULT true,
  monthly_token_limit integer NOT NULL DEFAULT 1000000 CHECK (monthly_token_limit >= 0),
  monthly_image_limit integer NOT NULL DEFAULT 30 CHECK (monthly_image_limit >= 0),
  monthly_cost_limit_cents integer NOT NULL DEFAULT 2500 CHECK (monthly_cost_limit_cents >= 0),
  resident_daily_token_limit integer NOT NULL DEFAULT 8000 CHECK (resident_daily_token_limit >= 0),
  staff_daily_token_limit integer NOT NULL DEFAULT 50000 CHECK (staff_daily_token_limit >= 0),
  heavy_action_daily_limit integer NOT NULL DEFAULT 10 CHECK (heavy_action_daily_limit >= 0),
  reset_day integer NOT NULL DEFAULT 1 CHECK (reset_day BETWEEN 1 AND 28),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  role text,
  module text NOT NULL,
  provider text NOT NULL,
  model text,
  action_type text NOT NULL DEFAULT 'chat' CHECK (action_type IN ('chat', 'image', 'embedding', 'extraction', 'course', 'fallback', 'other')),
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  total_tokens integer NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  image_count integer NOT NULL DEFAULT 0 CHECK (image_count >= 0),
  estimated_cost_cents numeric(12, 4) NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'blocked', 'skipped', 'fallback')),
  blocked_reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_community_created
  ON public.ai_usage_events(community_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_user_created
  ON public.ai_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_events_module_created
  ON public.ai_usage_events(module, created_at DESC);

ALTER TABLE public.ai_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_budgets_admin_read" ON public.ai_budgets;
CREATE POLICY "ai_budgets_admin_read" ON public.ai_budgets
  FOR SELECT
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  );

DROP POLICY IF EXISTS "ai_usage_admin_read" ON public.ai_usage_events;
CREATE POLICY "ai_usage_admin_read" ON public.ai_usage_events
  FOR SELECT
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  );

CREATE OR REPLACE FUNCTION public.touch_ai_budget_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_ai_budget_updated_at_trigger ON public.ai_budgets;
CREATE TRIGGER touch_ai_budget_updated_at_trigger
  BEFORE UPDATE ON public.ai_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_ai_budget_updated_at();
