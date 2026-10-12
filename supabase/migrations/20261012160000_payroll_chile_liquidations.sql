-- Liquidación legal chilena: contrato del trabajador, indicadores previsionales
-- del mes y desglose por línea. El cálculo vive en src/lib/finance/payrollChile.ts;
-- la base guarda el resultado y garantiza que el borrador corresponda al
-- personal activo en el momento de grabarlo.
BEGIN;

CREATE TABLE IF NOT EXISTS public.payroll_indicators (
  month text PRIMARY KEY CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  "values" jsonb NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payroll_indicators ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.payroll_indicators FROM anon, authenticated;
GRANT ALL ON public.payroll_indicators TO service_role;

-- Previred, remuneraciones de septiembre 2026 (cotizaciones pagadas en octubre).
INSERT INTO public.payroll_indicators (month, "values", source) VALUES ('2026-09', '{
  "uf": 41057.2, "utm": 71721, "minimumWage": 553553,
  "afpCapUf": 90, "unemploymentCapUf": 135.2,
  "afpWorkerRates": {"capital": 0.1144, "cuprum": 0.1144, "habitat": 0.1127, "planvital": 0.1116,
                     "provida": 0.1145, "modelo": 0.1058, "uno": 0.1046},
  "employerAfpRate": 0.001, "sisRate": 0.0178,
  "socialInsuranceRates": {"rentabilidadProtegida": 0.009, "expectativaDeVida": 0.0072},
  "unemployment": {"indefinido": {"employer": 0.024, "worker": 0.006},
                   "plazo_fijo": {"employer": 0.03, "worker": 0},
                   "indefinido_11": {"employer": 0.008, "worker": 0}},
  "healthRate": 0.07,
  "familyAllowance": [{"upTo": 649039, "amount": 22601}, {"upTo": 947990, "amount": 13870},
                      {"upTo": 1478539, "amount": 4382}, {"upTo": null, "amount": 0}]
}'::jsonb, 'https://www.previred.com/indicadores-previsionales/')
ON CONFLICT (month) DO NOTHING;

-- Las personas existentes quedan en 'fixed': siguen pagándose igual que antes.
ALTER TABLE public.community_employees
  ADD COLUMN IF NOT EXISTS calculation text NOT NULL DEFAULT 'fixed'
    CHECK (calculation IN ('fixed', 'chile')),
  ADD COLUMN IF NOT EXISTS rut text,
  ADD COLUMN IF NOT EXISTS afp text,
  ADD COLUMN IF NOT EXISTS health_system text NOT NULL DEFAULT 'fonasa'
    CHECK (health_system IN ('fonasa', 'isapre')),
  ADD COLUMN IF NOT EXISTS isapre_name text,
  ADD COLUMN IF NOT EXISTS isapre_plan_uf numeric(8,4) CHECK (isapre_plan_uf IS NULL OR isapre_plan_uf > 0),
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT 'indefinido'
    CHECK (contract_type IN ('indefinido', 'plazo_fijo', 'indefinido_11')),
  ADD COLUMN IF NOT EXISTS gratification boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS taxable_bonus integer NOT NULL DEFAULT 0 CHECK (taxable_bonus >= 0),
  ADD COLUMN IF NOT EXISTS meal_allowance integer NOT NULL DEFAULT 0 CHECK (meal_allowance >= 0),
  ADD COLUMN IF NOT EXISTS transport_allowance integer NOT NULL DEFAULT 0 CHECK (transport_allowance >= 0),
  ADD COLUMN IF NOT EXISTS family_dependents smallint NOT NULL DEFAULT 0 CHECK (family_dependents BETWEEN 0 AND 20),
  ADD COLUMN IF NOT EXISTS hire_date date;

-- Seguro de accidentes del trabajo (Ley 16.744): tasa básica 0,90% + 0,03% Ley SANNA.
-- Cambia por comunidad cuando la mutual asigna cotización adicional.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS payroll_accident_rate numeric(6,4) NOT NULL DEFAULT 0.0093
    CHECK (payroll_accident_rate >= 0 AND payroll_accident_rate < 0.2);

ALTER TABLE public.payroll_lines
  ADD COLUMN IF NOT EXISTS gross_amount integer,
  ADD COLUMN IF NOT EXISTS net_amount integer,
  ADD COLUMN IF NOT EXISTS breakdown jsonb;
ALTER TABLE public.payroll_runs
  ADD COLUMN IF NOT EXISTS indicators_month text;

-- amount = costo total para la comunidad; pay_payroll_run_atomic lo usa como egreso.
-- Se rechaza el borrador si el personal activo o sus sueldos cambiaron entre el
-- cálculo y la grabación. La versión anterior (sin líneas) se mantiene para que
-- el código desplegado siga funcionando hasta que llegue el nuevo.
CREATE OR REPLACE FUNCTION public.create_payroll_run_with_lines(
  p_community_id uuid, p_created_by uuid, p_month text,
  p_indicators_month text, p_lines jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_run public.payroll_runs%ROWTYPE;
  v_total bigint;
  v_count integer;
  v_stale integer;
BEGIN
  IF p_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'Indica el mes en formato AAAA-MM.';
  END IF;
  IF jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('status','empty');
  END IF;
  PERFORM 1 FROM public.community_employees
    WHERE community_id=p_community_id AND active=true FOR SHARE;

  SELECT count(*) INTO v_stale FROM (
    SELECT e.id, e.monthly_amount FROM public.community_employees e
      WHERE e.community_id=p_community_id AND e.active=true
    EXCEPT
    SELECT (l->>'employee_id')::uuid, (l->>'base')::integer FROM jsonb_array_elements(p_lines) l
  ) diff;
  SELECT count(*) INTO v_count FROM public.community_employees
    WHERE community_id=p_community_id AND active=true;
  IF v_stale > 0 OR v_count <> jsonb_array_length(p_lines) THEN
    RETURN jsonb_build_object('status','stale');
  END IF;

  SELECT sum((l->>'amount')::bigint) INTO v_total FROM jsonb_array_elements(p_lines) l;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) l WHERE (l->>'amount')::bigint <= 0)
     OR v_total > 2147483647 THEN
    RAISE EXCEPTION 'Hay montos de liquidación fuera de rango.';
  END IF;

  INSERT INTO public.payroll_runs (community_id,month,total_amount,created_by,indicators_month)
  VALUES (p_community_id,p_month,v_total::integer,p_created_by,p_indicators_month)
  ON CONFLICT (community_id,month) DO NOTHING;
  SELECT * INTO v_run FROM public.payroll_runs
    WHERE community_id=p_community_id AND month=p_month FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'No se pudo preparar la remuneración.'; END IF;
  IF v_run.status='paid' THEN RETURN jsonb_build_object('status','already_paid'); END IF;
  IF v_run.journal_entry_id IS NOT NULL OR v_run.expense_id IS NOT NULL THEN
    RAISE EXCEPTION 'La liquidación tiene registros parciales; revísala antes de rehacerla.';
  END IF;

  DELETE FROM public.payroll_lines WHERE run_id=v_run.id;
  UPDATE public.payroll_runs
    SET total_amount=v_total::integer, indicators_month=p_indicators_month
    WHERE id=v_run.id;
  INSERT INTO public.payroll_lines
    (run_id,employee_id,full_name,role_title,amount,gross_amount,net_amount,breakdown)
  SELECT v_run.id, e.id, e.full_name, e.role_title,
         (l->>'amount')::integer, (l->>'gross')::integer, (l->>'net')::integer, l->'breakdown'
    FROM jsonb_array_elements(p_lines) l
    JOIN public.community_employees e ON e.id=(l->>'employee_id')::uuid
   WHERE e.community_id=p_community_id;
  RETURN jsonb_build_object('status','draft','id',v_run.id,'month',p_month,'total',v_total);
END;
$$;
REVOKE ALL ON FUNCTION public.create_payroll_run_with_lines(uuid,uuid,text,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_payroll_run_with_lines(uuid,uuid,text,text,jsonb)
  TO service_role;

COMMIT;
