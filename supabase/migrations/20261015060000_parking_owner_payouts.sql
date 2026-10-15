-- Liquidación al dueño de los arriendos de estacionamiento.
--
-- Hasta ahora el libro de cobros (20261013160000) le cobraba al arrendatario,
-- pero el dinero quedaba en la comunidad: el dueño del cupo no recibía nada.
-- Esta migración agrega la otra mitad:
--
--   1. parking_owner_payout_settings: lo que decide cada dueño (por comunidad):
--      a dónde va lo recaudado y, si quiere transferencia, sus datos bancarios.
--        - bank_transfer: la administración transfiere fuera de la app y la
--          marca como pagada (fecha, referencia y nota opcional).
--        - common_expenses_credit: abono a la cuenta de gastos comunes de su
--          unidad (un unit_payments sin imputar: baja su saldo y su próximo cobro).
--        - reserve_fund_donation: donación al fondo de reserva (un aporte en
--          reserve_fund_movements).
--      Sin elección explícita (destination NULL) rige el destino automático:
--      transferencia si tiene los datos bancarios completos; si no, abono a
--      gastos comunes. Así nadie queda sin recibir lo suyo por no haber elegido.
--   2. parking_payouts: exactamente UNA liquidación por cobro (UNIQUE charge_id),
--      con bruto, comisión de la comunidad y neto (bruto = comisión + neto, en
--      pesos enteros) y el destino CONGELADO al crearla (cambiar la preferencia
--      después solo afecta a las siguientes).
--   3. parking_payout_events: bitácora append-only.
--
-- ¿Cuándo se liquida? Solo cuando el cobro al arrendatario está PAGADO
-- (parking_charges.status = 'paid'). "Cargado a gastos comunes" ('charged') NO
-- cuenta: es una deuda de la unidad del arrendatario, todavía no hay dinero. El
-- cobro pasa a 'paid' cuando la cartola registra el pago real de ese cargo
-- (evento paid_in_common_expenses, vía unit_charges.status = 'paid') o cuando
-- Haulmer confirma el pago (provider_paid). Ese es el disparador.
--
-- Comisión: communities.parking_commission_percent (ya existía, 0 % por
-- defecto). Se amplía el rango a 0–100 con 2 decimales. Se respeta la que quedó
-- fijada en la reserva (parking_bookings.community_fee_amount), que es la que
-- vieron dueño y arrendatario al reservar; si la reserva no cuadra con el cobro,
-- se calcula con la tasa vigente. Redondeo: al peso más cercano, la mitad hacia
-- arriba, igual que las reservas. La comisión se queda en la comunidad (ya está
-- en su cuenta: no hay movimiento que hacer); el neto va al destino del dueño.
--
-- Reversas: si el pago del arrendatario se revierte, la liquidación pendiente
-- queda suspendida (on_hold) y se reanuda cuando vuelva a pagarse. Si el cobro
-- se anula o reembolsa, la pendiente se anula. Una liquidación ya ejecutada
-- (transferida, abonada o donada) NUNCA se revierte sola: queda marcada para
-- revisión de la administración.
--
-- Compatibilidad: todo es aditivo. El código de producción actual no lee estas
-- tablas; los triggers solo agregan filas y no cambian el resultado de ninguna
-- escritura existente (un error al liquidar se registra y no rompe el cobro).
BEGIN;

-- ============================================================
-- 1. Comisión de la comunidad: 0–100 %, hasta 2 decimales
-- ============================================================
ALTER TABLE public.communities DROP CONSTRAINT IF EXISTS communities_parking_commission_range;
ALTER TABLE public.communities
  ADD CONSTRAINT communities_parking_commission_range
  CHECK (parking_commission_percent >= 0 AND parking_commission_percent <= 100);

COMMENT ON COLUMN public.communities.parking_commission_percent IS
  'Comisión de la comunidad sobre cada arriendo de estacionamiento, en % (0–100, 2 decimales; 0 por defecto). Se queda en la comunidad; el resto se liquida al dueño del cupo (parking_payouts).';

-- ============================================================
-- 2. Utilidades puras
-- ============================================================
-- Comisión y neto en pesos enteros. La tasa se lleva a centésimas de punto
-- (12,35 % = 1235) y se redondea al peso con la mitad hacia arriba, sin pasar
-- por punto flotante. neto = bruto - comisión, así que la suma siempre cuadra.
-- Espejo exacto de splitParkingPayout (src/lib/parkingPayouts/payouts.ts).
CREATE OR REPLACE FUNCTION public.parking_payout_split(p_gross INTEGER, p_percent NUMERIC)
RETURNS TABLE (commission_amount INTEGER, net_amount INTEGER)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_bp BIGINT;
  v_commission BIGINT;
BEGIN
  IF p_gross IS NULL OR p_gross < 0 THEN
    RAISE EXCEPTION 'El monto bruto debe ser un entero de pesos mayor o igual a cero' USING ERRCODE = '22023';
  END IF;
  v_bp := round(LEAST(GREATEST(COALESCE(p_percent, 0), 0), 100) * 100)::BIGINT;
  v_commission := (p_gross::BIGINT * v_bp + 5000) / 10000;
  commission_amount := v_commission::INTEGER;
  net_amount := p_gross - v_commission::INTEGER;
  RETURN NEXT;
END;
$$;

-- RUT chileno: cuerpo de 7 u 8 dígitos y dígito verificador (módulo 11).
-- Recibe el RUT ya normalizado ('12345678-5').
CREATE OR REPLACE FUNCTION public.parking_rut_is_valid(p_rut TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_body TEXT;
  v_dv TEXT;
  v_sum INTEGER := 0;
  v_mul INTEGER := 2;
  v_rest INTEGER;
  v_expected TEXT;
  i INTEGER;
BEGIN
  IF p_rut IS NULL OR p_rut !~ '^[0-9]{7,8}-[0-9K]$' THEN
    RETURN FALSE;
  END IF;
  v_body := split_part(p_rut, '-', 1);
  v_dv := split_part(p_rut, '-', 2);
  FOR i IN REVERSE char_length(v_body)..1 LOOP
    v_sum := v_sum + substr(v_body, i, 1)::INTEGER * v_mul;
    v_mul := CASE WHEN v_mul = 7 THEN 2 ELSE v_mul + 1 END;
  END LOOP;
  v_rest := 11 - (v_sum % 11);
  v_expected := CASE v_rest WHEN 11 THEN '0' WHEN 10 THEN 'K' ELSE v_rest::TEXT END;
  RETURN v_expected = v_dv;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_normalize_rut(p_rut TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_rut IS NULL OR btrim(p_rut) = '' THEN NULL
    ELSE (
      SELECT CASE WHEN char_length(c) >= 2
                  THEN left(c, char_length(c) - 1) || '-' || right(c, 1)
                  ELSE c END
      FROM (SELECT upper(regexp_replace(p_rut, '[^0-9kK]', '', 'g')) AS c) s
    )
  END;
$$;

-- ============================================================
-- 3. Preferencia y datos bancarios del dueño
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_owner_payout_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- NULL = destino automático (transferencia si hay datos bancarios completos; si no, abono a GC).
  destination TEXT
    CHECK (destination IS NULL OR destination IN ('bank_transfer', 'common_expenses_credit', 'reserve_fund_donation')),
  -- Unidad a la que se abona. NULL = la unidad del dueño (si tiene una sola).
  credit_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  bank_name TEXT CHECK (bank_name IS NULL OR char_length(btrim(bank_name)) BETWEEN 2 AND 60),
  bank_account_type TEXT CHECK (bank_account_type IS NULL OR bank_account_type IN ('corriente', 'vista', 'ahorro')),
  bank_account_number TEXT CHECK (bank_account_number IS NULL OR bank_account_number ~ '^[0-9][0-9-]{3,24}$'),
  holder_rut TEXT CHECK (holder_rut IS NULL OR public.parking_rut_is_valid(holder_rut)),
  holder_name TEXT CHECK (holder_name IS NULL OR char_length(btrim(holder_name)) BETWEEN 3 AND 120),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_owner_payout_settings_unique UNIQUE (community_id, profile_id),
  -- Elegir transferencia exige datos bancarios completos.
  CONSTRAINT parking_owner_payout_settings_bank_complete CHECK (
    destination IS DISTINCT FROM 'bank_transfer'
    OR (bank_name IS NOT NULL AND bank_account_type IS NOT NULL AND bank_account_number IS NOT NULL
        AND holder_rut IS NOT NULL AND holder_name IS NOT NULL)
  )
);

DROP TRIGGER IF EXISTS trg_parking_owner_payout_settings_touch ON public.parking_owner_payout_settings;
CREATE TRIGGER trg_parking_owner_payout_settings_touch
BEFORE UPDATE ON public.parking_owner_payout_settings
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

-- ============================================================
-- 4. Liquidaciones
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  -- Una liquidación por cobro: esta restricción es la idempotencia.
  charge_id UUID NOT NULL REFERENCES public.parking_charges(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES public.parking_bookings(id) ON DELETE CASCADE,
  spot_id UUID REFERENCES public.parking_spots(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  gross_amount INTEGER NOT NULL CHECK (gross_amount > 0),
  -- NULL cuando la comisión se tomó tal como quedó fijada en la reserva.
  commission_percent NUMERIC(5, 2) CHECK (commission_percent IS NULL OR commission_percent BETWEEN 0 AND 100),
  commission_source TEXT NOT NULL CHECK (commission_source IN ('booking', 'community_rate')),
  commission_amount INTEGER NOT NULL CHECK (commission_amount >= 0),
  net_amount INTEGER NOT NULL CHECK (net_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CLP' CHECK (currency = 'CLP'),
  destination TEXT NOT NULL
    CHECK (destination IN ('bank_transfer', 'common_expenses_credit', 'reserve_fund_donation')),
  destination_source TEXT NOT NULL CHECK (destination_source IN ('owner_choice', 'default_bank', 'default_credit')),
  -- Foto de los datos bancarios al crear la liquidación (solo transferencia).
  bank_snapshot JSONB,
  credit_unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'on_hold', 'paid', 'credited', 'donated', 'retained', 'cancelled')),
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_reason TEXT,
  unit_payment_id UUID REFERENCES public.unit_payments(id) ON DELETE SET NULL,
  reserve_fund_movement_id UUID REFERENCES public.reserve_fund_movements(id) ON DELETE SET NULL,
  paid_on DATE,
  payment_reference TEXT CHECK (payment_reference IS NULL OR char_length(payment_reference) <= 120),
  payment_note TEXT CHECK (payment_note IS NULL OR char_length(payment_note) <= 500),
  settled_at TIMESTAMPTZ,
  settled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_payouts_charge_unique UNIQUE (charge_id),
  CONSTRAINT parking_payouts_split_exact CHECK (gross_amount = commission_amount + net_amount),
  CONSTRAINT parking_payouts_unit_payment_unique UNIQUE (unit_payment_id),
  CONSTRAINT parking_payouts_reserve_movement_unique UNIQUE (reserve_fund_movement_id)
);

CREATE INDEX IF NOT EXISTS parking_payouts_community_status_idx
  ON public.parking_payouts(community_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS parking_payouts_owner_idx
  ON public.parking_payouts(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS parking_payouts_review_idx
  ON public.parking_payouts(community_id) WHERE needs_review;

CREATE TABLE IF NOT EXISTS public.parking_payout_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  payout_id UUID NOT NULL REFERENCES public.parking_payouts(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 60),
  from_status TEXT,
  to_status TEXT,
  amount INTEGER,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS parking_payout_events_payout_idx
  ON public.parking_payout_events(payout_id, seq);

-- Segunda red de idempotencia del lado de los libros de destino.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reserve_fund_parking_payout_once
  ON public.reserve_fund_movements(notes)
  WHERE notes LIKE 'parking_payout:%';

DROP TRIGGER IF EXISTS trg_parking_payouts_touch ON public.parking_payouts;
CREATE TRIGGER trg_parking_payouts_touch
BEFORE UPDATE ON public.parking_payouts
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

-- Máquina de estados. Ni la service role cambia montos, destino ni cobro.
CREATE OR REPLACE FUNCTION public.parking_payout_transition_allowed(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_from
    WHEN 'pending' THEN p_to IN ('paid', 'credited', 'donated', 'retained', 'on_hold', 'cancelled')
    WHEN 'on_hold' THEN p_to IN ('pending', 'cancelled')
    ELSE FALSE -- paid, credited, donated, retained y cancelled son terminales
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_parking_payout_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.charge_id IS DISTINCT FROM OLD.charge_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
     OR NEW.commission_amount IS DISTINCT FROM OLD.commission_amount
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.destination IS DISTINCT FROM OLD.destination THEN
    RAISE EXCEPTION 'Una liquidación no cambia de cobro, dueño, montos ni destino'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.parking_payout_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Transición de liquidación inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_payouts_rules ON public.parking_payouts;
CREATE TRIGGER trg_parking_payouts_rules
BEFORE UPDATE ON public.parking_payouts
FOR EACH ROW EXECUTE FUNCTION public.enforce_parking_payout_rules();

-- ============================================================
-- 5. Funciones internas
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_payout_log(
  p_payout public.parking_payouts,
  p_event TEXT,
  p_from TEXT,
  p_to TEXT,
  p_actor UUID,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.parking_payout_events (
    payout_id, community_id, event_type, from_status, to_status, amount, actor_id, details
  )
  VALUES (
    p_payout.id, p_payout.community_id, p_event, p_from, p_to, p_payout.net_amount,
    CASE WHEN p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
         THEN p_actor ELSE NULL END,
    COALESCE(p_details, '{}'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_payout_set_status(
  p_payout_id UUID,
  p_to TEXT,
  p_event TEXT,
  p_actor UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_from TEXT;
BEGIN
  SELECT * INTO v_payout FROM public.parking_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout.id IS NULL THEN
    RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = '22023';
  END IF;
  v_from := v_payout.status;
  IF v_from = p_to THEN
    RETURN FALSE;
  END IF;
  UPDATE public.parking_payouts
  SET status = p_to,
      settled_at = CASE WHEN p_to IN ('paid', 'credited', 'donated', 'retained') THEN NOW() ELSE settled_at END,
      settled_by = CASE WHEN p_to IN ('paid', 'credited', 'donated', 'retained')
                             AND p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
                        THEN p_actor ELSE settled_by END,
      cancelled_at = CASE WHEN p_to = 'cancelled' THEN NOW() ELSE cancelled_at END
  WHERE id = p_payout_id
  RETURNING * INTO v_payout;
  PERFORM public.parking_payout_log(v_payout, p_event, v_from, p_to, p_actor, p_details);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_payout_flag(
  p_payout_id UUID,
  p_event TEXT,
  p_reason TEXT,
  p_actor UUID DEFAULT NULL,
  p_details JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
BEGIN
  UPDATE public.parking_payouts
  SET needs_review = TRUE, review_reason = left(p_reason, 300)
  WHERE id = p_payout_id
  RETURNING * INTO v_payout;
  IF v_payout.id IS NOT NULL THEN
    PERFORM public.parking_payout_log(v_payout, p_event, v_payout.status, v_payout.status, p_actor,
      COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('reason', p_reason));
  END IF;
END;
$$;

-- Unidad a la que se abona: la elegida por el dueño (si es suya) o la única
-- que tiene. Con dos o más y sin elección, no se adivina.
CREATE OR REPLACE FUNCTION public.parking_payout_credit_unit(
  p_owner UUID,
  p_community UUID,
  p_preferred UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_preferred IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = p_preferred AND u.community_id = p_community
      AND (u.owner_id = p_owner
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_owner AND p.unit_id::text = u.id::text))
  ) THEN
    RETURN p_preferred;
  END IF;
  RETURN public.parking_resolve_billed_unit(p_owner, p_community);
END;
$$;

-- Ejecuta una liquidación pendiente según su destino. Idempotente: si ya se
-- ejecutó, devuelve el estado sin repetir nada. Nunca lanza por un problema del
-- libro de destino (período cerrado, sin unidad): marca para revisión.
CREATE OR REPLACE FUNCTION public.parking_payout_execute(
  p_payout_id UUID,
  p_actor UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_spot_label TEXT;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
  v_unit_payment UUID;
  v_movement UUID;
  v_label TEXT;
BEGIN
  SELECT * INTO v_payout FROM public.parking_payouts WHERE id = p_payout_id FOR UPDATE;
  IF v_payout.id IS NULL THEN
    RAISE EXCEPTION 'La liquidación no existe' USING ERRCODE = '22023';
  END IF;
  IF v_payout.status <> 'pending' THEN
    RETURN v_payout.status;
  END IF;

  -- Comisión del 100 %: no hay nada que entregar al dueño.
  IF v_payout.net_amount = 0 THEN
    PERFORM public.parking_payout_set_status(p_payout_id, 'retained', 'retained_by_commission', p_actor);
    RETURN 'retained';
  END IF;

  SELECT label INTO v_spot_label FROM public.parking_spots WHERE id = v_payout.spot_id;

  IF v_payout.destination = 'bank_transfer' THEN
    -- La transferencia la hace la administración fuera de la app.
    RETURN 'pending';
  END IF;

  IF v_payout.destination = 'common_expenses_credit' THEN
    IF v_payout.credit_unit_id IS NULL THEN
      UPDATE public.parking_payouts
      SET credit_unit_id = public.parking_payout_credit_unit(owner_id, community_id, NULL)
      WHERE id = p_payout_id
      RETURNING * INTO v_payout;
    END IF;
    IF v_payout.credit_unit_id IS NULL THEN
      PERFORM public.parking_payout_flag(p_payout_id, 'credit_unit_missing',
        'No hay una unidad clara para abonar: el dueño puede elegirla en su preferencia o la administración puede transferir.',
        p_actor);
      RETURN 'pending';
    END IF;

    BEGIN
      INSERT INTO public.unit_payments (
        community_id, unit_id, amount, paid_at, method, reference, notes, recorded_by
      )
      VALUES (
        v_payout.community_id, v_payout.credit_unit_id, v_payout.net_amount, v_today, 'other',
        'parking_payout:' || v_payout.id::text,
        left('Abono por arriendo del estacionamiento ' || COALESCE(v_spot_label, ''), 200),
        CASE WHEN p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
             THEN p_actor ELSE NULL END
      )
      RETURNING id INTO v_unit_payment;
    EXCEPTION
      WHEN unique_violation THEN
        SELECT id INTO v_unit_payment FROM public.unit_payments
        WHERE community_id = v_payout.community_id AND unit_id = v_payout.credit_unit_id
          AND reference = 'parking_payout:' || v_payout.id::text;
      WHEN OTHERS THEN
        PERFORM public.parking_payout_flag(p_payout_id, 'credit_failed',
          'No se pudo abonar a gastos comunes: ' || SQLERRM, p_actor);
        RETURN 'pending';
    END;

    UPDATE public.parking_payouts
    SET unit_payment_id = v_unit_payment, needs_review = FALSE, review_reason = NULL
    WHERE id = p_payout_id;
    PERFORM public.parking_payout_set_status(p_payout_id, 'credited', 'credited_to_unit', p_actor,
      jsonb_build_object('unit_id', v_payout.credit_unit_id, 'unit_payment_id', v_unit_payment));
    RETURN 'credited';
  END IF;

  -- reserve_fund_donation
  v_label := left('Donación de arriendo de estacionamiento ' || COALESCE(v_spot_label, ''), 160);
  BEGIN
    INSERT INTO public.reserve_fund_movements (community_id, kind, amount, month, label, notes, created_by)
    VALUES (
      v_payout.community_id, 'contribution', v_payout.net_amount, to_char(v_today, 'YYYY-MM'), v_label,
      'parking_payout:' || v_payout.id::text,
      CASE WHEN p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
           THEN p_actor ELSE NULL END
    )
    RETURNING id INTO v_movement;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_movement FROM public.reserve_fund_movements
      WHERE notes = 'parking_payout:' || v_payout.id::text;
    WHEN OTHERS THEN
      PERFORM public.parking_payout_flag(p_payout_id, 'donation_failed',
        'No se pudo registrar la donación al fondo de reserva: ' || SQLERRM, p_actor);
      RETURN 'pending';
  END;

  UPDATE public.parking_payouts
  SET reserve_fund_movement_id = v_movement, needs_review = FALSE, review_reason = NULL
  WHERE id = p_payout_id;
  PERFORM public.parking_payout_set_status(p_payout_id, 'donated', 'donated_to_reserve_fund', p_actor,
    jsonb_build_object('reserve_fund_movement_id', v_movement));
  RETURN 'donated';
END;
$$;

-- Crea (o reanuda) la liquidación de un cobro pagado. Idempotente por la UNIQUE
-- de charge_id. p_backfill = TRUE crea la liquidación pendiente y marcada para
-- revisión, sin ejecutarla (cobros pagados antes de esta migración).
CREATE OR REPLACE FUNCTION public.parking_payout_open(
  p_charge_id UUID,
  p_actor UUID DEFAULT NULL,
  p_backfill BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_booking public.parking_bookings%ROWTYPE;
  v_settings public.parking_owner_payout_settings%ROWTYPE;
  v_existing public.parking_payouts%ROWTYPE;
  v_payout public.parking_payouts%ROWTYPE;
  v_percent NUMERIC(5, 2);
  v_commission INTEGER;
  v_net INTEGER;
  v_source TEXT;
  v_destination TEXT;
  v_destination_source TEXT;
  v_bank_complete BOOLEAN;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id;
  IF v_charge.id IS NULL OR v_charge.status <> 'paid' OR v_charge.amount <= 0 THEN
    RETURN NULL; -- sin cobro pagado con monto no hay nada que liquidar
  END IF;

  SELECT * INTO v_existing FROM public.parking_payouts WHERE charge_id = p_charge_id FOR UPDATE;
  IF v_existing.id IS NOT NULL THEN
    -- El pago se había revertido y volvió: se reanuda.
    IF v_existing.status = 'on_hold' AND NOT p_backfill THEN
      PERFORM public.parking_payout_set_status(v_existing.id, 'pending', 'resumed', p_actor);
      PERFORM public.parking_payout_execute(v_existing.id, p_actor);
    END IF;
    RETURN v_existing.id;
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = v_charge.booking_id;
  IF v_booking.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Comisión: la fijada en la reserva si cuadra con el cobro; si no, la tasa vigente.
  IF v_booking.total_amount = v_charge.amount
     AND v_booking.community_fee_amount BETWEEN 0 AND v_charge.amount THEN
    v_commission := v_booking.community_fee_amount;
    v_net := v_charge.amount - v_commission;
    v_source := 'booking';
    v_percent := NULL;
  ELSE
    SELECT parking_commission_percent INTO v_percent FROM public.communities WHERE id = v_charge.community_id;
    v_percent := COALESCE(v_percent, 0);
    SELECT s.commission_amount, s.net_amount INTO v_commission, v_net
    FROM public.parking_payout_split(v_charge.amount, v_percent) s;
    v_source := 'community_rate';
  END IF;

  -- Destino: la elección del dueño; si no eligió, transferencia con datos
  -- bancarios completos, y si no, abono a gastos comunes.
  SELECT * INTO v_settings FROM public.parking_owner_payout_settings
  WHERE community_id = v_charge.community_id AND profile_id = v_booking.owner_id;
  v_bank_complete := v_settings.id IS NOT NULL
    AND v_settings.bank_name IS NOT NULL AND v_settings.bank_account_type IS NOT NULL
    AND v_settings.bank_account_number IS NOT NULL AND v_settings.holder_rut IS NOT NULL
    AND v_settings.holder_name IS NOT NULL;
  IF v_settings.destination IS NOT NULL THEN
    v_destination := v_settings.destination;
    v_destination_source := 'owner_choice';
  ELSIF v_bank_complete THEN
    v_destination := 'bank_transfer';
    v_destination_source := 'default_bank';
  ELSE
    v_destination := 'common_expenses_credit';
    v_destination_source := 'default_credit';
  END IF;

  INSERT INTO public.parking_payouts (
    community_id, charge_id, booking_id, spot_id, owner_id, gross_amount,
    commission_percent, commission_source, commission_amount, net_amount,
    destination, destination_source, bank_snapshot, credit_unit_id, status,
    needs_review, review_reason
  )
  VALUES (
    v_charge.community_id, v_charge.id, v_booking.id, v_booking.spot_id, v_booking.owner_id, v_charge.amount,
    v_percent, v_source, v_commission, v_net,
    v_destination, v_destination_source,
    CASE WHEN v_destination = 'bank_transfer' THEN jsonb_build_object(
      'bank_name', v_settings.bank_name,
      'account_type', v_settings.bank_account_type,
      'account_number', v_settings.bank_account_number,
      'holder_rut', v_settings.holder_rut,
      'holder_name', v_settings.holder_name) END,
    CASE WHEN v_destination = 'common_expenses_credit'
         THEN public.parking_payout_credit_unit(v_booking.owner_id, v_charge.community_id, v_settings.credit_unit_id) END,
    'pending',
    p_backfill,
    CASE WHEN p_backfill THEN 'Cobro pagado antes de la liquidación a dueños: revisar antes de liquidar' END
  )
  ON CONFLICT (charge_id) DO NOTHING
  RETURNING * INTO v_payout;

  IF v_payout.id IS NULL THEN
    -- Carrera con otra transacción: ya existe.
    RETURN (SELECT id FROM public.parking_payouts WHERE charge_id = p_charge_id);
  END IF;

  PERFORM public.parking_payout_log(v_payout, CASE WHEN p_backfill THEN 'backfilled' ELSE 'created' END,
    NULL, 'pending', p_actor,
    jsonb_build_object('gross', v_payout.gross_amount, 'commission', v_payout.commission_amount,
                       'commission_source', v_source, 'destination', v_destination,
                       'destination_source', v_destination_source));

  IF NOT p_backfill THEN
    PERFORM public.parking_payout_execute(v_payout.id, p_actor);
  END IF;
  RETURN v_payout.id;
END;
$$;

-- Lo que le pasa al cobro, le pasa a la liquidación.
CREATE OR REPLACE FUNCTION public.parking_payout_follow_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_booking_status TEXT;
BEGIN
  BEGIN
    IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
      PERFORM public.parking_payout_open(NEW.id, NULL, FALSE);
      RETURN NEW;
    END IF;

    SELECT * INTO v_payout FROM public.parking_payouts WHERE charge_id = NEW.id;
    IF v_payout.id IS NULL THEN
      RETURN NEW;
    END IF;

    IF OLD.status = 'paid' AND NEW.status = 'charged' THEN
      -- Se eliminó el pago que saldaba el cobro.
      IF v_payout.status = 'pending' THEN
        PERFORM public.parking_payout_set_status(v_payout.id, 'on_hold', 'charge_payment_reversed', NULL);
      ELSIF v_payout.status IN ('paid', 'credited', 'donated') THEN
        PERFORM public.parking_payout_flag(v_payout.id, 'charge_payment_reversed',
          'El pago del arriendo se revirtió después de liquidar al dueño: revisar', NULL);
      END IF;
    ELSIF NEW.status IN ('refunded', 'voided') AND OLD.status IS DISTINCT FROM NEW.status THEN
      IF v_payout.status IN ('pending', 'on_hold') THEN
        PERFORM public.parking_payout_set_status(v_payout.id, 'cancelled', 'charge_' || NEW.status, NULL);
      ELSIF v_payout.status IN ('paid', 'credited', 'donated') THEN
        PERFORM public.parking_payout_flag(v_payout.id, 'charge_' || NEW.status,
          'El arriendo se reembolsó después de liquidar al dueño: revisar (no se revierte solo)', NULL);
      END IF;
    ELSIF NEW.needs_review AND NOT OLD.needs_review AND NEW.status = 'paid' THEN
      -- Cancelación sin costo sobre un cobro ya pagado: puede corresponder reembolso.
      SELECT status INTO v_booking_status FROM public.parking_bookings WHERE id = NEW.booking_id;
      IF v_booking_status = 'cancelled' THEN
        IF v_payout.status = 'pending' THEN
          PERFORM public.parking_payout_set_status(v_payout.id, 'on_hold', 'booking_cancelled', NULL);
          PERFORM public.parking_payout_flag(v_payout.id, 'booking_cancelled',
            'La reserva se canceló y el arriendo puede requerir reembolso: revisar antes de liquidar', NULL);
        ELSIF v_payout.status IN ('paid', 'credited', 'donated') THEN
          PERFORM public.parking_payout_flag(v_payout.id, 'booking_cancelled',
            'La reserva se canceló después de liquidar al dueño: revisar (no se revierte solo)', NULL);
        END IF;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- La liquidación nunca rompe el cobro: queda registrado y la administración
    -- puede sincronizar con admin_sync_parking_payouts().
    PERFORM public.parking_charge_log(NEW, 'payout_error', NEW.status, NEW.status, NULL,
      jsonb_build_object('error', SQLERRM));
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_charges_payout ON public.parking_charges;
CREATE TRIGGER trg_parking_charges_payout
AFTER UPDATE OF status, needs_review ON public.parking_charges
FOR EACH ROW EXECUTE FUNCTION public.parking_payout_follow_charge();

-- ============================================================
-- 6. El abono a gastos comunes no es dinero que entra al banco
--
-- Mismo cuerpo que 20261011194026 con un cambio: un pago de unidad cuya
-- referencia es 'parking_payout:<id>' (abono de una liquidación) se contabiliza
-- contra la cuenta 2400 "Liquidaciones a dueños de estacionamientos" y no contra
-- 1100 Banco. El dinero ya entró cuando pagó el arrendatario; contarlo otra vez
-- inflaría el banco. Clasificación pendiente de validación profesional, igual
-- que el resto del libro.
-- ============================================================
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
  v_parking_credit boolean;
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
  v_parking_credit := COALESCE(CASE WHEN TG_OP = 'INSERT' THEN NEW.reference ELSE OLD.reference END, '')
                        LIKE 'parking_payout:%';
  IF TG_OP = 'INSERT' THEN v_amount := NEW.amount; ELSE v_amount := OLD.amount; END IF;
  IF v_amount <= 0 OR v_amount > 2147483647 OR
    (CASE WHEN TG_OP = 'INSERT' THEN NEW.amount ELSE OLD.amount END) <> v_amount THEN
    RAISE EXCEPTION 'El monto del pago debe ser un número entero de pesos dentro del rango contable.';
  END IF;

  INSERT INTO public.ledger_accounts (community_id, code, name, kind)
  VALUES (v_community, '1100', 'Banco', 'asset'),
         (v_community, '1200', 'Cuentas por cobrar a unidades', 'asset')
  ON CONFLICT (community_id, code) DO NOTHING;
  IF v_parking_credit THEN
    INSERT INTO public.ledger_accounts (community_id, code, name, kind)
    VALUES (v_community, '2400', 'Liquidaciones a dueños de estacionamientos', 'liability')
    ON CONFLICT (community_id, code) DO NOTHING;
  END IF;
  SELECT id INTO STRICT v_bank FROM public.ledger_accounts
    WHERE community_id = v_community AND code = CASE WHEN v_parking_credit THEN '2400' ELSE '1100' END;
  SELECT id INTO STRICT v_receivable FROM public.ledger_accounts
    WHERE community_id = v_community AND code = '1200';

  INSERT INTO public.journal_entries
    (community_id, entry_date, memo, source, source_record_id, created_by)
  VALUES
    (v_community, v_paid_at,
     CASE WHEN v_parking_credit AND TG_OP = 'INSERT' THEN 'Abono por arriendo de estacionamiento'
          WHEN v_parking_credit THEN 'Reversa de abono por arriendo de estacionamiento'
          WHEN TG_OP = 'INSERT' THEN 'Pago de unidad' ELSE 'Reversa de pago de unidad' END,
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

-- ============================================================
-- 7. RPC del dueño
-- ============================================================
-- Guarda la preferencia y los datos bancarios del dueño que llama. Solo afecta
-- a las liquidaciones que se creen después (las ya creadas tienen el destino
-- congelado). Datos bancarios vacíos se guardan como NULL.
CREATE OR REPLACE FUNCTION public.parking_set_my_payout_settings(
  p_destination TEXT,
  p_bank_name TEXT DEFAULT NULL,
  p_bank_account_type TEXT DEFAULT NULL,
  p_bank_account_number TEXT DEFAULT NULL,
  p_holder_rut TEXT DEFAULT NULL,
  p_holder_name TEXT DEFAULT NULL,
  p_credit_unit_id UUID DEFAULT NULL
)
RETURNS public.parking_owner_payout_settings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_community UUID := public.get_my_community_id();
  v_destination TEXT := NULLIF(btrim(COALESCE(p_destination, '')), '');
  v_bank_name TEXT := NULLIF(btrim(COALESCE(p_bank_name, '')), '');
  v_type TEXT := NULLIF(btrim(lower(COALESCE(p_bank_account_type, ''))), '');
  v_number TEXT := NULLIF(regexp_replace(COALESCE(p_bank_account_number, ''), '[\s.]', '', 'g'), '');
  v_rut TEXT := public.parking_normalize_rut(p_holder_rut);
  v_holder TEXT := NULLIF(btrim(COALESCE(p_holder_name, '')), '');
  v_row public.parking_owner_payout_settings%ROWTYPE;
BEGIN
  IF v_user IS NULL OR v_community IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión de residente de la comunidad' USING ERRCODE = '42501';
  END IF;
  IF v_destination IS NOT NULL
     AND v_destination NOT IN ('bank_transfer', 'common_expenses_credit', 'reserve_fund_donation') THEN
    RAISE EXCEPTION 'Destino no válido' USING ERRCODE = '22023';
  END IF;
  IF v_type IS NOT NULL AND v_type NOT IN ('corriente', 'vista', 'ahorro') THEN
    RAISE EXCEPTION 'Tipo de cuenta no válido' USING ERRCODE = '22023';
  END IF;
  IF v_number IS NOT NULL AND v_number !~ '^[0-9][0-9-]{3,24}$' THEN
    RAISE EXCEPTION 'El número de cuenta solo lleva dígitos (y guiones)' USING ERRCODE = '22023';
  END IF;
  IF v_rut IS NOT NULL AND NOT public.parking_rut_is_valid(v_rut) THEN
    RAISE EXCEPTION 'El RUT del titular no es válido' USING ERRCODE = '22023';
  END IF;
  IF v_destination = 'bank_transfer'
     AND (v_bank_name IS NULL OR v_type IS NULL OR v_number IS NULL OR v_rut IS NULL OR v_holder IS NULL) THEN
    RAISE EXCEPTION 'Para recibir transferencias completa banco, tipo y número de cuenta, RUT y titular'
      USING ERRCODE = '22023';
  END IF;
  IF p_credit_unit_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = p_credit_unit_id AND u.community_id = v_community
      AND (u.owner_id = v_user
           OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_user AND p.unit_id::text = u.id::text))
  ) THEN
    RAISE EXCEPTION 'Esa unidad no está asociada a tu cuenta' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.parking_owner_payout_settings (
    community_id, profile_id, destination, credit_unit_id, bank_name, bank_account_type,
    bank_account_number, holder_rut, holder_name, updated_by
  )
  VALUES (v_community, v_user, v_destination, p_credit_unit_id, v_bank_name, v_type, v_number, v_rut, v_holder, v_user)
  ON CONFLICT (community_id, profile_id) DO UPDATE
  SET destination = EXCLUDED.destination,
      credit_unit_id = EXCLUDED.credit_unit_id,
      bank_name = EXCLUDED.bank_name,
      bank_account_type = EXCLUDED.bank_account_type,
      bank_account_number = EXCLUDED.bank_account_number,
      holder_rut = EXCLUDED.holder_rut,
      holder_name = EXCLUDED.holder_name,
      updated_by = EXCLUDED.updated_by
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

-- ============================================================
-- 8. RPCs de la administración
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_payout_assert_admin(p_payout_id UUID)
RETURNS public.parking_payouts
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Solo la administración puede gestionar liquidaciones' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_payout FROM public.parking_payouts WHERE id = p_payout_id;
  IF v_payout.id IS NULL OR v_payout.community_id IS DISTINCT FROM public.get_my_community_id() THEN
    RAISE EXCEPTION 'La liquidación no pertenece a tu comunidad' USING ERRCODE = '42501';
  END IF;
  RETURN v_payout;
END;
$$;

-- La administración transfirió al dueño fuera de la app.
CREATE OR REPLACE FUNCTION public.admin_mark_parking_payout_paid(
  p_payout_id UUID,
  p_paid_on DATE,
  p_reference TEXT DEFAULT NULL,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_today DATE := (NOW() AT TIME ZONE 'America/Santiago')::date;
BEGIN
  v_payout := public.parking_payout_assert_admin(p_payout_id);
  IF v_payout.destination <> 'bank_transfer' OR v_payout.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo una transferencia pendiente se puede marcar como pagada' USING ERRCODE = '22023';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > v_today OR p_paid_on < (v_payout.created_at AT TIME ZONE 'America/Santiago')::date - 1 THEN
    RAISE EXCEPTION 'Indica la fecha de la transferencia (no puede ser futura)' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parking_payouts
  SET paid_on = p_paid_on,
      payment_reference = NULLIF(left(btrim(COALESCE(p_reference, '')), 120), ''),
      payment_note = NULLIF(left(btrim(COALESCE(p_note, '')), 500), ''),
      needs_review = FALSE,
      review_reason = NULL
  WHERE id = p_payout_id;
  PERFORM public.parking_payout_set_status(p_payout_id, 'paid', 'transfer_marked_paid', auth.uid(),
    jsonb_build_object('paid_on', p_paid_on, 'reference', NULLIF(btrim(COALESCE(p_reference, '')), '')));
  RETURN TRUE;
END;
$$;

-- Reintenta un abono o donación que quedó pendiente (p. ej. período cerrado o
-- liquidación del backfill), o reanuda una suspendida cuando el cobro sigue pagado.
CREATE OR REPLACE FUNCTION public.admin_retry_parking_payout(p_payout_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
  v_charge_status TEXT;
BEGIN
  v_payout := public.parking_payout_assert_admin(p_payout_id);
  SELECT status INTO v_charge_status FROM public.parking_charges WHERE id = v_payout.charge_id;
  IF v_charge_status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'El arriendo no está pagado: no se puede liquidar' USING ERRCODE = '22023';
  END IF;
  IF v_payout.status NOT IN ('pending', 'on_hold') THEN
    RAISE EXCEPTION 'Esta liquidación ya está cerrada' USING ERRCODE = '22023';
  END IF;
  IF v_payout.status = 'on_hold' THEN
    PERFORM public.parking_payout_set_status(p_payout_id, 'pending', 'resumed', auth.uid());
  END IF;
  UPDATE public.parking_payouts SET needs_review = FALSE, review_reason = NULL WHERE id = p_payout_id;
  RETURN public.parking_payout_execute(p_payout_id, auth.uid());
END;
$$;

-- Anula una liquidación pendiente o suspendida (p. ej. se reembolsó al arrendatario).
CREATE OR REPLACE FUNCTION public.admin_cancel_parking_payout(p_payout_id UUID, p_note TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
BEGIN
  v_payout := public.parking_payout_assert_admin(p_payout_id);
  IF v_payout.status NOT IN ('pending', 'on_hold') THEN
    RAISE EXCEPTION 'Solo una liquidación pendiente o suspendida se puede anular' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica el motivo de la anulación' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parking_payouts SET needs_review = FALSE, review_reason = NULL WHERE id = p_payout_id;
  PERFORM public.parking_payout_set_status(p_payout_id, 'cancelled', 'admin_cancelled', auth.uid(),
    jsonb_build_object('note', left(btrim(p_note), 300)));
  RETURN TRUE;
END;
$$;

-- Deja constancia de que la administración revisó una liquidación marcada.
CREATE OR REPLACE FUNCTION public.admin_resolve_parking_payout_review(p_payout_id UUID, p_note TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payout public.parking_payouts%ROWTYPE;
BEGIN
  v_payout := public.parking_payout_assert_admin(p_payout_id);
  IF char_length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica qué se resolvió' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parking_payouts SET needs_review = FALSE, review_reason = NULL
  WHERE id = p_payout_id RETURNING * INTO v_payout;
  PERFORM public.parking_payout_log(v_payout, 'review_resolved', v_payout.status, v_payout.status, auth.uid(),
    jsonb_build_object('note', left(btrim(p_note), 300)));
  RETURN TRUE;
END;
$$;

-- Crea las liquidaciones que falten para cobros pagados de la comunidad (por si
-- un error impidió crearlas en su momento). Idempotente.
CREATE OR REPLACE FUNCTION public.admin_sync_parking_payouts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community UUID := public.get_my_community_id();
  v_charge RECORD;
  v_count INTEGER := 0;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' OR v_community IS NULL THEN
    RAISE EXCEPTION 'Solo la administración puede sincronizar liquidaciones' USING ERRCODE = '42501';
  END IF;
  FOR v_charge IN
    SELECT c.id FROM public.parking_charges c
    WHERE c.community_id = v_community AND c.status = 'paid' AND c.amount > 0
      AND NOT EXISTS (SELECT 1 FROM public.parking_payouts p WHERE p.charge_id = c.id)
  LOOP
    PERFORM public.parking_payout_open(v_charge.id, auth.uid(), FALSE);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Comisión de la comunidad, validada (0–100, máximo 2 decimales).
CREATE OR REPLACE FUNCTION public.admin_set_parking_commission_percent(p_percent NUMERIC)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community UUID := public.get_my_community_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() IS DISTINCT FROM 'admin' OR v_community IS NULL THEN
    RAISE EXCEPTION 'Solo la administración puede fijar la comisión' USING ERRCODE = '42501';
  END IF;
  IF p_percent IS NULL OR p_percent < 0 OR p_percent > 100 OR p_percent <> round(p_percent, 2) THEN
    RAISE EXCEPTION 'La comisión va de 0 a 100 %% con hasta 2 decimales' USING ERRCODE = '22023';
  END IF;
  UPDATE public.communities SET parking_commission_percent = p_percent WHERE id = v_community;
  RETURN p_percent;
END;
$$;

-- ============================================================
-- 9. RLS
--
-- Igual que el libro de cobros: el dinero no es dato operativo, así que
-- conserjería no ve liquidaciones ni datos bancarios. Ven el dueño (lo suyo) y
-- la administración de su comunidad. Nadie escribe directo: todo pasa por las
-- funciones de arriba.
-- ============================================================
ALTER TABLE public.parking_owner_payout_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_payout_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_owner_payout_settings_read ON public.parking_owner_payout_settings;
CREATE POLICY parking_owner_payout_settings_read
ON public.parking_owner_payout_settings
FOR SELECT TO authenticated
USING (
  profile_id = (SELECT auth.uid())
  OR (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
);

DROP POLICY IF EXISTS parking_payouts_read ON public.parking_payouts;
CREATE POLICY parking_payouts_read
ON public.parking_payouts
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
);

DROP POLICY IF EXISTS parking_payout_events_read ON public.parking_payout_events;
CREATE POLICY parking_payout_events_read
ON public.parking_payout_events
FOR SELECT TO authenticated
USING (
  (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
  OR EXISTS (
    SELECT 1 FROM public.parking_payouts p
    WHERE p.id = parking_payout_events.payout_id AND p.owner_id = (SELECT auth.uid())
  )
);

REVOKE ALL ON public.parking_owner_payout_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.parking_payouts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.parking_payout_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.parking_owner_payout_settings TO authenticated;
GRANT SELECT ON public.parking_payouts TO authenticated;
GRANT SELECT ON public.parking_payout_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parking_owner_payout_settings TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.parking_payouts TO service_role;
GRANT SELECT, INSERT ON public.parking_payout_events TO service_role;

-- Internas: solo desde triggers y RPCs SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.parking_payout_split(INTEGER, NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_rut_is_valid(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.parking_normalize_rut(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_transition_allowed(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_parking_payout_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_log(public.parking_payouts, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_set_status(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_flag(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_credit_unit(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_execute(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_open(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_follow_charge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_payout_assert_admin(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_payout_split(INTEGER, NUMERIC) TO service_role;
-- El CHECK de holder_rut la evalúa con el rol de quien escribe (las RPCs, como dueño).
GRANT EXECUTE ON FUNCTION public.parking_rut_is_valid(TEXT) TO authenticated, service_role;

-- Del dueño y de la administración (validan sesión, rol y comunidad adentro).
REVOKE ALL ON FUNCTION public.parking_set_my_payout_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_parking_payout_paid(UUID, DATE, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_retry_parking_payout(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_parking_payout(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_resolve_parking_payout_review(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_sync_parking_payouts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_parking_commission_percent(NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parking_set_my_payout_settings(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_parking_payout_paid(UUID, DATE, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_retry_parking_payout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_parking_payout(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_parking_payout_review(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_parking_payouts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_parking_commission_percent(NUMERIC) TO authenticated;

-- ============================================================
-- 10. Cobros pagados antes de esta migración
--
-- No se le abona ni transfiere nada a nadie de forma retroactiva: se abre una
-- liquidación pendiente, marcada para revisión, por cada cobro pagado con monto.
-- La administración decide en la vista de estacionamientos ("Liquidar ahora" o
-- "Anular").
-- ============================================================
DO $$
DECLARE
  v_charge RECORD;
BEGIN
  FOR v_charge IN
    SELECT c.id FROM public.parking_charges c
    WHERE c.status = 'paid' AND c.amount > 0
      AND NOT EXISTS (SELECT 1 FROM public.parking_payouts p WHERE p.charge_id = c.id)
  LOOP
    PERFORM public.parking_payout_open(v_charge.id, NULL, TRUE);
  END LOOP;
END $$;

COMMIT;
