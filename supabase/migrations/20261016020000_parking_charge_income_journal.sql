-- Estacionamientos: el arriendo pagado entra al libro contable.
--
-- Bug que dejó a la vista el test de punta a punta (PR #184): un arriendo
-- cobrado por Haulmer no registraba la entrada de dinero, pero la liquidación al
-- dueño sí se registraba (débito a la 2400 y gasto "Liquidaciones a dueños"). Con
-- comisión 0 % el resultado quedaba en −neto en vez de 0. Por gastos comunes,
-- además, la 2400 quedaba deudora por el neto aunque al dueño ya se le hubiera
-- pagado: nunca se reconocía la obligación con él.
--
-- Regla (decisión del 15-oct): cuando un cobro de estacionamiento pasa a
-- 'paid' se registra, en la misma transacción, UN asiento de reconocimiento:
--
--   debe  1100 Banco (Haulmer: el dinero entró al banco)
--         o 1200 Cuentas por cobrar (gastos comunes: el pago de la unidad ya
--         entró al banco contra la 1200; el cargo de arriendo es la cuenta por
--         cobrar que ese pago saldó)                                   bruto
--   haber 2400 Liquidaciones a dueños de estacionamientos               neto
--   haber 4300 Comisiones por arriendo de estacionamientos              comisión
--
-- El neto queda en la 2400 hasta liquidar: la transferencia (2400 contra 1100,
-- ya existía), el abono a gastos comunes (2400 contra 1200, ya existía) o la
-- donación al fondo de reserva (nuevo: 2400 contra 3100 Fondo de reserva) la
-- dejan en 0. Así los dos caminos de cobro terminan igual.
--
-- La comisión es la de la liquidación (parking_payouts, que se crea en el
-- trigger trg_parking_charges_payout, que corre antes que este por orden de
-- nombre). Si la liquidación no se pudo crear, se usa la misma regla de
-- parking_payout_open: la fijada en la reserva si cuadra con el cobro; si no,
-- la tasa vigente con parking_payout_split.
--
-- Idempotencia: el asiento cuelga de un evento 'ledger_recorded' de la
-- bitácora del cobro (journal_entries.source_record_id = id del evento). Solo se
-- registra si el último evento contable del cobro no es ya un 'ledger_recorded'
-- (el webhook repetido ni siquiera cambia el estado: devuelve 'idempotent').
--
-- Reversa: si el cobro sale de 'paid' (el pago de la unidad se eliminó →
-- 'charged', o se reembolsó → 'refunded') se registra el espejo exacto del
-- asiento vigente (evento 'ledger_reversed', source 'parking_charge_reversal').
-- La liquidación sigue sus propias reglas (AGENTS.md): pendiente → on_hold o
-- anulada; ya ejecutada → nunca se revierte sola, queda para revisión. En ese
-- caso la 2400 queda deudora por el neto entregado: lo que hay que recuperar o
-- regularizar con el dueño.
--
-- Clasificación pendiente de validación profesional, igual que el resto del
-- libro. Producción no tiene cobros de estacionamiento al aplicar esta
-- migración; igual se regularizan los que hubiera (paso 6).
BEGIN;

-- ============================================================
-- 1. Nuevos orígenes de asiento
-- ============================================================
ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_source_check;
ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_source_check
  CHECK (source IN ('manual', 'agreement', 'payroll', 'payment', 'payment_reversal',
                    'parking_charge', 'parking_charge_reversal'));

-- ============================================================
-- 2. Cuentas del libro que usa estacionamientos
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_ledger_account(p_community UUID, p_code TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.ledger_accounts (community_id, code, name, kind)
  SELECT p_community, a.code, a.name, a.kind
  FROM (VALUES
    ('1100', 'Banco', 'asset'),
    ('1200', 'Cuentas por cobrar a unidades', 'asset'),
    ('2400', 'Liquidaciones a dueños de estacionamientos', 'liability'),
    ('3100', 'Fondo de reserva', 'equity'),
    ('4300', 'Comisiones por arriendo de estacionamientos', 'income')
  ) AS a(code, name, kind)
  WHERE a.code = p_code
  ON CONFLICT (community_id, code) DO NOTHING;
  SELECT id INTO STRICT v_id FROM public.ledger_accounts WHERE community_id = p_community AND code = p_code;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.parking_ledger_account(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_ledger_account(UUID, TEXT) TO service_role;

-- ============================================================
-- 3. Comisión de un cobro: la de su liquidación o, si no hay, la misma regla
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_commission(p_charge_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_booking public.parking_bookings%ROWTYPE;
  v_commission INTEGER;
  v_percent NUMERIC;
BEGIN
  SELECT commission_amount INTO v_commission FROM public.parking_payouts WHERE charge_id = p_charge_id;
  IF v_commission IS NOT NULL THEN
    RETURN v_commission;
  END IF;
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id;
  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = v_charge.booking_id;
  IF v_booking.id IS NOT NULL AND v_booking.total_amount = v_charge.amount
     AND v_booking.community_fee_amount BETWEEN 0 AND v_charge.amount THEN
    RETURN v_booking.community_fee_amount;
  END IF;
  SELECT parking_commission_percent INTO v_percent FROM public.communities WHERE id = v_charge.community_id;
  SELECT s.commission_amount INTO v_commission FROM public.parking_payout_split(v_charge.amount, COALESCE(v_percent, 0)) s;
  RETURN COALESCE(v_commission, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.parking_charge_commission(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_charge_commission(UUID) TO service_role;

-- ============================================================
-- 4. Reconocimiento y reversa
-- ============================================================
-- Último evento contable del cobro ('ledger_recorded' o 'ledger_reversed').
CREATE OR REPLACE FUNCTION public.parking_charge_ledger_last_event(p_charge_id UUID)
RETURNS public.parking_charge_events
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.* FROM public.parking_charge_events e
  WHERE e.charge_id = p_charge_id AND e.event_type IN ('ledger_recorded', 'ledger_reversed')
  ORDER BY e.seq DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.parking_charge_ledger_last_event(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_charge_ledger_last_event(UUID) TO service_role;

-- Registra el asiento del arriendo pagado. Devuelve el asiento, o NULL si ya
-- estaba registrado (idempotente) o no hay monto.
CREATE OR REPLACE FUNCTION public.parking_charge_journal_record(p_charge_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_last public.parking_charge_events%ROWTYPE;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
  v_commission INTEGER;
  v_net INTEGER;
  v_debit_code TEXT;
  v_entry UUID := gen_random_uuid();
  v_event UUID := gen_random_uuid();
  v_label TEXT;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL OR v_charge.status <> 'paid' OR v_charge.amount <= 0 THEN
    RETURN NULL;
  END IF;
  v_last := public.parking_charge_ledger_last_event(p_charge_id);
  IF v_last.event_type = 'ledger_recorded' THEN
    RETURN NULL;
  END IF;

  v_commission := LEAST(GREATEST(public.parking_charge_commission(p_charge_id), 0), v_charge.amount);
  v_net := v_charge.amount - v_commission;
  v_debit_code := CASE WHEN v_charge.method = 'haulmer' THEN '1100' ELSE '1200' END;
  SELECT label INTO v_label FROM public.parking_spots
  WHERE id = (SELECT spot_id FROM public.parking_bookings WHERE id = v_charge.booking_id);

  INSERT INTO public.journal_entries (id, community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES (v_entry, v_charge.community_id, v_today,
          left(CASE WHEN v_charge.method = 'haulmer' THEN 'Arriendo de estacionamiento pagado por Haulmer'
                    ELSE 'Arriendo de estacionamiento pagado en gastos comunes' END
               || COALESCE(' (' || v_label || ')', ''), 240),
          'parking_charge', v_event, NULL);

  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
  VALUES (v_entry, public.parking_ledger_account(v_charge.community_id, v_debit_code), v_charge.amount, 0);
  IF v_net > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
    VALUES (v_entry, public.parking_ledger_account(v_charge.community_id, '2400'), 0, v_net);
  END IF;
  IF v_commission > 0 THEN
    INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
    VALUES (v_entry, public.parking_ledger_account(v_charge.community_id, '4300'), 0, v_commission);
  END IF;

  INSERT INTO public.parking_charge_events (id, charge_id, community_id, event_type, from_status, to_status, amount, details)
  VALUES (v_event, v_charge.id, v_charge.community_id, 'ledger_recorded', v_charge.status, v_charge.status, v_charge.amount,
          jsonb_build_object('journal_entry_id', v_entry, 'debit_account', v_debit_code,
                             'owner_net', v_net, 'commission', v_commission));
  RETURN v_entry;
END;
$$;

-- Registra el espejo exacto del asiento vigente. Devuelve el asiento de
-- reversa, o NULL si no había nada vigente (idempotente).
CREATE OR REPLACE FUNCTION public.parking_charge_journal_reverse(p_charge_id UUID, p_reason TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_last public.parking_charge_events%ROWTYPE;
  v_original UUID;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
  v_entry UUID := gen_random_uuid();
  v_event UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL THEN
    RETURN NULL;
  END IF;
  v_last := public.parking_charge_ledger_last_event(p_charge_id);
  IF v_last.id IS NULL OR v_last.event_type <> 'ledger_recorded' THEN
    RETURN NULL;
  END IF;
  v_original := (v_last.details ->> 'journal_entry_id')::uuid;

  INSERT INTO public.journal_entries (id, community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES (v_entry, v_charge.community_id, v_today,
          CASE WHEN p_reason = 'refunded' THEN 'Reembolso de arriendo de estacionamiento'
               ELSE 'Reversa de arriendo de estacionamiento (se revirtió el pago)' END,
          'parking_charge_reversal', v_event, NULL);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
  SELECT v_entry, l.account_id, l.credit, l.debit
  FROM public.journal_lines l WHERE l.entry_id = v_original;

  INSERT INTO public.parking_charge_events (id, charge_id, community_id, event_type, from_status, to_status, amount, details)
  VALUES (v_event, v_charge.id, v_charge.community_id, 'ledger_reversed', v_charge.status, v_charge.status, v_charge.amount,
          jsonb_build_object('journal_entry_id', v_entry, 'reverses_journal_entry_id', v_original, 'reason', p_reason));
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.parking_charge_journal_record(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_journal_reverse(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_charge_journal_record(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.parking_charge_journal_reverse(UUID, TEXT) TO service_role;

-- El estado del cobro manda: entrar a 'paid' registra, salir de 'paid' revierte.
-- A diferencia de la liquidación, un error aquí SÍ rompe la transición: el
-- dinero no puede quedar fuera del libro (p. ej. con el mes en curso cerrado,
-- Haulmer recibe un error y reintenta).
CREATE OR REPLACE FUNCTION public.parking_charge_follow_ledger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.parking_charge_journal_record(NEW.id);
  ELSIF OLD.status = 'paid' AND NEW.status IS DISTINCT FROM 'paid' THEN
    PERFORM public.parking_charge_journal_reverse(NEW.id, NEW.status);
  END IF;
  RETURN NEW;
END;
$$;

-- El nombre ordena: corre después de trg_parking_charges_payout, que crea la
-- liquidación de la que se toma la comisión.
DROP TRIGGER IF EXISTS trg_parking_charges_payout_ledger ON public.parking_charges;
CREATE TRIGGER trg_parking_charges_payout_ledger
AFTER UPDATE OF status ON public.parking_charges
FOR EACH ROW EXECUTE FUNCTION public.parking_charge_follow_ledger();

-- ============================================================
-- 5. La donación al fondo de reserva también salda la 2400
-- ============================================================
-- 2400 (debe) contra 3100 Fondo de reserva (haber), source 'manual' y
-- source_record_id = la liquidación, como la transferencia (ambos estados son
-- terminales y excluyentes: un solo asiento por liquidación).
CREATE OR REPLACE FUNCTION public.parking_payout_journal_donation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'donated' AND OLD.status IS DISTINCT FROM 'donated' AND NEW.net_amount > 0
     AND NOT EXISTS (SELECT 1 FROM public.journal_entries
                     WHERE community_id = NEW.community_id AND source = 'manual' AND source_record_id = NEW.id) THEN
    PERFORM public.parking_payout_post_donation(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_payout_post_donation(p_payout_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_entry UUID := gen_random_uuid();
BEGIN
  SELECT * INTO v_payout FROM public.parking_payouts WHERE id = p_payout_id;
  IF v_payout.id IS NULL OR v_payout.status <> 'donated' OR v_payout.net_amount <= 0
     OR EXISTS (SELECT 1 FROM public.journal_entries
                WHERE community_id = v_payout.community_id AND source = 'manual' AND source_record_id = v_payout.id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.journal_entries (id, community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES (v_entry, v_payout.community_id, (NOW() AT TIME ZONE 'America/Santiago')::date,
          'Donación al fondo de reserva de un arriendo de estacionamiento', 'manual', v_payout.id, NULL);
  INSERT INTO public.journal_lines (entry_id, account_id, debit, credit)
  VALUES (v_entry, public.parking_ledger_account(v_payout.community_id, '2400'), v_payout.net_amount, 0),
         (v_entry, public.parking_ledger_account(v_payout.community_id, '3100'), 0, v_payout.net_amount);
  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.parking_payout_post_donation(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_payout_post_donation(UUID) TO service_role;

DROP TRIGGER IF EXISTS trg_parking_payouts_journal_donation ON public.parking_payouts;
CREATE TRIGGER trg_parking_payouts_journal_donation
AFTER UPDATE OF status ON public.parking_payouts
FOR EACH ROW EXECUTE FUNCTION public.parking_payout_journal_donation();

REVOKE ALL ON FUNCTION public.parking_charge_follow_ledger() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_journal_donation() FROM PUBLIC, anon, authenticated;

-- ============================================================
-- 6. Regularización: cobros ya pagados y donaciones ya hechas
-- ============================================================
DO $$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN SELECT id FROM public.parking_charges WHERE status = 'paid' AND amount > 0 ORDER BY created_at LOOP
    PERFORM public.parking_charge_journal_record(v_row.id);
  END LOOP;
  FOR v_row IN SELECT id FROM public.parking_payouts WHERE status = 'donated' LOOP
    PERFORM public.parking_payout_post_donation(v_row.id);
  END LOOP;
END $$;

COMMIT;
