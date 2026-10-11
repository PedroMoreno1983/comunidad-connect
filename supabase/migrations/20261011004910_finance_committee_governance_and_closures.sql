-- Gobierno financiero: integrantes vigentes, convenios sujetos a aprobación y
-- estados financieros cerrados por período. Solo el servidor usa estas tablas.
CREATE TABLE public.finance_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  appointed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  appointed_at timestamptz NOT NULL DEFAULT now(),
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ended_at timestamptz,
  ended_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CHECK (ended_at IS NULL OR ended_at::date >= starts_on)
);
CREATE UNIQUE INDEX finance_committee_one_open_membership
  ON public.finance_committee_members(community_id, resident_id)
  WHERE ended_at IS NULL;
CREATE INDEX finance_committee_members_active
  ON public.finance_committee_members(community_id, starts_on, ended_at);
ALTER TABLE public.finance_committee_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_committee_members FROM anon, authenticated;
GRANT ALL ON public.finance_committee_members TO service_role;

ALTER TABLE public.payment_agreements
  DROP CONSTRAINT IF EXISTS payment_agreements_status_check;
ALTER TABLE public.payment_agreements
  ADD CONSTRAINT payment_agreements_status_check
  CHECK (status IN ('pending_committee', 'active', 'completed', 'cancelled', 'rejected'));
ALTER TABLE public.payment_agreements
  ADD COLUMN committee_reviewer_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN committee_reviewed_at timestamptz,
  ADD COLUMN committee_review_note text CHECK (length(committee_review_note) <= 1000);
DROP INDEX IF EXISTS public.payment_agreements_one_active;
CREATE UNIQUE INDEX payment_agreements_one_open
  ON public.payment_agreements(community_id, unit_id)
  WHERE status IN ('pending_committee', 'active');

CREATE TABLE public.finance_period_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  opening_cash bigint NOT NULL CHECK (opening_cash >= 0),
  statements jsonb NOT NULL,
  closed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, month)
);
CREATE INDEX finance_period_closures_latest
  ON public.finance_period_closures(community_id, month DESC);
ALTER TABLE public.finance_period_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_period_closures FROM anon, authenticated;
REVOKE ALL ON public.finance_period_closures FROM service_role;
GRANT SELECT, INSERT ON public.finance_period_closures TO service_role;

-- Un corte bloquea también períodos anteriores. Las correcciones se registran
-- en un período abierto, preservando la foto contable del mes cerrado.
CREATE FUNCTION public.assert_finance_period_open() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  subject jsonb;
  subject_month text;
  subject_community uuid;
BEGIN
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
REVOKE ALL ON FUNCTION public.assert_finance_period_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_finance_period_open() TO service_role;

CREATE TRIGGER expenses_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
CREATE TRIGGER community_expenses_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.community_expenses
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
CREATE TRIGGER unit_charges_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.unit_charges
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
CREATE TRIGGER unit_payments_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.unit_payments
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('paid_at');
CREATE TRIGGER reserve_fund_movements_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.reserve_fund_movements
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
CREATE TRIGGER journal_entries_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('entry_date');

CREATE FUNCTION public.assert_journal_line_period_open() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  subject_entry uuid;
  subject_community uuid;
  subject_month text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    subject_entry := OLD.entry_id;
    SELECT community_id, left(entry_date::text, 7) INTO subject_community, subject_month
      FROM public.journal_entries WHERE id = subject_entry;
    IF EXISTS (SELECT 1 FROM public.finance_period_closures
               WHERE community_id = subject_community AND month >= subject_month) THEN
      RAISE EXCEPTION 'El asiento pertenece a un período cerrado.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    subject_entry := NEW.entry_id;
    SELECT community_id, left(entry_date::text, 7) INTO subject_community, subject_month
      FROM public.journal_entries WHERE id = subject_entry;
    IF EXISTS (SELECT 1 FROM public.finance_period_closures
               WHERE community_id = subject_community AND month >= subject_month) THEN
      RAISE EXCEPTION 'El asiento pertenece a un período cerrado.' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION public.assert_journal_line_period_open() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_journal_line_period_open() TO service_role;
CREATE TRIGGER journal_lines_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.assert_journal_line_period_open();
