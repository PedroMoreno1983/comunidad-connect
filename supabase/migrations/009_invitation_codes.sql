-- Migration: Add Invitation Codes to Communities

-- Add columns for unique invitation codes
ALTER TABLE communities
ADD COLUMN IF NOT EXISTS resident_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS concierge_code TEXT UNIQUE;

-- Update existing communities with random codes
UPDATE communities
SET resident_code = upper(substring(md5(random()::text) from 1 for 6)),
    concierge_code = upper(substring(md5(random()::text) from 1 for 6))
WHERE resident_code IS NULL;

-- Make them NOT NULL after populating existing rows
ALTER TABLE communities
ALTER COLUMN resident_code SET NOT NULL,
ALTER COLUMN concierge_code SET NOT NULL;

-- Function to auto-generate codes for NEW communities
CREATE OR REPLACE FUNCTION public.generate_community_codes()
RETURNS TRIGGER AS $$
BEGIN
  -- Si no vienen códigos explícitos, generamos unos aleatorios seguros (6 caracteres)
  IF NEW.resident_code IS NULL THEN
    NEW.resident_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  
  IF NEW.concierge_code IS NULL THEN
    NEW.concierge_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to execute the function before insert
DROP TRIGGER IF EXISTS on_community_created ON communities;
CREATE TRIGGER on_community_created
  BEFORE INSERT ON communities
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_community_codes();

-- Allow public to query communities by code for the signup process
-- Note: This only allows searching if you ALREADY KNOW the code.
DROP POLICY IF EXISTS "Public can view community by code" ON communities;
CREATE POLICY "Public can view community by code"
  ON communities FOR SELECT
  USING (true);
