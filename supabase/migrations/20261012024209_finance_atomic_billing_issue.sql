-- La corrida, sus cobros, desgloses y aporte de reserva se confirman juntos.
BEGIN;

CREATE OR REPLACE FUNCTION public.issue_billing_run_atomic(
  p_community_id uuid, p_month text, p_due_date date, p_issued_by uuid,
  p_fallback_equal_split boolean, p_committee_review_id uuid, p_units jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_unit jsonb;
  v_item jsonb;
  v_unit_id uuid;
  v_seen_units uuid[] := '{}';
  v_total numeric := 0;
  v_unit_total numeric;
  v_item_total numeric;
  v_item_amount numeric;
  v_source_id uuid;
  v_run_id uuid;
  v_expense_id uuid;
  v_reserve_rate numeric;
  v_reserve_amount numeric := 0;
BEGIN
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' OR p_due_date IS NULL THEN
    RAISE EXCEPTION 'Indica un mes y vencimiento válidos.';
  END IF;
  IF jsonb_typeof(p_units) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_units) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'La emisión necesita unidades con cobro.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.communities WHERE id=p_community_id) THEN
    RAISE EXCEPTION 'La comunidad no existe.';
  END IF;
  IF p_committee_review_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_committee_reviews
    WHERE id=p_committee_review_id AND community_id=p_community_id
      AND month=p_month AND status='approved'
  ) THEN
    RAISE EXCEPTION 'La revisión del comité ya no está aprobada.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.billing_runs
             WHERE community_id=p_community_id AND month=p_month AND status='issued') THEN
    RETURN jsonb_build_object('status','already_issued');
  END IF;
  IF EXISTS (SELECT 1 FROM public.expenses
             WHERE community_id=p_community_id AND month=p_month) THEN
    RETURN jsonb_build_object('status','existing_charges');
  END IF;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) LOOP
    v_unit_id := (v_unit ->> 'unitId')::uuid;
    IF v_unit_id IS NULL OR v_unit_id = ANY(v_seen_units)
       OR NOT EXISTS (SELECT 1 FROM public.units
                      WHERE id=v_unit_id AND community_id=p_community_id) THEN
      RAISE EXCEPTION 'Hay una unidad duplicada o ajena a la comunidad.';
    END IF;
    v_seen_units := array_append(v_seen_units, v_unit_id);
    IF (v_unit ->> 'total') !~ '^[1-9][0-9]*$' THEN
      RAISE EXCEPTION 'Hay un cobro sin monto entero positivo.';
    END IF;
    v_unit_total := (v_unit ->> 'total')::numeric;
    IF jsonb_typeof(v_unit -> 'items') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_unit -> 'items') = 0 THEN
      RAISE EXCEPTION 'Un cobro no tiene desglose.';
    END IF;
    v_item_total := 0;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_unit -> 'items') LOOP
      IF (v_item ->> 'amount') !~ '^[0-9]+$'
         OR nullif(trim(v_item ->> 'label'), '') IS NULL THEN
        RAISE EXCEPTION 'Hay un ítem de cobro inválido.';
      END IF;
      v_item_amount := (v_item ->> 'amount')::numeric;
      IF v_item_amount >= 100000000 THEN
        RAISE EXCEPTION 'Un ítem supera el rango permitido.';
      END IF;
      v_item_total := v_item_total + v_item_amount;
      IF nullif(v_item ->> 'sourceExpenseId', '') IS NOT NULL THEN
        v_source_id := (v_item ->> 'sourceExpenseId')::uuid;
        IF NOT EXISTS (SELECT 1 FROM public.community_expenses
                       WHERE id=v_source_id AND community_id=p_community_id
                         AND month=p_month) THEN
          RAISE EXCEPTION 'Un ítem apunta a un egreso ajeno al período.';
        END IF;
      END IF;
    END LOOP;
    IF v_item_total <> v_unit_total THEN
      RAISE EXCEPTION 'El desglose no coincide con el cobro de la unidad.';
    END IF;
    v_total := v_total + v_unit_total;
  END LOOP;

  INSERT INTO public.billing_runs
    (community_id,month,status,total_amount,units_count,due_date,
     fallback_equal_split,issued_by,committee_review_id)
  VALUES
    (p_community_id,p_month,'issued',v_total,array_length(v_seen_units,1),
     p_due_date,coalesce(p_fallback_equal_split,false),p_issued_by,
     p_committee_review_id)
  RETURNING id INTO v_run_id;

  FOR v_unit IN SELECT value FROM jsonb_array_elements(p_units) LOOP
    INSERT INTO public.expenses
      (unit_id,community_id,month,amount,status,due_date,billing_run_id)
    VALUES
      (v_unit ->> 'unitId',p_community_id,p_month,
       (v_unit ->> 'total')::numeric,'pending',p_due_date,v_run_id)
    RETURNING id INTO v_expense_id;
    FOR v_item IN SELECT value FROM jsonb_array_elements(v_unit -> 'items') LOOP
      INSERT INTO public.expense_items
        (expense_id,source_expense_id,category,label,amount)
      VALUES
        (v_expense_id,nullif(v_item ->> 'sourceExpenseId','')::uuid,
         v_item ->> 'category',v_item ->> 'label',
         (v_item ->> 'amount')::numeric);
    END LOOP;
  END LOOP;

  SELECT coalesce(reserve_fund_rate,0) INTO v_reserve_rate
    FROM public.communities WHERE id=p_community_id;
  IF v_reserve_rate > 0 THEN
    v_reserve_amount := round(v_total * v_reserve_rate / 100);
    IF v_reserve_amount > 0 THEN
      INSERT INTO public.reserve_fund_movements
        (community_id,kind,amount,month,label,billing_run_id,created_by)
      VALUES
        (p_community_id,'contribution',v_reserve_amount,p_month,
         'Aporte del gasto común ' || p_month || ' (' || v_reserve_rate || '%)',
         v_run_id,p_issued_by);
    END IF;
  END IF;
  RETURN jsonb_build_object('status','issued','runId',v_run_id,
    'issuedUnits',array_length(v_seen_units,1),
    'totalCharged',v_total,'reserveContribution',v_reserve_amount);
END;
$$;
REVOKE ALL ON FUNCTION public.issue_billing_run_atomic(uuid,text,date,uuid,boolean,uuid,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_billing_run_atomic(uuid,text,date,uuid,boolean,uuid,jsonb)
  TO service_role;

COMMIT;
