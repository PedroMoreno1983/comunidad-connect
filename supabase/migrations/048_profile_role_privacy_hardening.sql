BEGIN;

-- Resolve the authenticated resident unit without exposing the profiles table
-- inside RLS expressions.
CREATE OR REPLACE FUNCTION public.get_my_unit_id()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT unit_id
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_my_unit_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_unit_id() TO authenticated;

-- Derive package tenancy from the selected unit. This prevents a client from
-- assigning a package to another community through a forged community_id.
CREATE OR REPLACE FUNCTION public.set_package_community_from_unit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_community_id UUID;
BEGIN
  SELECT community_id
  INTO unit_community_id
  FROM public.units
  WHERE id::TEXT = NEW.recipient_unit_id;

  IF unit_community_id IS NULL THEN
    RAISE EXCEPTION 'Package recipient unit is invalid';
  END IF;

  NEW.community_id := unit_community_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_package_community_from_unit_trigger ON public.packages;
CREATE TRIGGER set_package_community_from_unit_trigger
  BEFORE INSERT OR UPDATE OF recipient_unit_id, community_id ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION public.set_package_community_from_unit();

-- Package notifications are created server-side for every resident profile
-- linked to the destination unit. Residents can only read their own row under
-- the existing notifications_select_own policy.
CREATE OR REPLACE FUNCTION public.notify_package_residents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    category,
    title,
    body,
    link,
    read,
    community_id
  )
  SELECT
    p.id,
    'package',
    'concierge',
    'Tienes una encomienda nueva',
    'Conserjeria recibio una encomienda para tu unidad. Descripcion: ' || NEW.description,
    '/resident/packages',
    FALSE,
    NEW.community_id
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.unit_id = NEW.recipient_unit_id
    AND p.role = 'resident';

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_package_residents_trigger ON public.packages;
CREATE TRIGGER notify_package_residents_trigger
  AFTER INSERT ON public.packages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_package_residents();

-- Residents can only read packages assigned to their own unit. Staff keep the
-- existing community-wide operational policy.
DROP POLICY IF EXISTS "packages_select_multi_community" ON public.packages;
DROP POLICY IF EXISTS "packages_select_resident" ON public.packages;
DROP POLICY IF EXISTS "packages_select_resident_unit" ON public.packages;

CREATE POLICY "packages_select_resident_unit"
  ON public.packages
  FOR SELECT
  USING (
    community_id = public.get_my_community_id()
    AND public.get_my_role() = 'resident'
    AND recipient_unit_id = public.get_my_unit_id()
  );

-- Visitor logs are an operational conserjeria surface, not a resident-wide
-- directory of visits.
DROP POLICY IF EXISTS "visitor_logs_select_community" ON public.visitor_logs;
DROP POLICY IF EXISTS "visitor_logs_select_staff" ON public.visitor_logs;

CREATE POLICY "visitor_logs_select_staff"
  ON public.visitor_logs
  FOR SELECT
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() IN ('admin', 'concierge')
  );

COMMIT;
