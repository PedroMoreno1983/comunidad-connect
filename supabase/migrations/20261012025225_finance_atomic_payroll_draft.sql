-- Recrear el borrador de remuneraciones sin dejar líneas vacías o total obsoleto.
BEGIN;

CREATE OR REPLACE FUNCTION public.create_payroll_run_atomic(
  p_community_id uuid, p_created_by uuid, p_month text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_total bigint;
  v_count integer;
BEGIN
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Indica el mes en formato AAAA-MM.';
  END IF;
  -- Los cambios de personal esperan el fin de la preparación del borrador.
  PERFORM 1 FROM public.community_employees
    WHERE community_id=p_community_id AND active=true FOR SHARE;
  SELECT count(*),sum(monthly_amount)::bigint INTO v_count,v_total
    FROM public.community_employees
    WHERE community_id=p_community_id AND active=true;
  IF v_count=0 THEN RETURN jsonb_build_object('status','empty'); END IF;
  IF v_total <= 0 OR v_total > 2147483647 THEN
    RAISE EXCEPTION 'El total supera el rango permitido para liquidaciones.';
  END IF;

  INSERT INTO public.payroll_runs
    (community_id,month,total_amount,created_by)
  VALUES (p_community_id,p_month,v_total::integer,p_created_by)
  ON CONFLICT (community_id,month) DO NOTHING;
  SELECT * INTO v_run FROM public.payroll_runs
    WHERE community_id=p_community_id AND month=p_month FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo preparar la remuneración.'; END IF;
  IF v_run.status='paid' THEN RETURN jsonb_build_object('status','already_paid'); END IF;
  IF v_run.journal_entry_id IS NOT NULL OR v_run.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'La liquidación tiene registros parciales; revísala antes de rehacerla.';
  END IF;

  DELETE FROM public.payroll_lines WHERE run_id=v_run.id;
  UPDATE public.payroll_runs SET total_amount=v_total::integer WHERE id=v_run.id;
  INSERT INTO public.payroll_lines
    (run_id,employee_id,full_name,role_title,amount)
  SELECT v_run.id,id,full_name,role_title,monthly_amount
    FROM public.community_employees
    WHERE community_id=p_community_id AND active=true;
  IF (SELECT coalesce(sum(amount),0) FROM public.payroll_lines WHERE run_id=v_run.id) <> v_total THEN
    RAISE EXCEPTION 'El borrador no cuadra con el total de remuneraciones.';
  END IF;
  RETURN jsonb_build_object('status','draft','id',v_run.id,
    'month',p_month,'total',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.create_payroll_run_atomic(uuid,uuid,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payroll_run_atomic(uuid,uuid,text)
  TO service_role;

COMMIT;
