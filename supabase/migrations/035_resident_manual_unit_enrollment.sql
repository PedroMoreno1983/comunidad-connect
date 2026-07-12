-- Ensure manually registered residents are linked to a real unit.
-- This keeps invite-code signup useful even when the admin has not imported a roster first.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_number TEXT;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_name TEXT;
  v_role TEXT;
  v_invite_code TEXT;
  v_department TEXT;
  v_unit_id UUID;
  v_tower TEXT;
  v_floor INTEGER;
  v_numeric_part TEXT;
BEGIN
  -- Never trust role or community_id supplied by the browser. The invitation
  -- code is resolved again inside PostgreSQL for every auth user creation.
  v_invite_code := UPPER(BTRIM(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')));

  SELECT c.id,
         CASE
           WHEN c.resident_code = v_invite_code THEN 'resident'
           WHEN c.concierge_code = v_invite_code THEN 'concierge'
           WHEN c.admin_code = v_invite_code THEN 'admin'
         END
    INTO v_community_id, v_role
  FROM public.communities c
  WHERE c.resident_code = v_invite_code
     OR c.concierge_code = v_invite_code
     OR c.admin_code = v_invite_code
  LIMIT 1;

  IF v_community_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'A valid invitation code is required';
  END IF;

  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );
  v_department := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'department_number',
    NEW.raw_user_meta_data->>'unit_number',
    ''
  )), '');

  INSERT INTO public.profiles (id, name, full_name, email, role, community_id, department_number)
  VALUES (NEW.id, v_name, v_name, NEW.email, v_role, v_community_id, v_department)
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    role = EXCLUDED.role,
    community_id = EXCLUDED.community_id,
    department_number = COALESCE(public.profiles.department_number, EXCLUDED.department_number);

  IF v_role = 'resident' AND v_department IS NOT NULL THEN
    SELECT id INTO v_unit_id
    FROM public.units
    WHERE community_id = v_community_id
      AND number = v_department
    LIMIT 1;

    IF v_unit_id IS NULL THEN
      v_tower := COALESCE((regexp_match(v_department, '^(?:torre\s*)?([A-Za-z])[-\s]?'))[1], 'A');
      v_numeric_part := (regexp_match(v_department, '\d+'))[1];
      v_floor := CASE
        WHEN v_numeric_part IS NOT NULL AND v_numeric_part::INTEGER >= 100 THEN GREATEST(1, FLOOR(v_numeric_part::INTEGER / 100)::INTEGER)
        ELSE 1
      END;

      INSERT INTO public.units (community_id, tower, number, floor, type, owner_id, resident_profile_id)
      VALUES (v_community_id, UPPER(v_tower), v_department, v_floor, 'apartment', NEW.id, NEW.id)
      RETURNING id INTO v_unit_id;
    ELSE
      UPDATE public.units
      SET owner_id = COALESCE(owner_id, NEW.id),
          resident_profile_id = COALESCE(resident_profile_id, NEW.id)
      WHERE id = v_unit_id;
    END IF;

    UPDATE public.profiles
    SET unit_id = v_unit_id,
        department_number = v_department
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Invitation codes must never be enumerable through the public anon client.
DROP POLICY IF EXISTS "Public can view community by code" ON public.communities;
DROP POLICY IF EXISTS "Authenticated users can view own community" ON public.communities;
CREATE POLICY "Authenticated users can view own community"
  ON public.communities
  FOR SELECT
  TO authenticated
  USING (id = public.get_my_community_id());
