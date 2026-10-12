-- Confirmar remuneración, egreso y asiento en una única transacción.
-- La clasificación final de cuentas sigue pendiente de validación profesional.
BEGIN;

CREATE OR REPLACE FUNCTION public.finance_reject_unlinked_payroll_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.source = 'payroll' AND NEW.source_record_id IS NULL THEN
    RAISE EXCEPTION 'El asiento de remuneraciones debe registrarse junto con la liquidación.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_reject_unlinked_payroll_journal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_reject_unlinked_payroll_journal() TO service_role;
DROP TRIGGER IF EXISTS finance_reject_unlinked_payroll_journal ON public.journal_entries;
CREATE TRIGGER finance_reject_unlinked_payroll_journal
  BEFORE INSERT ON public.journal_entries FOR EACH ROW
  EXECUTE FUNCTION public.finance_reject_unlinked_payroll_journal();

CREATE OR REPLACE FUNCTION public.pay_payroll_run_atomic(
  p_community_id uuid, p_run_id uuid, p_paid_at date,
  p_reference text, p_actor_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_run record;
  v_line_total bigint;
  v_expense_id uuid;
  v_entry_id uuid;
  v_salary_account uuid;
  v_bank_account uuid;
BEGIN
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'Indica la fecha del pago.';
  END IF;
  SELECT id, month, status, total_amount, journal_entry_id, expense_id
    INTO v_run FROM public.payroll_runs
    WHERE id = p_run_id AND community_id = p_community_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_run.status = 'paid' THEN RETURN jsonb_build_object('status', 'already_paid'); END IF;
  IF v_run.journal_entry_id IS NOT NULL OR v_run.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'La liquidación tiene registros parciales; revísala antes de pagar.';
  END IF;
  SELECT sum(amount)::bigint INTO v_line_total FROM public.payroll_lines
    WHERE run_id = p_run_id;
  IF v_run.total_amount <= 0 OR v_line_total IS NULL
     OR v_line_total <> v_run.total_amount OR v_line_total > 2147483647 THEN
    RAISE EXCEPTION 'El total de las liquidaciones no coincide con el pago.';
  END IF;

  INSERT INTO public.community_expenses
    (community_id, month, category, label, amount, notes, prorate_method, created_by)
  VALUES
    (p_community_id, v_run.month, 'salaries', 'Remuneraciones ' || v_run.month,
     v_line_total, nullif(left(trim(coalesce(p_reference, '')), 500), ''),
     'share', p_actor_id)
  RETURNING id INTO v_expense_id;

  INSERT INTO public.ledger_accounts (community_id, code, name, kind)
  VALUES (p_community_id, '1100', 'Banco', 'asset'),
         (p_community_id, '5100', 'Remuneraciones', 'expense')
  ON CONFLICT (community_id, code) DO NOTHING;
  SELECT id INTO STRICT v_bank_account FROM public.ledger_accounts
    WHERE community_id = p_community_id AND code = '1100';
  SELECT id INTO STRICT v_salary_account FROM public.ledger_accounts
    WHERE community_id = p_community_id AND code = '5100';

  INSERT INTO public.journal_entries
    (community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES
    (p_community_id, p_paid_at, 'Remuneraciones ' || v_run.month,
     'payroll', p_run_id, p_actor_id)
  RETURNING id INTO v_entry_id;
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
  VALUES (v_entry_id, v_salary_account, v_line_total::integer, 0),
         (v_entry_id, v_bank_account, 0, v_line_total::integer);

  UPDATE public.payroll_runs
    SET status = 'paid', paid_at = p_paid_at,
        payment_reference = nullif(left(trim(coalesce(p_reference, '')), 120), ''),
        journal_entry_id = v_entry_id, expense_id = v_expense_id,
        expense_note = 'Incluido en los egresos del mes.'
    WHERE id = p_run_id;
  RETURN jsonb_build_object('status', 'paid', 'id', p_run_id,
    'expenseId', v_expense_id, 'journalEntryId', v_entry_id);
END;
$$;
REVOKE ALL ON FUNCTION public.pay_payroll_run_atomic(uuid, uuid, date, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_payroll_run_atomic(uuid, uuid, date, text, uuid)
  TO service_role;

COMMIT;
