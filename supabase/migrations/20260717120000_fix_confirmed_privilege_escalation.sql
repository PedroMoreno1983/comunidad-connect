-- Fixes three RLS/grant gaps confirmed LIVE-EXPLOITABLE against production on
-- 2026-07-17 (verified with a real resident login, not just static analysis):
--
-- 1. profiles_update_own (002_rls_policies.sql) had no WITH CHECK clause, so any
--    authenticated resident could PATCH their own row with role='admin' or a
--    different community_id and instantly gain admin access to any tenant.
--    Confirmed: logged in as a real demo resident and successfully set role='admin'
--    via the anon key + that user's own JWT, no service role involved.
-- 2. agent_memories (schema_coco_memories.sql) used FOR ALL USING (true) with no
--    TO clause, so the anon key alone (no login at all) could read/write/delete
--    every user's CoCo AI memory. Confirmed with an unauthenticated anon-key read.
-- 3. service_providers (005_fix_rls_policies.sql) allowed anon read of every
--    provider row and unrestricted authenticated write. Confirmed with an
--    unauthenticated anon-key read returning real provider names.

BEGIN;

-- ── 0. handle_new_user: pin search_path on the SECURITY DEFINER function ─────
-- Migration 035 already stopped trusting client-supplied role/community_id (it
-- resolves both from the invitation code server-side), but never pinned
-- search_path on this SECURITY DEFINER function -- do that now without
-- touching its logic, using CREATE OR REPLACE against the exact 035 body.
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 1. profiles: block privilege escalation via self-update ──────────────────
-- Column-level REVOKE is the primary fix: it blocks the `authenticated` Postgres
-- role from touching these columns regardless of any RLS policy, and does not
-- affect `service_role` (used by every legitimate signup/onboarding/admin-action
-- code path in this app), so nothing that currently works stops working.
REVOKE UPDATE (role, community_id, unit_id) ON public.profiles FROM authenticated;

-- Defense in depth: a trigger that silently reverts these columns if a request
-- somehow still reaches an UPDATE with the `authenticated` role active. Doesn't
-- query `profiles` recursively (unlike policy-level self-joins), avoiding the
-- recursion class of bug that 016_fix_rls_recursion.sql had to fix separately.
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.role := OLD.role;
    NEW.community_id := OLD.community_id;
    NEW.unit_id := OLD.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ── 2. agent_memories: restrict to service_role only ──────────────────────────
DROP POLICY IF EXISTS "Backend has full access to agent_memories" ON public.agent_memories;
CREATE POLICY "Backend has full access to agent_memories"
  ON public.agent_memories
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. service_providers: scope read to the caller's own tenant, restrict write ──
DROP POLICY IF EXISTS "service_providers_public_read" ON public.service_providers;
DROP POLICY IF EXISTS "service_providers_authenticated_write" ON public.service_providers;
DROP POLICY IF EXISTS "service_providers_tenant_read" ON public.service_providers;
DROP POLICY IF EXISTS "service_providers_service_role_write" ON public.service_providers;

CREATE POLICY "service_providers_tenant_read"
  ON public.service_providers
  FOR SELECT
  TO authenticated
  USING (
    community_id IN (
      SELECT community_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "service_providers_service_role_write"
  ON public.service_providers
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 4. Rotate the hardcoded, publicly-known demo invitation codes ────────────
-- ADMIN123/RESIDENTE123/CONSERJE123 (010_admin_invitation_codes.sql) are
-- committed in a public-facing migration file and were still active on the
-- live "Condominio Demo Principal" tenant -- anyone who reads the repo (or
-- guesses) could self-register as its admin.
UPDATE public.communities
SET
  admin_code = 'ADM-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  resident_code = 'RES-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  concierge_code = 'CNJ-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
WHERE admin_code = 'ADMIN123' OR resident_code = 'RESIDENTE123' OR concierge_code = 'CONSERJE123';

COMMIT;
