-- Migration: Add Multi-Tenant and Billing/Subscriptions Architecture

-- Enable UUID extension if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Pricing Tiers Table
CREATE TABLE IF NOT EXISTS pricing_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  price_per_unit NUMERIC(10,2) NOT NULL,
  base_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create Communities Table (The central Tenant)
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  tier_id UUID REFERENCES pricing_tiers(id),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Insert Default Tiers and a Default Community (for existing data migration)
-- This ensures existing data doesn't break when we add the foreign keys
INSERT INTO pricing_tiers (id, name, price_per_unit, base_price, features) VALUES
('11111111-1111-1111-1111-111111111111', 'Essential', 490, 19990, '{"amenities": false, "coco_ai": false, "maintenance": false}'::jsonb),
('22222222-2222-2222-2222-222222222222', 'Pro', 690, 34990, '{"amenities": true, "coco_ai": true, "maintenance": true}'::jsonb),
('33333333-3333-3333-3333-333333333333', 'Enterprise', 890, 0, '{"amenities": true, "coco_ai": true, "maintenance": true, "custom_roles": true}'::jsonb)
ON CONFLICT (name) DO UPDATE 
SET price_per_unit = EXCLUDED.price_per_unit, 
    base_price = EXCLUDED.base_price, 
    features = EXCLUDED.features;

INSERT INTO communities (id, name, address, tier_id) VALUES 
('00000000-0000-0000-0000-000000000000', 'Condominio Demo Principal', 'Av. Siempreviva 742', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- 4. Add community_id to all existing core tables
-- Using the default community ID so existing rows don't break NOT NULL constraints
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE units ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE marketplace_items ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE service_providers ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE service_requests ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE amenities ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE visitors ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';

-- Add to phased tables if they exist
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'social_posts') THEN
        ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'social_comments') THEN
        ALTER TABLE social_comments ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'notifications') THEN
        ALTER TABLE notifications ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000';
    END IF;
END $$;

-- 5. Establish RLS basics for Communities table
ALTER TABLE pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- Anyone can read pricing tiers (public info for the landing page)
DROP POLICY IF EXISTS "Pricing tiers are viewable by everyone." ON pricing_tiers;
CREATE POLICY "Pricing tiers are viewable by everyone." 
ON pricing_tiers FOR SELECT USING (true);

-- Users can view the community they belong to
DROP POLICY IF EXISTS "Users can view their own community." ON communities;
CREATE POLICY "Users can view their own community." 
ON communities FOR SELECT 
USING (
  id IN (SELECT community_id FROM profiles WHERE id = auth.uid())
);

-- Only admins of that community can update it
DROP POLICY IF EXISTS "Admins can update their community." ON communities;
CREATE POLICY "Admins can update their community." 
ON communities FOR UPDATE 
USING (
  id IN (SELECT community_id FROM profiles WHERE id = auth.uid() AND role = 'admin')
);

-- To allow new registrations, allow authenticated users to insert communities
DROP POLICY IF EXISTS "Authenticated users can create a community." ON communities;
CREATE POLICY "Authenticated users can create a community." 
ON communities FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- 6. Update user creation trigger to support community_id from metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
BEGIN
  -- Intentar obtener el community_id de los metadatos del usuario al registrarse
  IF NEW.raw_user_meta_data->>'community_id' IS NOT NULL THEN
    v_community_id := (NEW.raw_user_meta_data->>'community_id')::UUID;
  ELSE
    -- Fallback a la comunidad por defecto (para retrocompatibilidad)
    v_community_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  INSERT INTO public.profiles (id, name, email, role, community_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'resident'),
    v_community_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
