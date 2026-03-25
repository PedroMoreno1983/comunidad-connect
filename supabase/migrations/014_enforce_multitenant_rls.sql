-- =====================================================
-- MIGRATION: 014_enforce_multitenant_rls.sql
-- Enforces strictly multi-tenant access by `community_id`
-- =====================================================
-- Drop existing policies that grant global access to admins

-- 1. PROFILES
DROP POLICY IF EXISTS "profiles_select_all" ON profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON profiles;
DROP POLICY IF EXISTS "profiles_read_all" ON profiles;

CREATE POLICY "profiles_select_community_only" ON profiles FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "profiles_update_community_admin" ON profiles FOR UPDATE USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 2. UNITS
DROP POLICY IF EXISTS "units_select_all" ON units;
DROP POLICY IF EXISTS "units_admin_all" ON units;

CREATE POLICY "units_select_community_only" ON units FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "units_admin_community_only" ON units FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 3. EXPENSES
DROP POLICY IF EXISTS "expenses_select_admin" ON expenses;
DROP POLICY IF EXISTS "expenses_admin_all" ON expenses;

-- (Keep the residents one, recreate the admins)
CREATE POLICY "expenses_admin_community_only" ON expenses FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 4. AMENITIES
DROP POLICY IF EXISTS "amenities_select_all" ON amenities;
DROP POLICY IF EXISTS "amenities_admin_all" ON amenities;

CREATE POLICY "amenities_select_community_only" ON amenities FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "amenities_admin_community_only" ON amenities FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 5. BOOKINGS
DROP POLICY IF EXISTS "bookings_select_admin" ON bookings;
DROP POLICY IF EXISTS "bookings_admin_all" ON bookings;

CREATE POLICY "bookings_admin_community_only" ON bookings FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 6. VISITORS
DROP POLICY IF EXISTS "visitors_select_concierge_admin" ON visitors;
DROP POLICY IF EXISTS "visitors_insert_concierge" ON visitors;
DROP POLICY IF EXISTS "visitors_update_concierge" ON visitors;
DROP POLICY IF EXISTS "visitors_delete_admin" ON visitors;

CREATE POLICY "visitors_select_community_only" ON visitors FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "visitors_all_staff_community" ON visitors FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

-- 7. PACKAGES
DROP POLICY IF EXISTS "packages_select_concierge_admin" ON packages;
DROP POLICY IF EXISTS "packages_insert_concierge" ON packages;
DROP POLICY IF EXISTS "packages_update_concierge" ON packages;
DROP POLICY IF EXISTS "packages_delete_admin" ON packages;

CREATE POLICY "packages_select_multi_community" ON packages FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "packages_all_staff_community" ON packages FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

-- 8. ANNOUNCEMENTS
DROP POLICY IF EXISTS "announcements_select_all" ON announcements;
DROP POLICY IF EXISTS "announcements_insert_admin" ON announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON announcements;

CREATE POLICY "announcements_select_community_only" ON announcements FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);

CREATE POLICY "announcements_all_staff_community" ON announcements FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

-- 9. SERVICE PROVIDERS & REQUESTS
DROP POLICY IF EXISTS "service_providers_select_all" ON service_providers;
DROP POLICY IF EXISTS "service_providers_admin_all" ON service_providers;

CREATE POLICY "service_providers_select_community_only" ON service_providers FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
);
CREATE POLICY "service_providers_admin_community_only" ON service_providers FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

DROP POLICY IF EXISTS "service_requests_select_admin" ON service_requests;
DROP POLICY IF EXISTS "service_requests_update_admin" ON service_requests;

CREATE POLICY "service_requests_admin_community_only" ON service_requests FOR ALL USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 10. NOTIFICATIONS
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='community_id') THEN
        -- ya tiene community id, lo limitamos
        DROP POLICY IF EXISTS "notifications_select" ON notifications;
        CREATE POLICY "notifications_select_community_only" ON notifications FOR SELECT USING (
          community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
          AND user_id = auth.uid()
        );
    END IF;
END $$;
