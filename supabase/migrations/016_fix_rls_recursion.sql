-- =====================================================
-- MIGRATION: 016_fix_rls_recursion.sql
-- Fix infinite recursion in RLS policies caused by
-- profiles table referencing itself inside its own policy.
-- Solution: Use a SECURITY DEFINER function that bypasses RLS.
-- =====================================================

-- Create a helper function that gets community_id without triggering RLS
-- SECURITY DEFINER means it runs with the privileges of the function owner (postgres),
-- bypassing RLS on the profiles table and preventing infinite recursion.
CREATE OR REPLACE FUNCTION get_my_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Create a helper function that gets role without triggering RLS
CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- =====================================================
-- DROP and RECREATE all policies using the helper functions
-- =====================================================

-- 1. PROFILES
DROP POLICY IF EXISTS "profiles_select_community_only" ON profiles;
DROP POLICY IF EXISTS "profiles_update_community_admin" ON profiles;

CREATE POLICY "profiles_select_community_only" ON profiles FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "profiles_update_community_admin" ON profiles FOR UPDATE USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

-- 2. UNITS
DROP POLICY IF EXISTS "units_select_community_only" ON units;
DROP POLICY IF EXISTS "units_admin_community_only" ON units;

CREATE POLICY "units_select_community_only" ON units FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "units_admin_community_only" ON units FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

-- 3. EXPENSES
DROP POLICY IF EXISTS "expenses_admin_community_only" ON expenses;

CREATE POLICY "expenses_admin_community_only" ON expenses FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

-- 4. AMENITIES
DROP POLICY IF EXISTS "amenities_select_community_only" ON amenities;
DROP POLICY IF EXISTS "amenities_admin_community_only" ON amenities;

CREATE POLICY "amenities_select_community_only" ON amenities FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "amenities_admin_community_only" ON amenities FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

-- 5. BOOKINGS
DROP POLICY IF EXISTS "bookings_admin_community_only" ON bookings;

CREATE POLICY "bookings_admin_community_only" ON bookings FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

-- 6. VISITORS
DROP POLICY IF EXISTS "visitors_select_community_only" ON visitors;
DROP POLICY IF EXISTS "visitors_all_staff_community" ON visitors;

CREATE POLICY "visitors_select_community_only" ON visitors FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "visitors_all_staff_community" ON visitors FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() IN ('admin', 'concierge')
);

-- 7. PACKAGES
DROP POLICY IF EXISTS "packages_select_multi_community" ON packages;
DROP POLICY IF EXISTS "packages_all_staff_community" ON packages;

CREATE POLICY "packages_select_multi_community" ON packages FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "packages_all_staff_community" ON packages FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() IN ('admin', 'concierge')
);

-- 8. ANNOUNCEMENTS
DROP POLICY IF EXISTS "announcements_select_community_only" ON announcements;
DROP POLICY IF EXISTS "announcements_all_staff_community" ON announcements;

CREATE POLICY "announcements_select_community_only" ON announcements FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "announcements_all_staff_community" ON announcements FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() IN ('admin', 'concierge')
);

-- 9. SERVICE PROVIDERS & REQUESTS
DROP POLICY IF EXISTS "service_providers_select_community_only" ON service_providers;
DROP POLICY IF EXISTS "service_providers_admin_community_only" ON service_providers;
DROP POLICY IF EXISTS "service_requests_admin_community_only" ON service_requests;

CREATE POLICY "service_providers_select_community_only" ON service_providers FOR SELECT USING (
  community_id = get_my_community_id()
);

CREATE POLICY "service_providers_admin_community_only" ON service_providers FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

CREATE POLICY "service_requests_admin_community_only" ON service_requests FOR ALL USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);
