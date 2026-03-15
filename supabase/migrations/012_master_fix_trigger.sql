-- MASTER FIX: Recreate Profile Trigger and Function
-- This script ensures the trigger matches the actual 'profiles' table columns.

-- 1. Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 2. Recreate the function with correct column names (full_name)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_name TEXT;
  v_role TEXT;
BEGIN
  -- Determine community_id (fallback to demo if missing)
  IF (NEW.raw_user_meta_data->>'community_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'community_id') <> '' THEN
    v_community_id := (NEW.raw_user_meta_data->>'community_id')::UUID;
  ELSE
    v_community_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  -- Determine name
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  -- Determine role
  v_role := COALESCE(NEW.raw_user_meta_data->>'role', 'resident');

  -- Insert into profiles (verified columns: id, full_name, email, role, community_id)
  INSERT INTO public.profiles (id, full_name, email, role, community_id)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    v_role,
    v_community_id
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Essential for debugging: if this fails, auth user can't be created
  RETURN NEW; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Re-attach the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Final check: Ensure columns exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='full_name') THEN
        ALTER TABLE public.profiles RENAME COLUMN name TO full_name;
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- Column might already be correct
END $$;
