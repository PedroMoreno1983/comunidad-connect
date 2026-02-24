-- Fix RLS policies for public access to service providers and reviews
-- This allows unauthenticated users to view providers and reviews

-- Drop existing restrictive policies if they exist
DROP POLICY IF EXISTS "service_providers_select_all" ON service_providers;
DROP POLICY IF EXISTS "service_providers_admin_all" ON service_providers;
DROP POLICY IF EXISTS "reviews_select_all" ON reviews;

-- Allow anyone (including anonymous users) to read service providers
CREATE POLICY "service_providers_public_read"
  ON service_providers FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert/update/delete providers
CREATE POLICY "service_providers_authenticated_write"
  ON service_providers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Allow anyone to read reviews
CREATE POLICY "reviews_public_read"
  ON reviews FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow authenticated users to insert their own reviews
CREATE POLICY "reviews_authenticated_insert"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update/delete their own reviews
CREATE POLICY "reviews_authenticated_update_own"
  ON reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "reviews_authenticated_delete_own"
  ON reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
