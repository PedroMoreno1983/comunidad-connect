-- Resolve solidarity applications and debit the community fund atomically.
BEGIN;

CREATE OR REPLACE FUNCTION public.resolve_solidarity_application(
  p_community_id UUID,
  p_application_id UUID,
  p_status TEXT,
  p_amount_approved NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  user_id UUID,
  category TEXT,
  approved_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_application public.solidarity_applications%ROWTYPE;
  v_amount NUMERIC;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'invalid-status';
  END IF;

  SELECT * INTO v_application
  FROM public.solidarity_applications
  WHERE id = p_application_id
    AND community_id = p_community_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application-not-found';
  END IF;

  IF v_application.status <> 'pending' THEN
    RAISE EXCEPTION 'application-already-resolved';
  END IF;

  IF p_status = 'approved' THEN
    v_amount := COALESCE(p_amount_approved, v_application.amount_requested);
    IF v_amount <= 0 OR v_amount > v_application.amount_requested THEN
      RAISE EXCEPTION 'invalid-approved-amount';
    END IF;

    UPDATE public.solidarity_funds
    SET balance = balance - v_amount,
        updated_at = NOW()
    WHERE community_id = p_community_id
      AND balance >= v_amount;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'insufficient-or-missing-fund';
    END IF;

    UPDATE public.solidarity_applications
    SET status = 'approved',
        amount_approved = v_amount,
        resolved_at = NOW()
    WHERE id = p_application_id;

    INSERT INTO public.solidarity_ledger (
      community_id,
      entry_type,
      amount,
      hours,
      description
    ) VALUES (
      p_community_id,
      'subsidize',
      v_amount,
      0,
      'Subsidio solidario aprobado para una unidad anonimizada'
    );
  ELSE
    v_amount := 0;
    UPDATE public.solidarity_applications
    SET status = 'rejected',
        amount_approved = 0,
        resolved_at = NOW()
    WHERE id = p_application_id;
  END IF;

  RETURN QUERY SELECT v_application.user_id, v_application.category, v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_solidarity_application(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_solidarity_application(UUID, UUID, TEXT, NUMERIC) TO service_role;

COMMIT;
