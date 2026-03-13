-- Migration: Fix handle_new_user to use full_name from metadata

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_name TEXT;
BEGIN
  -- 1. Determine community_id
  IF NEW.raw_user_meta_data->>'community_id' IS NOT NULL THEN
    v_community_id := (NEW.raw_user_meta_data->>'community_id')::UUID;
  ELSE
    v_community_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  -- 2. Determine name (check both name and full_name for compatibility)
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NEW.email
  );

  -- 3. Insert profile
  INSERT INTO public.profiles (id, full_name, email, role, community_id)
  VALUES (
    NEW.id,
    v_name,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'resident'),
    v_community_id
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
