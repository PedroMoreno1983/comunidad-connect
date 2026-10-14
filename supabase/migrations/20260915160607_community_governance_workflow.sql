BEGIN;

DO $$ BEGIN
  CREATE TYPE public.community_governance_status AS ENUM
    ('pending', 'approved', 'changes_requested', 'rejected', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.community_participation_status AS ENUM
    ('pending', 'accepted', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.time_bank_offers
  ADD COLUMN IF NOT EXISTS governance_status public.community_governance_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_note TEXT;

ALTER TABLE public.collective_purchase_campaigns
  ADD COLUMN IF NOT EXISTS organizer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS governance_status public.community_governance_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_note TEXT;

ALTER TABLE public.community_projects
  ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS governance_status public.community_governance_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_note TEXT;

ALTER TABLE public.supermarket_group_orders
  ADD COLUMN IF NOT EXISTS governance_status public.community_governance_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS governance_note TEXT;

-- Lo ya publicado no desaparece al desplegar el nuevo circuito.
UPDATE public.time_bank_offers
SET governance_status = 'approved', coordinator_id = COALESCE(coordinator_id, profile_id), validated_at = COALESCE(validated_at, created_at)
WHERE governance_status = 'pending' AND created_at < NOW();
UPDATE public.collective_purchase_campaigns
SET governance_status = 'approved', validated_at = COALESCE(validated_at, created_at)
WHERE governance_status = 'pending' AND created_at < NOW();
UPDATE public.community_projects
SET governance_status = 'approved', validated_at = COALESCE(validated_at, created_at)
WHERE governance_status = 'pending' AND created_at < NOW();
UPDATE public.supermarket_group_orders
SET governance_status = 'approved', coordinator_id = COALESCE(coordinator_id, created_by), validated_at = COALESCE(validated_at, created_at)
WHERE governance_status = 'pending' AND created_at < NOW();

CREATE TABLE IF NOT EXISTS public.community_participation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  initiative_type TEXT NOT NULL CHECK (initiative_type IN ('time_bank', 'collective_purchase', 'community_project')),
  initiative_id UUID NOT NULL,
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  coordinator_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  message TEXT,
  status public.community_participation_status NOT NULL DEFAULT 'pending',
  resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (initiative_type, initiative_id, requester_id)
);

CREATE INDEX IF NOT EXISTS idx_community_participation_coordinator
  ON public.community_participation_requests(coordinator_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_participation_requester
  ON public.community_participation_requests(requester_id, created_at DESC);

ALTER TABLE public.community_participation_requests ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.community_participation_requests TO authenticated;

DROP POLICY IF EXISTS tenant_time_bank_select ON public.time_bank_offers;
CREATE POLICY tenant_time_bank_select ON public.time_bank_offers FOR SELECT TO authenticated
USING (community_id = public.get_my_community_id() AND (governance_status = 'approved' OR profile_id = (SELECT auth.uid()) OR public.get_my_role() = 'admin'));
DROP POLICY IF EXISTS tenant_collective_purchases_select ON public.collective_purchase_campaigns;
CREATE POLICY tenant_collective_purchases_select ON public.collective_purchase_campaigns FOR SELECT TO authenticated
USING (community_id = public.get_my_community_id() AND (governance_status = 'approved' OR organizer_id = (SELECT auth.uid()) OR public.get_my_role() = 'admin'));
DROP POLICY IF EXISTS tenant_collective_purchases_insert ON public.collective_purchase_campaigns;
CREATE POLICY tenant_collective_purchases_insert ON public.collective_purchase_campaigns FOR INSERT TO authenticated
WITH CHECK (community_id = public.get_my_community_id() AND organizer_id = (SELECT auth.uid()) AND governance_status = 'pending');
DROP POLICY IF EXISTS tenant_community_projects_select ON public.community_projects;
CREATE POLICY tenant_community_projects_select ON public.community_projects FOR SELECT TO authenticated
USING (community_id = public.get_my_community_id() AND (governance_status = 'approved' OR creator_id = (SELECT auth.uid()) OR public.get_my_role() = 'admin'));
DROP POLICY IF EXISTS tenant_community_projects_insert ON public.community_projects;
CREATE POLICY tenant_community_projects_insert ON public.community_projects FOR INSERT TO authenticated
WITH CHECK (community_id = public.get_my_community_id() AND creator_id = (SELECT auth.uid()) AND governance_status = 'pending');

CREATE POLICY community_participation_read_parties
  ON public.community_participation_requests FOR SELECT TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (
      requester_id = (SELECT auth.uid())
      OR coordinator_id = (SELECT auth.uid())
      OR public.get_my_role() IN ('admin', 'concierge')
    )
  );
CREATE POLICY community_participation_insert_self
  ON public.community_participation_requests FOR INSERT TO authenticated
  WITH CHECK (requester_id = (SELECT auth.uid()) AND community_id = public.get_my_community_id());
CREATE POLICY community_participation_update_coordinator_admin
  ON public.community_participation_requests FOR UPDATE TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (coordinator_id = (SELECT auth.uid()) OR public.get_my_role() = 'admin')
  )
  WITH CHECK (community_id = public.get_my_community_id());

CREATE OR REPLACE FUNCTION public.notify_community_admins(
  p_community_id UUID, p_title TEXT, p_body TEXT, p_link TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications(user_id, type, category, title, body, link, community_id)
  SELECT id, 'info', 'community', p_title, p_body, p_link, p_community_id
  FROM public.profiles
  WHERE community_id = p_community_id AND role = 'admin';
END;
$$;
REVOKE ALL ON FUNCTION public.notify_community_admins(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.community_initiative_created_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_title TEXT;
BEGIN
  IF TG_TABLE_NAME = 'time_bank_offers' THEN v_title := NEW.skill;
  ELSE v_title := NEW.title;
  END IF;
  PERFORM public.notify_community_admins(
    NEW.community_id,
    'Iniciativa pendiente de validación',
    v_title || ' necesita coordinador y aprobación de Administración.',
    '/admin/convivencia'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_initiative_created_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_bank_governance_notify ON public.time_bank_offers;
CREATE TRIGGER time_bank_governance_notify AFTER INSERT ON public.time_bank_offers
FOR EACH ROW EXECUTE FUNCTION public.community_initiative_created_notification();
DROP TRIGGER IF EXISTS collective_purchase_governance_notify ON public.collective_purchase_campaigns;
CREATE TRIGGER collective_purchase_governance_notify AFTER INSERT ON public.collective_purchase_campaigns
FOR EACH ROW EXECUTE FUNCTION public.community_initiative_created_notification();
DROP TRIGGER IF EXISTS community_project_governance_notify ON public.community_projects;
CREATE TRIGGER community_project_governance_notify AFTER INSERT ON public.community_projects
FOR EACH ROW EXECUTE FUNCTION public.community_initiative_created_notification();
DROP TRIGGER IF EXISTS supermarket_group_governance_notify ON public.supermarket_group_orders;
CREATE TRIGGER supermarket_group_governance_notify AFTER INSERT ON public.supermarket_group_orders
FOR EACH ROW EXECUTE FUNCTION public.community_initiative_created_notification();

CREATE OR REPLACE FUNCTION public.community_initiative_reviewed_notification()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner UUID; v_title TEXT;
BEGIN
  IF NEW.governance_status IS NOT DISTINCT FROM OLD.governance_status THEN RETURN NEW; END IF;
  IF TG_TABLE_NAME = 'time_bank_offers' THEN v_owner := NEW.profile_id; v_title := NEW.skill;
  ELSIF TG_TABLE_NAME = 'collective_purchase_campaigns' THEN v_owner := NEW.organizer_id; v_title := NEW.title;
  ELSIF TG_TABLE_NAME = 'community_projects' THEN v_owner := NEW.creator_id; v_title := NEW.title;
  ELSE v_owner := NEW.created_by; v_title := NEW.title;
  END IF;
  IF v_owner IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, type, category, title, body, link, community_id)
    VALUES (
      v_owner,
      CASE WHEN NEW.governance_status = 'approved' THEN 'success' ELSE 'info' END,
      'community', 'Administración revisó tu iniciativa',
      CASE WHEN NEW.governance_status = 'approved'
        THEN v_title || ' fue validada. El coordinador ya puede recibir solicitudes.'
        ELSE v_title || ' quedó con estado ' || NEW.governance_status::TEXT || COALESCE(': ' || NEW.governance_note, '.') END,
      '/convivencia', NEW.community_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_initiative_reviewed_notification() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER time_bank_review_notify AFTER UPDATE OF governance_status ON public.time_bank_offers FOR EACH ROW EXECUTE FUNCTION public.community_initiative_reviewed_notification();
CREATE TRIGGER collective_purchase_review_notify AFTER UPDATE OF governance_status ON public.collective_purchase_campaigns FOR EACH ROW EXECUTE FUNCTION public.community_initiative_reviewed_notification();
CREATE TRIGGER community_project_review_notify AFTER UPDATE OF governance_status ON public.community_projects FOR EACH ROW EXECUTE FUNCTION public.community_initiative_reviewed_notification();
CREATE TRIGGER supermarket_group_review_notify AFTER UPDATE OF governance_status ON public.supermarket_group_orders FOR EACH ROW EXECUTE FUNCTION public.community_initiative_reviewed_notification();

DROP POLICY IF EXISTS tenant_time_bank_update ON public.time_bank_offers;
CREATE POLICY tenant_time_bank_update ON public.time_bank_offers FOR UPDATE TO authenticated
USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin')
WITH CHECK (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
DROP POLICY IF EXISTS tenant_collective_purchases_update ON public.collective_purchase_campaigns;
CREATE POLICY tenant_collective_purchases_update ON public.collective_purchase_campaigns FOR UPDATE TO authenticated
USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin')
WITH CHECK (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
DROP POLICY IF EXISTS tenant_community_projects_update ON public.community_projects;
CREATE POLICY tenant_community_projects_update ON public.community_projects FOR UPDATE TO authenticated
USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin')
WITH CHECK (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');

CREATE OR REPLACE FUNCTION public.community_participation_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_status public.community_governance_status; v_coordinator UUID; v_title TEXT;
BEGIN
  IF NEW.initiative_type = 'time_bank' THEN
    SELECT governance_status, coordinator_id, skill INTO v_status, v_coordinator, v_title
    FROM public.time_bank_offers WHERE id = NEW.initiative_id AND community_id = NEW.community_id;
  ELSIF NEW.initiative_type = 'collective_purchase' THEN
    SELECT governance_status, coordinator_id, title INTO v_status, v_coordinator, v_title
    FROM public.collective_purchase_campaigns WHERE id = NEW.initiative_id AND community_id = NEW.community_id;
  ELSE
    SELECT governance_status, coordinator_id, title INTO v_status, v_coordinator, v_title
    FROM public.community_projects WHERE id = NEW.initiative_id AND community_id = NEW.community_id;
  END IF;
  IF v_status IS DISTINCT FROM 'approved' OR v_coordinator IS NULL THEN
    RAISE EXCEPTION 'initiative-not-approved';
  END IF;
  IF v_coordinator = NEW.requester_id THEN RAISE EXCEPTION 'coordinator-cannot-request'; END IF;
  NEW.coordinator_id := v_coordinator;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_participation_before_insert() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.community_participation_after_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name TEXT;
BEGIN
  SELECT COALESCE(name, 'Un vecino') INTO v_name FROM public.profiles WHERE id = NEW.requester_id;
  INSERT INTO public.notifications(user_id, type, category, title, body, link, community_id)
  VALUES (NEW.coordinator_id, 'info', 'community', 'Nueva solicitud de participación', v_name || ' quiere sumarse a tu iniciativa.', '/convivencia', NEW.community_id);
  IF NEW.initiative_type = 'time_bank' THEN
    UPDATE public.time_bank_offers SET requests_count = requests_count + 1 WHERE id = NEW.initiative_id;
  ELSIF NEW.initiative_type = 'collective_purchase' THEN
    UPDATE public.collective_purchase_campaigns SET participants = participants + 1 WHERE id = NEW.initiative_id;
  ELSE
    UPDATE public.community_projects SET participants = participants + 1 WHERE id = NEW.initiative_id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_participation_after_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER community_participation_validate BEFORE INSERT ON public.community_participation_requests
FOR EACH ROW EXECUTE FUNCTION public.community_participation_before_insert();
CREATE TRIGGER community_participation_notify AFTER INSERT ON public.community_participation_requests
FOR EACH ROW EXECUTE FUNCTION public.community_participation_after_insert();

CREATE OR REPLACE FUNCTION public.community_participation_after_update()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications(user_id, type, category, title, body, link, community_id)
    VALUES (
      NEW.requester_id,
      CASE WHEN NEW.status = 'accepted' THEN 'success' ELSE 'info' END,
      'community',
      'Solicitud de participación actualizada',
      CASE WHEN NEW.status = 'accepted' THEN 'El coordinador aceptó tu solicitud y ya pueden coordinar.'
           WHEN NEW.status = 'rejected' THEN 'El coordinador no pudo aceptar tu solicitud en esta ocasión.'
           ELSE 'Tu solicitud cambió de estado.' END,
      '/convivencia', NEW.community_id
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.community_participation_after_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER community_participation_status_notify AFTER UPDATE ON public.community_participation_requests
FOR EACH ROW EXECUTE FUNCTION public.community_participation_after_update();

COMMIT;
