-- Migration 007: Service Requests Table (Fixed)
-- Creates table for users to request services from providers

-- Create service_requests table
CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add foreign key to auth.users separately (more compatible)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'service_requests_user_id_fkey'
  ) THEN
    ALTER TABLE service_requests
      ADD CONSTRAINT service_requests_user_id_fkey 
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_service_requests_provider_id ON service_requests(provider_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_user_id ON service_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON service_requests(status);

-- Enable RLS
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "users_view_own_requests" ON service_requests;
DROP POLICY IF EXISTS "providers_view_their_requests" ON service_requests;
DROP POLICY IF EXISTS "users_create_requests" ON service_requests;
DROP POLICY IF EXISTS "users_update_own_requests" ON service_requests;
DROP POLICY IF EXISTS "providers_update_request_status" ON service_requests;
DROP POLICY IF EXISTS "users_delete_own_requests" ON service_requests;

-- RLS Policies

-- Users can view their own requests
CREATE POLICY "users_view_own_requests"
  ON service_requests FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Providers can view requests for their services
CREATE POLICY "providers_view_their_requests"
  ON service_requests FOR SELECT
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()
    )
  );

-- Users can create service requests
CREATE POLICY "users_create_requests"
  ON service_requests FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending requests
CREATE POLICY "users_update_own_requests"
  ON service_requests FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id);

-- Providers can update status of their requests
CREATE POLICY "providers_update_request_status"
  ON service_requests FOR UPDATE
  TO authenticated
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()
    )
  );

-- Users can delete their own pending requests
CREATE POLICY "users_delete_own_requests"
  ON service_requests FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_service_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS service_requests_updated_at ON service_requests;
CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_service_requests_updated_at();
