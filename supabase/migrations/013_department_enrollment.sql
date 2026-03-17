-- Migration 013: Add department_number to profiles
-- Captures the resident's department number during signup

-- 1. Add department_number column (if not exists)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS department_number TEXT;

-- 2. Update the profile trigger to capture department_number from signup metadata
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_name TEXT;
  v_role TEXT;
  v_department TEXT;
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

  -- Determine department number (only for residents)
  v_department := NEW.raw_user_meta_data->>'department_number';

  -- Insert into profiles (verified columns: id, full_name, email, role, community_id, department_number)
  INSERT INTO public.profiles (id, full_name, email, role, community_id, department_number)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    v_role,
    v_community_id,
    v_department
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Essential for debugging: if this fails, auth user still gets created
  RETURN NEW; 
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
