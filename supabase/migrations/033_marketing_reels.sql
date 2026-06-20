-- 030_marketing_reels.sql
-- Persistencia para campañas, reels generados, agenda e integración Instagram.

CREATE TABLE IF NOT EXISTS marketing_reel_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'administrators',
  tone TEXT NOT NULL DEFAULT 'premium',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS marketing_reels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL,
  campaign_id UUID REFERENCES marketing_reel_campaigns(id) ON DELETE SET NULL,
  created_by UUID,
  title TEXT NOT NULL,
  objective TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'administrators',
  tone TEXT NOT NULL DEFAULT 'premium',
  duration_seconds INTEGER NOT NULL DEFAULT 35,
  feature_focus TEXT NOT NULL DEFAULT 'Agent Center',
  proof_point TEXT,
  offer TEXT,
  call_to_action TEXT,
  creative_package JSONB NOT NULL DEFAULT '{}'::jsonb,
  render_spec JSONB NOT NULL DEFAULT '{}'::jsonb,
  video_url TEXT,
  thumbnail_url TEXT,
  caption TEXT NOT NULL DEFAULT '',
  hashtags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft',
    'generated',
    'rendering',
    'rendered',
    'approved',
    'scheduled',
    'publishing',
    'published',
    'blocked',
    'failed'
  )),
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  instagram_media_id TEXT,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS instagram_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL UNIQUE,
  connected_by UUID,
  instagram_user_id TEXT,
  username TEXT,
  page_id TEXT,
  encrypted_access_token TEXT,
  token_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected', 'needs_reauth', 'disabled')),
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_reel_campaigns_community
  ON marketing_reel_campaigns(community_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_reels_community_created
  ON marketing_reels(community_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_marketing_reels_schedule
  ON marketing_reels(status, scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_instagram_connections_community
  ON instagram_connections(community_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-reels',
  'marketing-reels',
  true,
  524288000,
  ARRAY['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE marketing_reel_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read marketing campaigns" ON marketing_reel_campaigns;
CREATE POLICY "Admins can read marketing campaigns"
ON marketing_reel_campaigns FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reel_campaigns.community_id
  )
);

DROP POLICY IF EXISTS "Admins can manage marketing campaigns" ON marketing_reel_campaigns;
CREATE POLICY "Admins can manage marketing campaigns"
ON marketing_reel_campaigns FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reel_campaigns.community_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reel_campaigns.community_id
  )
);

DROP POLICY IF EXISTS "Admins can read marketing reels" ON marketing_reels;
CREATE POLICY "Admins can read marketing reels"
ON marketing_reels FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reels.community_id
  )
);

DROP POLICY IF EXISTS "Admins can manage marketing reels" ON marketing_reels;
CREATE POLICY "Admins can manage marketing reels"
ON marketing_reels FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reels.community_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = marketing_reels.community_id
  )
);

DROP POLICY IF EXISTS "Admins can read own instagram connection" ON instagram_connections;
CREATE POLICY "Admins can read own instagram connection"
ON instagram_connections FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.role = 'admin'
      AND p.community_id = instagram_connections.community_id
  )
);

DROP POLICY IF EXISTS "marketing_reels_public_read" ON storage.objects;
CREATE POLICY "marketing_reels_public_read" ON storage.objects
FOR SELECT USING (bucket_id = 'marketing-reels');
