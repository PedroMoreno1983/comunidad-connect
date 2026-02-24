-- Row Level Security (RLS) Policies
-- Run this AFTER running 001_initial_schema.sql

-- ============================================
-- ENABLE RLS ON ALL TABLES
-- ============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE packages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- PROFILES TABLE POLICIES
-- ============================================

-- Users can view all profiles (for displaying names in UI)
CREATE POLICY "profiles_select_all"
  ON profiles FOR SELECT
  USING (true);

-- Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Admins can update any profile
CREATE POLICY "profiles_update_admin"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can delete profiles
CREATE POLICY "profiles_delete_admin"
  ON profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- UNITS TABLE POLICIES
-- ============================================

-- Everyone can view units
CREATE POLICY "units_select_all"
  ON units FOR SELECT
  USING (true);

-- Admins can insert/update/delete units
CREATE POLICY "units_admin_all"
  ON units FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- MARKETPLACE ITEMS POLICIES
-- ============================================

-- Everyone can view available items
CREATE POLICY "marketplace_select_all"
  ON marketplace_items FOR SELECT
  USING (true);

-- Users can insert their own items
CREATE POLICY "marketplace_insert_own"
  ON marketplace_items FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

-- Users can update their own items
CREATE POLICY "marketplace_update_own"
  ON marketplace_items FOR UPDATE
  USING (auth.uid() = seller_id);

-- Users can delete their own items
CREATE POLICY "marketplace_delete_own"
  ON marketplace_items FOR DELETE
  USING (auth.uid() = seller_id);

-- Admins can do anything
CREATE POLICY "marketplace_admin_all"
  ON marketplace_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- SERVICE PROVIDERS POLICIES
-- ============================================

-- Everyone can view service providers
CREATE POLICY "service_providers_select_all"
  ON service_providers FOR SELECT
  USING (true);

-- Admins can manage service providers
CREATE POLICY "service_providers_admin_all"
  ON service_providers FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- SERVICE REQUESTS POLICIES
-- ============================================

-- Users can view their own requests
CREATE POLICY "service_requests_select_own"
  ON service_requests FOR SELECT
  USING (auth.uid() = requester_id);

-- Admins can view all requests
CREATE POLICY "service_requests_select_admin"
  ON service_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can create their own requests
CREATE POLICY "service_requests_insert_own"
  ON service_requests FOR INSERT
  WITH CHECK (auth.uid() = requester_id);

-- Users can update their own requests
CREATE POLICY "service_requests_update_own"
  ON service_requests FOR UPDATE
  USING (auth.uid() = requester_id);

-- Admins can update any request
CREATE POLICY "service_requests_update_admin"
  ON service_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- AMENITIES POLICIES
-- ============================================

-- Everyone can view amenities
CREATE POLICY "amenities_select_all"
  ON amenities FOR SELECT
  USING (true);

-- Admins can manage amenities
CREATE POLICY "amenities_admin_all"
  ON amenities FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- BOOKINGS POLICIES
-- ============================================

-- Users can view their own bookings
CREATE POLICY "bookings_select_own"
  ON bookings FOR SELECT
  USING (auth.uid() = user_id);

-- Admins can view all bookings
CREATE POLICY "bookings_select_admin"
  ON bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can create their own bookings
CREATE POLICY "bookings_insert_own"
  ON bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own bookings
CREATE POLICY "bookings_update_own"
  ON bookings FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can manage all bookings
CREATE POLICY "bookings_admin_all"
  ON bookings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- ANNOUNCEMENTS POLICIES
-- ============================================

-- Everyone can view announcements
CREATE POLICY "announcements_select_all"
  ON announcements FOR SELECT
  USING (true);

-- Admins can create announcements
CREATE POLICY "announcements_insert_admin"
  ON announcements FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Admins can update/delete announcements
CREATE POLICY "announcements_admin_all"
  ON announcements FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- EXPENSES POLICIES
-- ============================================

-- Users can view their unit's expenses
CREATE POLICY "expenses_select_own"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND unit_id = expenses.unit_id
    )
  );

-- Admins can view all expenses
CREATE POLICY "expenses_select_admin"
  ON expenses FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Users can update payment status of their own expenses
CREATE POLICY "expenses_update_own"
  ON expenses FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND unit_id = expenses.unit_id
    )
  );

-- Admins can manage all expenses
CREATE POLICY "expenses_admin_all"
  ON expenses FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- VISITORS POLICIES
-- ============================================

-- Concierge and admins can view all visitors
CREATE POLICY "visitors_select_concierge_admin"
  ON visitors FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Concierge can insert visitors
CREATE POLICY "visitors_insert_concierge"
  ON visitors FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Concierge can update visitors (for checkout)
CREATE POLICY "visitors_update_concierge"
  ON visitors FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Admins can delete visitors
CREATE POLICY "visitors_delete_admin"
  ON visitors FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- PACKAGES POLICIES
-- ============================================

-- Concierge and admins can view all packages
CREATE POLICY "packages_select_concierge_admin"
  ON packages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Residents can view packages for their unit
CREATE POLICY "packages_select_resident"
  ON packages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND unit_id = packages.recipient_unit_id
    )
  );

-- Concierge can insert packages
CREATE POLICY "packages_insert_concierge"
  ON packages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Concierge can update packages (for delivery)
CREATE POLICY "packages_update_concierge"
  ON packages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('concierge', 'admin')
    )
  );

-- Admins can delete packages
CREATE POLICY "packages_delete_admin"
  ON packages FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
