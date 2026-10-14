-- Cancelar una emisión y sus asientos derivados en una sola transacción.
-- Bloquear los cobros impide que entre un abono con destino explícito entre
-- la comprobación y el borrado (la FK de unit_payments espera el bloqueo).
CREATE OR REPLACE FUNCTION public.cancel_billing_run_safe(
  p_community_id uuid,
  p_run_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_run public.billing_runs%ROWTYPE;
  v_expense_ids uuid[];
BEGIN
  SELECT * INTO v_run
  FROM public.billing_runs
  WHERE id = p_run_id AND community_id = p_community_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_found');
  END IF;
  IF v_run.status <> 'issued' THEN
    RETURN jsonb_build_object('status', 'not_issued');
  END IF;

  -- FOR UPDATE serializa pagos asignados, cambios de estado y cancelación.
  PERFORM 1 FROM public.expenses WHERE billing_run_id = p_run_id FOR UPDATE;
  SELECT array_agg(id) INTO v_expense_ids
  FROM public.expenses WHERE billing_run_id = p_run_id;

  IF EXISTS (
    SELECT 1 FROM public.expenses
    WHERE billing_run_id = p_run_id AND status = 'paid'
  ) THEN
    RETURN jsonb_build_object('status', 'has_paid');
  END IF;
  IF v_expense_ids IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.unit_payments
    WHERE expense_id = ANY(v_expense_ids)
  ) THEN
    RETURN jsonb_build_object('status', 'has_payment');
  END IF;
  IF v_expense_ids IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.unit_charges WHERE source_expense_id = ANY(v_expense_ids))
    OR EXISTS (SELECT 1 FROM public.solidarity_contributions WHERE expense_id = ANY(v_expense_ids))
  ) THEN
    RETURN jsonb_build_object('status', 'has_related_records');
  END IF;

  DELETE FROM public.expenses WHERE billing_run_id = p_run_id;
  DELETE FROM public.reserve_fund_movements
  WHERE billing_run_id = p_run_id AND kind = 'contribution';
  UPDATE public.billing_runs SET status = 'cancelled' WHERE id = p_run_id;

  RETURN jsonb_build_object('status', 'cancelled', 'month', v_run.month);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_billing_run_safe(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_billing_run_safe(uuid, uuid) TO service_role;
