-- Autonomous IoT actions are opt-in per community. A signed sensor event may
-- be accepted without granting the agent permission to mutate operational data.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS iot_autonomous_actions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS iot_autonomy_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iot_autonomy_enabled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.communities.iot_autonomous_actions_enabled IS
  'Explicit community-level authorization for CoCo to execute mutating tools from signed IoT alerts.';
