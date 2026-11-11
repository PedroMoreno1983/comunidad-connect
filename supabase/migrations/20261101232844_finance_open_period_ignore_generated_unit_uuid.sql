-- unit_uuid es una columna generada (20261016155539). En un trigger BEFORE UPDATE
-- PostgreSQL aun no la calcula en NEW (queda NULL) mientras OLD la trae, asi que
-- marcar como pagado un cobro de un periodo cerrado se veia como un cambio de fondo
-- y se rechazaba. Se excluye de la comparacion; su valor depende solo de unit_id,
-- que si sigue protegido.

CREATE OR REPLACE FUNCTION public.assert_finance_period_open() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  subject jsonb;
  subject_month text;
  subject_community uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'expenses' THEN
      IF to_jsonb(NEW) - 'status' - 'paid_at' - 'payment_metadata' - 'unit_uuid'
         = to_jsonb(OLD) - 'status' - 'paid_at' - 'payment_metadata' - 'unit_uuid' THEN
        RETURN NEW;
      END IF;
    ELSIF TG_TABLE_NAME = 'unit_charges' THEN
      IF OLD.status <> 'cancelled' AND NEW.status <> 'cancelled'
         AND to_jsonb(NEW) - 'status' = to_jsonb(OLD) - 'status' THEN
        RETURN NEW;
      END IF;
    END IF;
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
