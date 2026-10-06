-- Requests preserve identity, tenant boundaries and lifecycle; notifications commit atomically.
BEGIN;
ALTER TABLE public.service_requests DROP CONSTRAINT service_requests_status_check;
ALTER TABLE public.service_requests ADD CONSTRAINT service_requests_status_check
CHECK (status IN ('pending','accepted','awaiting_confirmation','completed','cancelled'));

CREATE OR REPLACE FUNCTION public.guard_service_request_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.user_id AND p.community_id = NEW.community_id) THEN
      RAISE EXCEPTION 'requester-community-mismatch';
    END IF;
    IF NEW.provider_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.service_providers p WHERE p.id = NEW.provider_id
        AND (p.community_id IS NULL OR p.community_id = NEW.community_id)
    ) THEN RAISE EXCEPTION 'provider-community-mismatch'; END IF;
    IF NEW.status <> 'pending' THEN RAISE EXCEPTION 'request-must-start-pending'; END IF;
  ELSE
    IF (NEW.community_id, NEW.user_id, NEW.created_at) IS DISTINCT FROM (OLD.community_id, OLD.user_id, OLD.created_at) THEN
      RAISE EXCEPTION 'request-identity-immutable';
    END IF;
    IF NEW.provider_id IS DISTINCT FROM OLD.provider_id THEN
      IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'assignment-requires-pending'; END IF;
      IF NEW.provider_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.service_providers p WHERE p.id = NEW.provider_id
        AND (p.community_id IS NULL OR p.community_id = NEW.community_id)) THEN RAISE EXCEPTION 'provider-community-mismatch'; END IF;
    END IF;
    IF OLD.status = 'awaiting_confirmation' AND NEW.status = 'completed' AND auth.uid() IS NOT NULL AND auth.uid() <> NEW.user_id
      THEN RAISE EXCEPTION 'resident-confirmation-required'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
      (OLD.status = 'pending' AND NEW.status IN ('accepted','cancelled')) OR
      (OLD.status = 'accepted' AND NEW.status IN ('pending','awaiting_confirmation','cancelled')) OR
      (OLD.status = 'awaiting_confirmation' AND NEW.status = 'completed')
    ) THEN RAISE EXCEPTION 'invalid-request-transition'; END IF;
    IF OLD.status IN ('completed','cancelled') AND NEW IS DISTINCT FROM OLD THEN
      RAISE EXCEPTION 'closed-request-immutable';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_service_request_lifecycle() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_request_lifecycle_guard ON public.service_requests;
CREATE TRIGGER service_request_lifecycle_guard BEFORE INSERT OR UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_service_request_lifecycle();

-- Resident/provider writes go through the authenticated API. Staff assignment remains community scoped.
DROP POLICY IF EXISTS users_update_own_requests ON public.service_requests;
DROP POLICY IF EXISTS providers_update_request_status ON public.service_requests;
DROP POLICY IF EXISTS users_create_requests ON public.service_requests;
CREATE POLICY users_create_requests ON public.service_requests FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND community_id = public.get_my_community_id() AND status = 'pending');

CREATE OR REPLACE FUNCTION public.notify_service_request_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_provider_user uuid; v_provider_name text; v_actor_name text; v_responsible_count integer := 0;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.status, NEW.provider_id, NEW.preferred_date, NEW.preferred_time)
     IS NOT DISTINCT FROM (OLD.status, OLD.provider_id, OLD.preferred_date, OLD.preferred_time) THEN RETURN NEW; END IF;
  SELECT p.user_id, p.name INTO v_provider_user, v_provider_name FROM public.service_providers p WHERE p.id = NEW.provider_id;
  -- Only a linked profile in this tenant receives a tenant-specific notification.
  IF v_provider_user IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = v_provider_user AND community_id = NEW.community_id) THEN
    INSERT INTO public.notifications(user_id,type,category,title,body,link,community_id)
    VALUES (v_provider_user,'info','service_request','Solicitud de servicio: ' || NEW.status,
      NEW.description,'/services/provider-dashboard',NEW.community_id);
    v_responsible_count := 1;
  ELSE
    INSERT INTO public.notifications(user_id,type,category,title,body,link,community_id)
    SELECT id,'warning','service_request','Solicitud requiere gestión de administración',NEW.description,
      '/admin/mantenimiento',NEW.community_id FROM public.profiles
      WHERE community_id = NEW.community_id AND role IN ('admin','concierge');
    GET DIAGNOSTICS v_responsible_count = ROW_COUNT;
  END IF;
  IF TG_OP = 'INSERT' AND v_responsible_count = 0 THEN RAISE EXCEPTION 'request-has-no-responsible-profile'; END IF;
  INSERT INTO public.notifications(user_id,type,category,title,body,link,community_id)
  VALUES (NEW.user_id,'info','service_request',
    CASE NEW.status WHEN 'awaiting_confirmation' THEN 'Confirma el servicio recibido'
      WHEN 'completed' THEN 'Servicio confirmado y cerrado' WHEN 'cancelled' THEN 'Solicitud cancelada'
      WHEN 'accepted' THEN 'Solicitud aceptada' ELSE 'Solicitud registrada' END,
    COALESCE(v_provider_name,'Administración') || ': ' || NEW.description,
    '/services/my-requests',NEW.community_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.notify_service_request_lifecycle() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS service_request_lifecycle_notify ON public.service_requests;
CREATE TRIGGER service_request_lifecycle_notify AFTER INSERT OR UPDATE ON public.service_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_service_request_lifecycle();

CREATE OR REPLACE FUNCTION public.guard_participation_request_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.requester_id AND p.community_id = NEW.community_id)
      OR NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.coordinator_id AND p.community_id = NEW.community_id)
    THEN RAISE EXCEPTION 'participation-profile-community-mismatch'; END IF;
  ELSE
    IF (NEW.community_id,NEW.requester_id,NEW.coordinator_id,NEW.initiative_type,NEW.initiative_id,NEW.created_at)
      IS DISTINCT FROM (OLD.community_id,OLD.requester_id,OLD.coordinator_id,OLD.initiative_type,OLD.initiative_id,OLD.created_at)
      THEN RAISE EXCEPTION 'participation-identity-immutable'; END IF;
    IF NEW.status IS DISTINCT FROM OLD.status AND (OLD.status <> 'pending' OR NEW.status NOT IN ('accepted','rejected'))
      THEN RAISE EXCEPTION 'invalid-participation-transition'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.guard_participation_request_identity() FROM PUBLIC, anon, authenticated;
-- Alphabetical order: existing validation resolves coordinator before this guard runs.
DROP TRIGGER IF EXISTS z_participation_identity_guard ON public.community_participation_requests;
CREATE TRIGGER z_participation_identity_guard BEFORE INSERT OR UPDATE ON public.community_participation_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_participation_request_identity();
COMMIT;
