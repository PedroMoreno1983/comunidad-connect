-- Convenios de pago, remuneraciones y libro diario.
-- El cobro en línea sigue fuera: no hay pasarela. Estos flujos registran
-- transferencia, efectivo o cheque y dejan el asiento cuadrado.

CREATE TABLE IF NOT EXISTS public.payment_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  title text NOT NULL,
  total_amount integer NOT NULL CHECK (total_amount > 0),
  installment_count integer NOT NULL CHECK (installment_count BETWEEN 2 AND 36),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  notes text NOT NULL DEFAULT '',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS payment_agreements_one_active
  ON public.payment_agreements (community_id, unit_id)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.payment_agreement_installments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.payment_agreements(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL CHECK (sequence_number > 0),
  due_date date NOT NULL,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  paid_at date,
  payment_id uuid REFERENCES public.unit_payments(id) ON DELETE SET NULL,
  UNIQUE (agreement_id, sequence_number)
);

CREATE TABLE IF NOT EXISTS public.community_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  role_title text NOT NULL,
  monthly_amount integer NOT NULL CHECK (monthly_amount > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
  UNIQUE (community_id, code)
);

CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  memo text NOT NULL,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'agreement', 'payroll')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.ledger_accounts(id),
  debit integer NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit integer NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0),
  CHECK (debit > 0 OR credit > 0)
);

CREATE TABLE IF NOT EXISTS public.payroll_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'paid')),
  total_amount integer NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_at date,
  payment_reference text,
  journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  expense_id uuid REFERENCES public.community_expenses(id) ON DELETE SET NULL,
  expense_note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (community_id, month)
);

CREATE TABLE IF NOT EXISTS public.payroll_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.payroll_runs(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.community_employees(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  role_title text NOT NULL,
  amount integer NOT NULL CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS payment_agreements_community_idx
  ON public.payment_agreements (community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS payment_agreement_installments_agreement_idx
  ON public.payment_agreement_installments (agreement_id);
CREATE INDEX IF NOT EXISTS community_employees_community_idx
  ON public.community_employees (community_id);
CREATE INDEX IF NOT EXISTS journal_entries_community_idx
  ON public.journal_entries (community_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS journal_lines_entry_idx
  ON public.journal_lines (entry_id);
CREATE INDEX IF NOT EXISTS payroll_lines_run_idx
  ON public.payroll_lines (run_id);

ALTER TABLE public.payment_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_agreement_installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.journal_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_agreements_admin ON public.payment_agreements;
CREATE POLICY payment_agreements_admin ON public.payment_agreements
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS payment_agreements_resident_read ON public.payment_agreements;
CREATE POLICY payment_agreements_resident_read ON public.payment_agreements
  FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND unit_id IN (
      SELECT id FROM public.units
      WHERE owner_id = (SELECT auth.uid())
         OR id::text = (SELECT unit_id FROM public.profiles WHERE id = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS payment_agreement_installments_admin ON public.payment_agreement_installments;
CREATE POLICY payment_agreement_installments_admin ON public.payment_agreement_installments
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS payment_agreement_installments_resident_read ON public.payment_agreement_installments;
CREATE POLICY payment_agreement_installments_resident_read ON public.payment_agreement_installments
  FOR SELECT TO authenticated
  USING (
    agreement_id IN (
      SELECT id FROM public.payment_agreements
      WHERE community_id = public.current_profile_community_id()
        AND unit_id IN (
          SELECT id FROM public.units
          WHERE owner_id = (SELECT auth.uid())
             OR id::text = (SELECT unit_id FROM public.profiles WHERE id = (SELECT auth.uid()))
        )
    )
  );

DROP POLICY IF EXISTS community_employees_admin ON public.community_employees;
CREATE POLICY community_employees_admin ON public.community_employees
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS payroll_runs_admin ON public.payroll_runs;
CREATE POLICY payroll_runs_admin ON public.payroll_runs
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS payroll_lines_admin ON public.payroll_lines;
CREATE POLICY payroll_lines_admin ON public.payroll_lines
  FOR ALL TO authenticated
  USING (
    run_id IN (
      SELECT id FROM public.payroll_runs
      WHERE community_id = public.current_profile_community_id()
        AND public.current_profile_role() = 'admin'
    )
  )
  WITH CHECK (
    run_id IN (
      SELECT id FROM public.payroll_runs
      WHERE community_id = public.current_profile_community_id()
        AND public.current_profile_role() = 'admin'
    )
  );

DROP POLICY IF EXISTS ledger_accounts_admin ON public.ledger_accounts;
CREATE POLICY ledger_accounts_admin ON public.ledger_accounts
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS journal_entries_admin ON public.journal_entries;
CREATE POLICY journal_entries_admin ON public.journal_entries
  FOR ALL TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
  WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS journal_lines_admin ON public.journal_lines;
CREATE POLICY journal_lines_admin ON public.journal_lines
  FOR ALL TO authenticated
  USING (
    entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE community_id = public.current_profile_community_id()
        AND public.current_profile_role() = 'admin'
    )
  )
  WITH CHECK (
    entry_id IN (
      SELECT id FROM public.journal_entries
      WHERE community_id = public.current_profile_community_id()
        AND public.current_profile_role() = 'admin'
    )
  );
