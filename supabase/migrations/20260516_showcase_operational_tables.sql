-- =====================================================
-- 20260516_showcase_operational_tables.sql
-- Operational tables required by the commercial showcase.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.water_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  reading_value numeric(10, 2) NOT NULL CHECK (reading_value >= 0),
  reading_date date NOT NULL DEFAULT CURRENT_DATE,
  month text NOT NULL,
  year integer NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (unit_id, month, year)
);

CREATE TABLE IF NOT EXISTS public.visitor_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  visitor_name text NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  entry_time timestamptz NOT NULL DEFAULT now(),
  exit_time timestamptz,
  purpose text,
  registered_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_qr boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.qr_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  resident_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  unit_id uuid REFERENCES public.units(id) ON DELETE SET NULL,
  guest_name text NOT NULL,
  guest_dni text,
  qr_code text NOT NULL UNIQUE,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS tower text NOT NULL DEFAULT 'A',
  ADD COLUMN IF NOT EXISTS unit_number text;

UPDATE public.units
SET tower = 'A'
WHERE tower IS NULL OR btrim(tower) = '';

UPDATE public.units
SET unit_number = number
WHERE unit_number IS NULL OR btrim(unit_number) = '';

CREATE INDEX IF NOT EXISTS idx_water_readings_community ON public.water_readings(community_id);
CREATE INDEX IF NOT EXISTS idx_water_readings_unit_period ON public.water_readings(unit_id, year, month);
CREATE INDEX IF NOT EXISTS idx_visitor_logs_community_entry ON public.visitor_logs(community_id, entry_time DESC);
CREATE INDEX IF NOT EXISTS idx_qr_invitations_resident ON public.qr_invitations(resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_qr_invitations_community ON public.qr_invitations(community_id);

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.current_profile_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_profile_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_water_reading_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS NULL THEN
    SELECT community_id INTO NEW.community_id
    FROM public.units
    WHERE id = NEW.unit_id;
  END IF;

  IF NEW.created_by IS NULL THEN
    NEW.created_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_water_reading_community_trigger ON public.water_readings;
CREATE TRIGGER set_water_reading_community_trigger
  BEFORE INSERT OR UPDATE ON public.water_readings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_water_reading_community();

CREATE OR REPLACE FUNCTION public.set_visitor_log_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS NULL THEN
    IF NEW.unit_id IS NOT NULL THEN
      SELECT community_id INTO NEW.community_id
      FROM public.units
      WHERE id = NEW.unit_id;
    END IF;

    IF NEW.community_id IS NULL AND NEW.registered_by IS NOT NULL THEN
      SELECT community_id INTO NEW.community_id
      FROM public.profiles
      WHERE id = NEW.registered_by;
    END IF;
  END IF;

  IF NEW.registered_by IS NULL THEN
    NEW.registered_by := auth.uid();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_visitor_log_community_trigger ON public.visitor_logs;
CREATE TRIGGER set_visitor_log_community_trigger
  BEFORE INSERT OR UPDATE ON public.visitor_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.set_visitor_log_community();

CREATE OR REPLACE FUNCTION public.set_qr_invitation_context()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS NULL OR NEW.unit_id IS NULL THEN
    SELECT community_id, unit_id
      INTO NEW.community_id, NEW.unit_id
    FROM public.profiles
    WHERE id = NEW.resident_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_qr_invitation_context_trigger ON public.qr_invitations;
CREATE TRIGGER set_qr_invitation_context_trigger
  BEFORE INSERT OR UPDATE ON public.qr_invitations
  FOR EACH ROW
  EXECUTE FUNCTION public.set_qr_invitation_context();

CREATE OR REPLACE FUNCTION public.set_notification_community()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.community_id IS NULL THEN
    SELECT community_id INTO NEW.community_id
    FROM public.profiles
    WHERE id = NEW.user_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_notification_community_trigger ON public.notifications;
CREATE TRIGGER set_notification_community_trigger
  BEFORE INSERT OR UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.set_notification_community();

UPDATE public.notifications n
SET community_id = p.community_id
FROM public.profiles p
WHERE n.user_id = p.id
  AND n.community_id IS NULL;

ALTER TABLE public.water_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "water_readings_select_community" ON public.water_readings;
CREATE POLICY "water_readings_select_community" ON public.water_readings
  FOR SELECT
  USING (community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS "water_readings_staff_write" ON public.water_readings;
CREATE POLICY "water_readings_staff_write" ON public.water_readings
  FOR ALL
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() IN ('admin', 'concierge')
  )
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() IN ('admin', 'concierge')
  );

DROP POLICY IF EXISTS "visitor_logs_select_community" ON public.visitor_logs;
CREATE POLICY "visitor_logs_select_community" ON public.visitor_logs
  FOR SELECT
  USING (community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS "visitor_logs_staff_write" ON public.visitor_logs;
CREATE POLICY "visitor_logs_staff_write" ON public.visitor_logs
  FOR ALL
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() IN ('admin', 'concierge')
  )
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() IN ('admin', 'concierge')
  );

DROP POLICY IF EXISTS "qr_invitations_select_own_or_staff" ON public.qr_invitations;
CREATE POLICY "qr_invitations_select_own_or_staff" ON public.qr_invitations
  FOR SELECT
  USING (
    community_id = public.current_profile_community_id()
    AND (resident_id = auth.uid() OR public.current_profile_role() IN ('admin', 'concierge'))
  );

DROP POLICY IF EXISTS "qr_invitations_resident_insert" ON public.qr_invitations;
CREATE POLICY "qr_invitations_resident_insert" ON public.qr_invitations
  FOR INSERT
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND resident_id = auth.uid()
  );

DROP POLICY IF EXISTS "qr_invitations_update_own_or_staff" ON public.qr_invitations;
CREATE POLICY "qr_invitations_update_own_or_staff" ON public.qr_invitations
  FOR UPDATE
  USING (
    community_id = public.current_profile_community_id()
    AND (resident_id = auth.uid() OR public.current_profile_role() IN ('admin', 'concierge'))
  )
  WITH CHECK (
    community_id = public.current_profile_community_id()
    AND (resident_id = auth.uid() OR public.current_profile_role() IN ('admin', 'concierge'))
  );

DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_community_only" ON public.notifications;
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE
  USING (user_id = auth.uid());
