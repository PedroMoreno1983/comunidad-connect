-- Un pago posterior puede saldar una deuda de un mes ya cerrado. Esto solo
-- cambia su estado de cobranza; el monto emitido y el corte permanecen iguales.
CREATE OR REPLACE FUNCTION public.assert_finance_period_open() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  subject jsonb;
  subject_month text;
  subject_community uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'expenses'
     AND to_jsonb(NEW) - 'status' - 'paid_at' - 'payment_metadata'
         = to_jsonb(OLD) - 'status' - 'paid_at' - 'payment_metadata' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'unit_charges'
     AND OLD.status <> 'cancelled' AND NEW.status <> 'cancelled'
     AND to_jsonb(NEW) - 'status' = to_jsonb(OLD) - 'status' THEN
    RETURN NEW;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    subject := to_jsonb(OLD);
    subject_month := left(subject ->> TG_ARGV[0], 7);
    subject_community := (subject ->> 'community_id')::uuid;
    IF EXISTS (SELECT 1 FROM public.finance_period_closures
               WHERE community_id = subject_community AND month >= subject_month) THEN
      RAISE EXCEPTION 'El período % está cerrado; registra el ajuste en un mes abierto.', subject_month USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    subject := to_jsonb(NEW);
    subject_month := left(subject ->> TG_ARGV[0], 7);
    subject_community := (subject ->> 'community_id')::uuid;
    IF EXISTS (SELECT 1 FROM public.finance_period_closures
               WHERE community_id = subject_community AND month >= subject_month) THEN
      RAISE EXCEPTION 'El período % está cerrado; registra el ajuste en un mes abierto.', subject_month USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
