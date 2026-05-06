-- Migration 018: CoCo case event history
-- Adds an auditable timeline for status changes and future comments.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS coco_case_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES coco_cases(id) ON DELETE CASCADE,
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('created', 'status_changed', 'comment', 'system')),
  from_status TEXT,
  to_status TEXT,
  body TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coco_case_events_case_created ON coco_case_events(case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coco_case_events_community_created ON coco_case_events(community_id, created_at DESC);

ALTER TABLE coco_case_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coco_case_events_select_community" ON coco_case_events;
CREATE POLICY "coco_case_events_select_community" ON coco_case_events FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (
    (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
    OR case_id IN (SELECT id FROM coco_cases c WHERE c.user_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "coco_case_events_insert_staff" ON coco_case_events;
CREATE POLICY "coco_case_events_insert_staff" ON coco_case_events FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);
