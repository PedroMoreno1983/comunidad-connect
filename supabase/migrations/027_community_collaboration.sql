-- 027_community_collaboration.sql
-- Convivencia activa: mediacion CNV, banco de tiempo, abasto comunitario y plaza social.

CREATE TABLE IF NOT EXISTS public.neighbor_mediations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL,
  target_unit TEXT NOT NULL,
  observation TEXT NOT NULL,
  feeling TEXT NOT NULL,
  need TEXT NOT NULL,
  request TEXT NOT NULL,
  drafted_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'sent', 'agreement', 'escalated')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.time_bank_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  neighbor_name TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  skill TEXT NOT NULL,
  description TEXT NOT NULL,
  availability TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 1,
  requests_count INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('tools', 'care', 'digital', 'home', 'learning', 'other')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.collective_purchase_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  supplier TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('water', 'gas', 'cleaning', 'food', 'eco', 'other')),
  unit_price INTEGER NOT NULL DEFAULT 0,
  retail_price INTEGER NOT NULL DEFAULT 0,
  minimum_participants INTEGER NOT NULL DEFAULT 1,
  participants INTEGER NOT NULL DEFAULT 1,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ready', 'ordered')),
  organizer TEXT NOT NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'otro' CHECK (area IN ('huerto', 'reciclaje', 'cuidados', 'mascotas', 'cultura', 'otro')),
  description TEXT NOT NULL,
  impact TEXT NOT NULL,
  participants INTEGER NOT NULL DEFAULT 1,
  needed TEXT NOT NULL,
  coco_insight TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('active', 'forming', 'completed')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.neighbor_mediations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_bank_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collective_purchase_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenant_neighbor_mediations_select" ON public.neighbor_mediations;
DROP POLICY IF EXISTS "tenant_neighbor_mediations_insert" ON public.neighbor_mediations;
DROP POLICY IF EXISTS "tenant_neighbor_mediations_update" ON public.neighbor_mediations;
DROP POLICY IF EXISTS "tenant_time_bank_select" ON public.time_bank_offers;
DROP POLICY IF EXISTS "tenant_time_bank_insert" ON public.time_bank_offers;
DROP POLICY IF EXISTS "tenant_time_bank_update" ON public.time_bank_offers;
DROP POLICY IF EXISTS "tenant_collective_purchases_select" ON public.collective_purchase_campaigns;
DROP POLICY IF EXISTS "tenant_collective_purchases_insert" ON public.collective_purchase_campaigns;
DROP POLICY IF EXISTS "tenant_collective_purchases_update" ON public.collective_purchase_campaigns;
DROP POLICY IF EXISTS "tenant_community_projects_select" ON public.community_projects;
DROP POLICY IF EXISTS "tenant_community_projects_insert" ON public.community_projects;
DROP POLICY IF EXISTS "tenant_community_projects_update" ON public.community_projects;

CREATE POLICY "tenant_neighbor_mediations_select" ON public.neighbor_mediations FOR SELECT USING (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_neighbor_mediations_insert" ON public.neighbor_mediations FOR INSERT WITH CHECK (
  reporter_id = auth.uid()
  AND community_id = get_my_community_id()
);
CREATE POLICY "tenant_neighbor_mediations_update" ON public.neighbor_mediations FOR UPDATE USING (
  community_id = get_my_community_id()
  AND (reporter_id = auth.uid() OR get_my_role() IN ('admin', 'concierge'))
) WITH CHECK (
  community_id = get_my_community_id()
  AND (reporter_id = auth.uid() OR get_my_role() IN ('admin', 'concierge'))
);

CREATE POLICY "tenant_time_bank_select" ON public.time_bank_offers FOR SELECT USING (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_time_bank_insert" ON public.time_bank_offers FOR INSERT WITH CHECK (
  profile_id = auth.uid()
  AND community_id = get_my_community_id()
);
CREATE POLICY "tenant_time_bank_update" ON public.time_bank_offers FOR UPDATE USING (
  community_id = get_my_community_id()
  AND (profile_id = auth.uid() OR get_my_role() IN ('admin', 'concierge'))
) WITH CHECK (
  community_id = get_my_community_id()
  AND (profile_id = auth.uid() OR get_my_role() IN ('admin', 'concierge'))
);

CREATE POLICY "tenant_collective_purchases_select" ON public.collective_purchase_campaigns FOR SELECT USING (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_collective_purchases_insert" ON public.collective_purchase_campaigns FOR INSERT WITH CHECK (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_collective_purchases_update" ON public.collective_purchase_campaigns FOR UPDATE USING (
  community_id = get_my_community_id()
) WITH CHECK (
  community_id = get_my_community_id()
);

CREATE POLICY "tenant_community_projects_select" ON public.community_projects FOR SELECT USING (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_community_projects_insert" ON public.community_projects FOR INSERT WITH CHECK (
  community_id = get_my_community_id()
);
CREATE POLICY "tenant_community_projects_update" ON public.community_projects FOR UPDATE USING (
  community_id = get_my_community_id()
) WITH CHECK (
  community_id = get_my_community_id()
);

CREATE INDEX IF NOT EXISTS idx_neighbor_mediations_community ON public.neighbor_mediations(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_time_bank_community ON public.time_bank_offers(community_id, category);
CREATE INDEX IF NOT EXISTS idx_collective_purchases_community ON public.collective_purchase_campaigns(community_id, status);
CREATE INDEX IF NOT EXISTS idx_community_projects_community ON public.community_projects(community_id, status);
