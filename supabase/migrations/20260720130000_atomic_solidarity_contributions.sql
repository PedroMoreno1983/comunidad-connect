-- Only verified paid expenses can generate a round-up contribution. The
-- contribution, fund balance and ledger entry are written atomically.
BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS solidarity_round_up_expense_unique
  ON public.solidarity_contributions (expense_id)
  WHERE type = 'round_up' AND expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_verified_solidarity_round_up(
  p_community_id UUID,
  p_user_id UUID,
  p_expense_id UUID,
  p_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 OR p_amount > 999 THEN
    RAISE EXCEPTION 'invalid-round-up-amount';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.expenses e
    JOIN public.profiles p ON p.unit_id = e.unit_id
    WHERE e.id = p_expense_id
      AND e.community_id = p_community_id
      AND e.status = 'paid'
      AND p.id = p_user_id
      AND p.community_id = p_community_id
  ) THEN
    RAISE EXCEPTION 'expense-not-paid-or-not-owned';
  END IF;

  INSERT INTO public.solidarity_contributions (community_id, user_id, amount, type, expense_id)
  VALUES (p_community_id, p_user_id, p_amount, 'round_up', p_expense_id);

  INSERT INTO public.solidarity_funds (community_id, balance)
  VALUES (p_community_id, p_amount)
  ON CONFLICT (community_id) DO UPDATE
    SET balance = public.solidarity_funds.balance + EXCLUDED.balance,
        updated_at = NOW()
  RETURNING balance INTO v_balance;

  INSERT INTO public.solidarity_ledger (community_id, entry_type, amount, hours, description)
  VALUES (p_community_id, 'contribution', p_amount, 0, 'Redondeo verificado de gasto común pagado');

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_verified_solidarity_round_up(UUID, UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_solidarity_round_up(UUID, UUID, UUID, NUMERIC) TO service_role;

COMMIT;
