-- Registrar la entrada de dinero en el libro dentro de la misma transacción
-- que crea o elimina el pago. No sustituye el saldo de apertura ni la
-- clasificación contable pendiente de validación profesional.
BEGIN;

-- La versión anterior evaluaba OLD.status de unit_charges incluso durante
-- INSERT de unit_payments. PL/pgSQL no garantiza cortocircuito entre AND y el
-- pago fallaba con «record old has no field status».
CREATE OR REPLACE FUNCTION public.assert_finance_period_open() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  subject jsonb;
  subject_month text;
  subject_community uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF TG_TABLE_NAME = 'expenses' THEN
      IF to_jsonb(NEW) - 'status' - 'paid_at' - 'payment_metadata'
         = to_jsonb(OLD) - 'status' - 'paid_at' - 'payment_metadata' THEN
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

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS source_record_id uuid;
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'agreement', 'payroll', 'payment', 'payment_reversal'));
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_source_record_once
  ON public.journal_entries (community_id, source, source_record_id)
  WHERE source_record_id IS NOT NULL;

-- La versión anterior de la aplicación contabilizaba una cuota de convenio
-- como ingreso nuevo después de registrar su pago. El pago ya genera su
-- asiento correcto, por lo que se rechaza ese segundo asiento hasta que el
-- despliegue de la aplicación retire la llamada antigua.
CREATE OR REPLACE FUNCTION public.finance_reject_legacy_agreement_journal()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.source = 'agreement' THEN
    RAISE EXCEPTION 'Las cuotas de convenio se contabilizan con el pago de unidad.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.finance_reject_legacy_agreement_journal() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_reject_legacy_agreement_journal() TO service_role;
DROP TRIGGER IF EXISTS finance_reject_legacy_agreement_journal ON public.journal_entries;
CREATE TRIGGER finance_reject_legacy_agreement_journal
  BEFORE INSERT ON public.journal_entries FOR EACH ROW
  EXECUTE FUNCTION public.finance_reject_legacy_agreement_journal();

CREATE OR REPLACE FUNCTION public.finance_journal_unit_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry uuid;
  v_bank uuid;
  v_receivable uuid;
  v_amount integer;
  v_community uuid;
  v_payment uuid;
  v_paid_at date;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.community_id IS DISTINCT FROM OLD.community_id
      OR NEW.unit_id IS DISTINCT FROM OLD.unit_id
      OR NEW.amount IS DISTINCT FROM OLD.amount
      OR NEW.paid_at IS DISTINCT FROM OLD.paid_at THEN
      RAISE EXCEPTION 'Corrige el pago mediante anulación y nuevo registro.';
    END IF;
    RETURN NEW;
  END IF;

  v_community := CASE WHEN TG_OP = 'INSERT' THEN NEW.community_id ELSE OLD.community_id END;
  v_payment := CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END;
  v_paid_at := CASE WHEN TG_OP = 'INSERT' THEN NEW.paid_at ELSE OLD.paid_at END;
  IF TG_OP = 'INSERT' THEN v_amount := NEW.amount; ELSE v_amount := OLD.amount; END IF;
  IF v_amount <= 0 OR v_amount > 2147483647 OR
    (CASE WHEN TG_OP = 'INSERT' THEN NEW.amount ELSE OLD.amount END) <> v_amount THEN
    RAISE EXCEPTION 'El monto del pago debe ser un número entero de pesos dentro del rango contable.';
  END IF;

  INSERT INTO public.ledger_accounts (community_id, code, name, kind)
  VALUES (v_community, '1100', 'Banco', 'asset'),
         (v_community, '1200', 'Cuentas por cobrar a unidades', 'asset')
  ON CONFLICT (community_id, code) DO NOTHING;
  SELECT id INTO STRICT v_bank FROM public.ledger_accounts
    WHERE community_id = v_community AND code = '1100';
  SELECT id INTO STRICT v_receivable FROM public.ledger_accounts
    WHERE community_id = v_community AND code = '1200';

  INSERT INTO public.journal_entries
    (community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES
    (v_community, v_paid_at,
     CASE WHEN TG_OP = 'INSERT' THEN 'Pago de unidad' ELSE 'Reversa de pago de unidad' END,
     CASE WHEN TG_OP = 'INSERT' THEN 'payment' ELSE 'payment_reversal' END,
     v_payment,
     CASE WHEN TG_OP = 'INSERT' THEN NEW.recorded_by ELSE OLD.recorded_by END)
  RETURNING id INTO v_entry;

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
  VALUES
    (v_entry, v_bank,
     CASE WHEN TG_OP = 'INSERT' THEN v_amount ELSE 0 END,
     CASE WHEN TG_OP = 'DELETE' THEN v_amount ELSE 0 END),
    (v_entry, v_receivable,
     CASE WHEN TG_OP = 'DELETE' THEN v_amount ELSE 0 END,
     CASE WHEN TG_OP = 'INSERT' THEN v_amount ELSE 0 END);
  RETURN CASE WHEN TG_OP = 'INSERT' THEN NEW ELSE OLD END;
END;
$$;

REVOKE ALL ON FUNCTION public.finance_journal_unit_payment() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finance_journal_unit_payment() TO service_role;

DROP TRIGGER IF EXISTS finance_journal_unit_payment_insert ON public.unit_payments;
CREATE TRIGGER finance_journal_unit_payment_insert
  AFTER INSERT ON public.unit_payments FOR EACH ROW
  EXECUTE FUNCTION public.finance_journal_unit_payment();
DROP TRIGGER IF EXISTS finance_journal_unit_payment_delete ON public.unit_payments;
CREATE TRIGGER finance_journal_unit_payment_delete
  AFTER DELETE ON public.unit_payments FOR EACH ROW
  EXECUTE FUNCTION public.finance_journal_unit_payment();
DROP TRIGGER IF EXISTS finance_journal_unit_payment_update ON public.unit_payments;
CREATE TRIGGER finance_journal_unit_payment_update
  BEFORE UPDATE ON public.unit_payments FOR EACH ROW
  EXECUTE FUNCTION public.finance_journal_unit_payment();

-- Pago de convenio: pago, asiento, cuota y estado del convenio se confirman
-- juntos. Un fallo en cualquiera de ellos revierte la operación completa.
CREATE OR REPLACE FUNCTION public.pay_agreement_installment_atomic(
  p_community_id uuid, p_installment_id uuid, p_paid_at date,
  p_method text, p_reference text, p_recorded_by uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE
  v_installment record;
  v_payment uuid;
  v_reference text;
BEGIN
  SELECT i.id, i.agreement_id, i.amount, i.status AS installment_status,
         i.sequence_number, a.unit_id, a.title, a.status AS agreement_status
  INTO v_installment
  FROM public.payment_agreement_installments i
  JOIN public.payment_agreements a ON a.id = i.agreement_id
  WHERE i.id = p_installment_id AND i.community_id = p_community_id
    AND a.community_id = p_community_id
  FOR UPDATE OF i, a;
  IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_found'); END IF;
  IF v_installment.agreement_status <> 'active' THEN
    RETURN jsonb_build_object('status', 'closed');
  END IF;
  IF v_installment.installment_status = 'paid' THEN
    RETURN jsonb_build_object('status', 'already_paid');
  END IF;
  v_reference := coalesce(nullif(trim(p_reference), ''),
    'convenio-' || left(p_installment_id::text, 8) || '-' || v_installment.sequence_number);
  INSERT INTO public.unit_payments
    (community_id, unit_id, amount, paid_at, method, reference, notes, recorded_by)
  VALUES
    (p_community_id, v_installment.unit_id, v_installment.amount,
     p_paid_at, p_method, v_reference,
     'Cuota ' || v_installment.sequence_number || ' del convenio «' || v_installment.title || '».',
     p_recorded_by)
  RETURNING id INTO v_payment;
  UPDATE public.payment_agreement_installments
    SET status = 'paid', paid_at = p_paid_at, payment_id = v_payment
    WHERE id = p_installment_id;
  UPDATE public.payment_agreements
    SET status = CASE WHEN EXISTS (
      SELECT 1 FROM public.payment_agreement_installments
      WHERE agreement_id = v_installment.agreement_id AND status = 'pending'
    ) THEN 'active' ELSE 'completed' END,
    updated_at = now()
    WHERE id = v_installment.agreement_id;
  RETURN jsonb_build_object('status', 'paid', 'paymentId', v_payment,
    'unitId', v_installment.unit_id);
END;
$$;
REVOKE ALL ON FUNCTION public.pay_agreement_installment_atomic(uuid, uuid, date, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_agreement_installment_atomic(uuid, uuid, date, text, text, uuid)
  TO service_role;

-- Los pagos anteriores al trigger quedan trazados sin modificar su fecha.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.unit_payments
             WHERE amount <> trunc(amount) OR amount > 2147483647) THEN
    RAISE EXCEPTION 'Hay pagos históricos fuera del rango de pesos enteros; revisa antes de migrar.';
  END IF;
END $$;
INSERT INTO public.ledger_accounts (community_id, code, name, kind)
SELECT DISTINCT community_id, '1100', 'Banco', 'asset' FROM public.unit_payments
ON CONFLICT (community_id, code) DO NOTHING;
INSERT INTO public.ledger_accounts (community_id, code, name, kind)
SELECT DISTINCT community_id, '1200', 'Cuentas por cobrar a unidades', 'asset' FROM public.unit_payments
ON CONFLICT (community_id, code) DO NOTHING;

WITH inserted AS (
  INSERT INTO public.journal_entries
    (community_id, entry_date, memo, source, source_record_id, created_by)
  SELECT p.community_id, p.paid_at, 'Pago de unidad (histórico)', 'payment', p.id, p.recorded_by
  FROM public.unit_payments p
  WHERE p.amount = trunc(p.amount) AND p.amount <= 2147483647
  ON CONFLICT DO NOTHING
  RETURNING id, community_id, source_record_id
)
INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
SELECT i.id, a.id,
  CASE WHEN a.code = '1100' THEN p.amount::integer ELSE 0 END,
  CASE WHEN a.code = '1200' THEN p.amount::integer ELSE 0 END
FROM inserted i
JOIN public.unit_payments p ON p.id = i.source_record_id
JOIN public.ledger_accounts a ON a.community_id = i.community_id AND a.code IN ('1100', '1200');

COMMIT;
