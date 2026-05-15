-- ============================================
-- OPERATIONAL AUDIT TRAIL
-- Critical product actions with tenant isolation
-- ============================================

CREATE TABLE IF NOT EXISTS operation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'success', 'warning', 'error')),
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'blocked', 'pending')),
  summary TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  request_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_events_community_created
  ON operation_events(community_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_events_action
  ON operation_events(action);

CREATE INDEX IF NOT EXISTS idx_operation_events_severity_status
  ON operation_events(severity, status, created_at DESC);

ALTER TABLE operation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read own community operation events" ON operation_events;
CREATE POLICY "Admins can read own community operation events"
ON operation_events FOR SELECT
USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "Authenticated users can insert own community operation events" ON operation_events;
CREATE POLICY "Authenticated users can insert own community operation events"
ON operation_events FOR INSERT
WITH CHECK (
  community_id = get_my_community_id()
);
