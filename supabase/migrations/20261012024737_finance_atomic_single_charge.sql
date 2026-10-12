-- El cobro puntual del Agent Center y su desglose se confirman juntos.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_unit_expense_atomic(
  p_community_id uuid, p_unit_id uuid, p_month text,
  p_amount numeric, p_due_date date, p_label text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_expense record;
  v_unit_number text;
BEGIN
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' OR p_due_date IS NULL THEN
    RAISE EXCEPTION 'Indica un mes y vencimiento válidos.';
  END IF;
  IF p_amount IS NULL OR p_amount <> trunc(p_amount)
     OR p_amount <= 0 OR p_amount >= 100000000 THEN
    RAISE EXCEPTION 'El monto debe ser entero, positivo y estar dentro del rango permitido.';
  END IF;
  IF nullif(trim(p_label),'') IS NULL THEN
    RAISE EXCEPTION 'El cobro necesita una descripción.';
  END IF;
  SELECT number::text INTO v_unit_number FROM public.units
    WHERE id=p_unit_id AND community_id=p_community_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','unit_not_found'); END IF;
  IF EXISTS (SELECT 1 FROM public.expenses
             WHERE community_id=p_community_id AND unit_id=p_unit_id::text
               AND month=p_month) THEN
    RETURN jsonb_build_object('status','already_charged','unitNumber',v_unit_number);
  END IF;

  INSERT INTO public.expenses
    (unit_id,community_id,month,amount,status,due_date)
  VALUES (p_unit_id::text,p_community_id,p_month,p_amount,'pending',p_due_date)
  RETURNING id,month,amount,status,due_date INTO v_expense;
  INSERT INTO public.expense_items (expense_id,category,label,amount)
  VALUES (v_expense.id,'other',left(trim(p_label),160),p_amount);
  RETURN jsonb_build_object('status','created','unitNumber',v_unit_number,
    'expense',jsonb_build_object('id',v_expense.id,'month',v_expense.month,
      'amount',v_expense.amount,'status',v_expense.status,'due_date',v_expense.due_date));
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('status','already_charged','unitNumber',v_unit_number);
END;
$$;
REVOKE ALL ON FUNCTION public.create_unit_expense_atomic(uuid,uuid,text,numeric,date,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_unit_expense_atomic(uuid,uuid,text,numeric,date,text)
  TO service_role;

COMMIT;
