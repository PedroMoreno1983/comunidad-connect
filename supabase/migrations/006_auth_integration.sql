-- Migration 006: Auth Integration
-- Links auth.users with profiles and service_providers tables

-- Add user_id to service_providers to link providers with auth users
ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_service_providers_user_id ON service_providers(user_id);

-- Update RLS policies for service_providers
-- Drop old authenticated write policy
DROP POLICY IF EXISTS "service_providers_authenticated_write" ON service_providers;

-- Allow authenticated users to insert providers (linked to their user_id)
CREATE POLICY "service_providers_authenticated_insert"
  ON service_providers FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own providers
CREATE POLICY "service_providers_authenticated_update"
  ON service_providers FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own providers
CREATE POLICY "service_providers_authenticated_delete"
  ON service_providers FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Update RLS policies for reviews
-- Drop old policies if they exist
DROP POLICY IF EXISTS "reviews_authenticated_insert" ON reviews;
DROP POLICY IF EXISTS "reviews_authenticated_update" ON reviews;
DROP POLICY IF EXISTS "reviews_authenticated_delete" ON reviews;

-- Allow authenticated users to insert reviews
CREATE POLICY "reviews_authenticated_insert"
  ON reviews FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own reviews
CREATE POLICY "reviews_authenticated_update"
  ON reviews FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Allow users to delete their own reviews
CREATE POLICY "reviews_authenticated_delete"
  ON reviews FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Ensure profiles table has proper RLS
-- Public read for profiles
DROP POLICY IF EXISTS "profiles_public_read" ON profiles;
CREATE POLICY "profiles_public_read"
  ON profiles FOR SELECT
  TO anon, authenticated
  USING (true);

-- Users can insert their own profile
DROP POLICY IF EXISTS "profiles_authenticated_insert" ON profiles;
CREATE POLICY "profiles_authenticated_insert"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS "profiles_authenticated_update" ON profiles;
CREATE POLICY "profiles_authenticated_update"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
