-- Migration: Add Admin Invitation Code and set Demo codes

-- 1. Add admin_code column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'communities'
          AND column_name = 'admin_code'
    ) THEN
        ALTER TABLE public.communities ADD COLUMN admin_code TEXT UNIQUE;
        RAISE NOTICE 'Columna admin_code agregada a communities';
    END IF;
END $$;

-- 2. Set specific codes for the Demo Community
-- ID: 00000000-0000-0000-0000-000000000000 (from 008_multi_tenant_and_billing.sql)
UPDATE public.communities
SET resident_code = 'RESIDENTE123',
    concierge_code = 'CONSERJE123',
    admin_code = 'ADMIN123'
WHERE id = '00000000-0000-0000-0000-000000000000';

-- 3. Populate admin_code for other communities if null
UPDATE public.communities
SET admin_code = upper(substring(md5(random()::text) from 1 for 6))
WHERE admin_code IS NULL;

-- 4. Update the generation function to include admin_code
CREATE OR REPLACE FUNCTION public.generate_community_codes()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resident_code IS NULL THEN
    NEW.resident_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  
  IF NEW.concierge_code IS NULL THEN
    NEW.concierge_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;

  IF NEW.admin_code IS NULL THEN
    NEW.admin_code := upper(substring(md5(random()::text || clock_timestamp()::text) from 1 for 8));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
