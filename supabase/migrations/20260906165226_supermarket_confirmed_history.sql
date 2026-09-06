-- Previous rows are comparisons, not confirmed purchases. Keep them out of
-- repurchase suggestions without deleting the user's existing data.
ALTER TABLE public.supermarket_purchase_history
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_supermarket_history_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Authentication and preference required';
  END IF;
  UPDATE public.profiles
  SET supermarket_history_enabled = p_enabled
  WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile unavailable';
  END IF;
  IF NOT p_enabled THEN
    DELETE FROM public.supermarket_purchase_history WHERE user_id = auth.uid();
  END IF;
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_supermarket_history_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supermarket_history_enabled(boolean) TO authenticated;
