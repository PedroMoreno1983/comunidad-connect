-- Libro de cobros de estacionamientos.
--
-- Hasta ahora una reserva solo registraba el monto (parking_bookings.total_amount)
-- y un payment_status que nadie movía: Haulmer no tiene permisos de API, así que
-- nadie cobraba nada. Esta migración hace que el cobro ocurra de verdad, sin
-- depender de Haulmer:
--
--   1. parking_charges: exactamente UN cobro por reserva (UNIQUE booking_id), con
--      estados pending -> charged -> paid / failed / voided / refunded.
--   2. parking_charge_events: bitácora append-only de cada cambio (quién, cuándo,
--      de qué estado a cuál y con qué monto).
--   3. Método por defecto "common_expenses": el cobro entra como un cargo
--      (unit_charges, kind 'service') en la cuenta de la unidad del residente
--      que reserva. Se reutiliza el libro de cargos existente: la cartola, la
--      conciliación, el aviso de cobro y la asignación de pagos ya lo leen.
--   4. Método "haulmer" (opt-in por comunidad): el cobro queda pendiente y la
--      aplicación genera el link de pago. Si Haulmer no está habilitado en el
--      servidor, la aplicación cae a gastos comunes (ver src/lib/parking/charges.ts).
--   5. Cancelación: anular sin costo hasta N horas antes del inicio (N
--      configurable por comunidad, 2 por defecto). Pasado ese plazo, si cancela
--      el propio conductor, el cobro se mantiene. Si cancela el dueño, la
--      administración o el sistema (p. ej. acceso revocado), siempre se anula.
--      Un cargo anulado se revierte en la cuenta de la unidad (unit_charges ->
--      'cancelled', que la cartola ya excluye).
--
-- Todo vive en la base, en triggers sobre parking_bookings. Así las tres
-- entradas que crean reservas (app, CoCo y la herramienta create_parking_booking
-- del Agent Center, que llaman a parking_book_as) generan el cobro sin que
-- ninguna tenga que acordarse, y el monto nunca sale del cliente.
BEGIN;

-- ============================================================
-- 1. Configuración por comunidad
-- ============================================================
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS parking_billing_method TEXT NOT NULL DEFAULT 'common_expenses';

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS parking_free_cancellation_hours INTEGER NOT NULL DEFAULT 2;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_parking_billing_method_valid') THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_parking_billing_method_valid
      CHECK (parking_billing_method IN ('common_expenses', 'haulmer'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'communities_parking_free_cancellation_range') THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_parking_free_cancellation_range
      CHECK (parking_free_cancellation_hours BETWEEN 0 AND 168);
  END IF;
END $$;

COMMENT ON COLUMN public.communities.parking_billing_method IS
  'Cómo se cobra un arriendo de estacionamiento: common_expenses (cargo en la cuenta de la unidad, por defecto) o haulmer (pago en línea; requiere PARKING_HAULMER_ENABLED y credenciales en el servidor, si no cae a common_expenses).';
COMMENT ON COLUMN public.communities.parking_free_cancellation_hours IS
  'Horas antes del inicio hasta las que el conductor puede cancelar sin costo. Pasado ese plazo el cobro se mantiene.';

-- ============================================================
-- 2. Reservas: quién canceló y estado de pago "anulado"
-- ============================================================
-- cancelled_by guarda un perfil, pero un conductor externo no tiene perfil y la
-- revocación de acceso cancela sin conductor de por medio. Para aplicar la regla
-- de cancelación hace falta saber de qué lado vino. NULL = no atribuible al
-- conductor, y se trata como cancelación sin costo (favorece a quien paga).
ALTER TABLE public.parking_bookings
  ADD COLUMN IF NOT EXISTS cancelled_by_party TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_bookings_cancelled_by_party_valid') THEN
    ALTER TABLE public.parking_bookings
      ADD CONSTRAINT parking_bookings_cancelled_by_party_valid
      CHECK (cancelled_by_party IS NULL OR cancelled_by_party IN ('driver', 'owner', 'admin', 'system'));
  END IF;
END $$;

-- payment_status pasa a ser un espejo del libro. 'voided' = el cobro se anuló.
ALTER TABLE public.parking_bookings
  DROP CONSTRAINT IF EXISTS parking_bookings_payment_status_check;
ALTER TABLE public.parking_bookings
  ADD CONSTRAINT parking_bookings_payment_status_check
  CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed', 'voided'));

-- ============================================================
-- 3. Libro de cobros
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  -- La garantía de "un cobro por reserva" es esta restricción, no un chequeo en
  -- la aplicación: dos inserciones concurrentes chocan aquí.
  booking_id UUID NOT NULL REFERENCES public.parking_bookings(id) ON DELETE CASCADE,
  -- Desnormalizado para que el RLS del conductor no tenga que unir con reservas.
  driver_id UUID NOT NULL REFERENCES public.parking_drivers(id) ON DELETE CASCADE,
  -- Residente que paga y unidad a la que se carga. NULL para un externo sin unidad.
  payer_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CLP' CHECK (currency = 'CLP'),
  method TEXT NOT NULL CHECK (method IN ('common_expenses', 'haulmer', 'none')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'charged', 'paid', 'failed', 'voided', 'refunded')),
  unit_charge_id UUID REFERENCES public.unit_charges(id) ON DELETE SET NULL,
  provider_reference TEXT,
  payment_url TEXT,
  failure_reason TEXT,
  -- Algo requiere una decisión humana: reembolso, período cerrado, externo sin
  -- unidad, extensión sobre un cargo ya pagado, reserva anterior al libro.
  needs_review BOOLEAN NOT NULL DEFAULT FALSE,
  charged_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  voided_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_charges_booking_unique UNIQUE (booking_id),
  CONSTRAINT parking_charges_unit_charge_unique UNIQUE (unit_charge_id)
);

CREATE INDEX IF NOT EXISTS parking_charges_community_status_idx
  ON public.parking_charges(community_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS parking_charges_driver_idx
  ON public.parking_charges(driver_id);
CREATE INDEX IF NOT EXISTS parking_charges_review_idx
  ON public.parking_charges(community_id)
  WHERE needs_review;

CREATE TABLE IF NOT EXISTS public.parking_charge_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Orden total de la bitácora: varios eventos caen en la misma transacción.
  seq BIGINT GENERATED ALWAYS AS IDENTITY,
  charge_id UUID NOT NULL REFERENCES public.parking_charges(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (char_length(event_type) BETWEEN 3 AND 60),
  from_status TEXT,
  to_status TEXT,
  amount INTEGER,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS parking_charge_events_charge_idx
  ON public.parking_charge_events(charge_id, seq);
CREATE INDEX IF NOT EXISTS parking_charge_events_community_idx
  ON public.parking_charge_events(community_id, created_at DESC);

-- Segunda red de idempotencia, del lado del libro de la unidad: un mismo
-- arriendo no puede quedar cargado dos veces en unit_charges.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_charges_parking_booking_once
  ON public.unit_charges(notes)
  WHERE notes LIKE 'parking_booking:%' AND status <> 'cancelled';

DROP TRIGGER IF EXISTS trg_parking_charges_touch ON public.parking_charges;
CREATE TRIGGER trg_parking_charges_touch
BEFORE UPDATE ON public.parking_charges
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

-- ============================================================
-- 4. Máquina de estados
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_transition_allowed(p_from TEXT, p_to TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_from
    WHEN 'pending' THEN p_to IN ('charged', 'paid', 'failed', 'voided')
    WHEN 'charged' THEN p_to IN ('paid', 'failed', 'voided')
    -- paid -> charged: el pago que lo saldaba se eliminó en finanzas.
    WHEN 'paid' THEN p_to IN ('refunded', 'charged')
    WHEN 'failed' THEN p_to IN ('pending', 'charged', 'paid', 'voided')
    ELSE FALSE -- voided y refunded son terminales
  END;
$$;

-- Red de seguridad: ni la service role puede saltarse la máquina de estados ni
-- cambiar el monto de un cobro ya pagado o cerrado.
CREATE OR REPLACE FUNCTION public.enforce_parking_charge_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.booking_id IS DISTINCT FROM OLD.booking_id
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
    RAISE EXCEPTION 'Un cobro de estacionamiento no cambia de reserva ni de comunidad'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT public.parking_charge_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Transición de cobro inválida: % -> %', OLD.status, NEW.status
      USING ERRCODE = '22023';
  END IF;

  IF NEW.amount IS DISTINCT FROM OLD.amount AND OLD.status NOT IN ('pending', 'charged', 'failed') THEN
    RAISE EXCEPTION 'No se puede cambiar el monto de un cobro %', OLD.status
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_charges_rules ON public.parking_charges;
CREATE TRIGGER trg_parking_charges_rules
BEFORE UPDATE ON public.parking_charges
FOR EACH ROW EXECUTE FUNCTION public.enforce_parking_charge_rules();

CREATE OR REPLACE FUNCTION public.parking_charge_log(
  p_charge public.parking_charges,
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
  INSERT INTO public.parking_charge_events (
    charge_id, community_id, event_type, from_status, to_status, amount, actor_id, details
  )
  VALUES (
    p_charge.id, p_charge.community_id, p_event, p_from, p_to, p_charge.amount,
    CASE WHEN p_actor IS NOT NULL AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
         THEN p_actor ELSE NULL END,
    COALESCE(p_details, '{}'::jsonb)
  );
END;
$$;

-- Cambia el estado, deja el evento y refleja el estado en la reserva. Devuelve
-- FALSE si el cobro ya estaba en ese estado (idempotente).
CREATE OR REPLACE FUNCTION public.parking_charge_transition(
  p_charge_id UUID,
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
  v_charge public.parking_charges%ROWTYPE;
  v_from TEXT;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'El cobro no existe' USING ERRCODE = '22023';
  END IF;

  v_from := v_charge.status;
  IF v_from = p_to THEN
    RETURN FALSE;
  END IF;

  UPDATE public.parking_charges
  SET status = p_to,
      charged_at = CASE WHEN p_to = 'charged' THEN COALESCE(charged_at, NOW()) ELSE charged_at END,
      paid_at = CASE WHEN p_to = 'paid' THEN NOW() WHEN p_to = 'charged' THEN NULL ELSE paid_at END,
      voided_at = CASE WHEN p_to = 'voided' THEN NOW() ELSE voided_at END,
      refunded_at = CASE WHEN p_to = 'refunded' THEN NOW() ELSE refunded_at END,
      failure_reason = CASE WHEN p_to IN ('charged', 'paid') THEN NULL ELSE failure_reason END
  WHERE id = p_charge_id
  RETURNING * INTO v_charge;

  PERFORM public.parking_charge_log(v_charge, p_event, v_from, p_to, p_actor, p_details);

  UPDATE public.parking_bookings
  SET payment_status = CASE p_to
        WHEN 'paid' THEN 'paid'
        WHEN 'refunded' THEN 'refunded'
        WHEN 'failed' THEN 'failed'
        WHEN 'voided' THEN 'voided'
        ELSE 'pending'
      END
  WHERE id = v_charge.booking_id;

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_charge_flag(
  p_charge_id UUID,
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
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  UPDATE public.parking_charges
  SET needs_review = TRUE,
      failure_reason = p_reason
  WHERE id = p_charge_id
  RETURNING * INTO v_charge;

  IF v_charge.id IS NOT NULL THEN
    PERFORM public.parking_charge_log(
      v_charge, p_event, v_charge.status, v_charge.status, p_actor,
      COALESCE(p_details, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
    );
  END IF;
END;
$$;

-- ============================================================
-- 5. ¿A qué unidad se carga?
-- ============================================================
-- La unidad del residente que reserva. Cuando el staff reserva para un
-- residente (Agent Center / CoCo), la reserva queda a nombre de ese residente
-- (parking_book_as(p_user_id = residente)), así que el cargo va a su unidad.
-- Se compara como texto porque profiles.unit_id fue TEXT en producción y UUID en
-- schema.sql; el texto funciona con los dos.
CREATE OR REPLACE FUNCTION public.parking_resolve_billed_unit(
  p_profile_id UUID,
  p_community_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unit UUID;
  v_count INTEGER;
BEGIN
  IF p_profile_id IS NULL OR p_community_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT u.id INTO v_unit
  FROM public.profiles p
  JOIN public.units u ON u.id::text = p.unit_id::text
  WHERE p.id = p_profile_id
    AND p.community_id = p_community_id
    AND u.community_id = p_community_id;
  IF v_unit IS NOT NULL THEN
    RETURN v_unit;
  END IF;

  -- Sin unidad en el perfil: solo si es dueño de exactamente una unidad. Con dos
  -- o más no se adivina; el cobro queda para revisión.
  SELECT count(*), min(u.id::text)::uuid INTO v_count, v_unit
  FROM public.units u
  WHERE u.community_id = p_community_id
    AND u.owner_id = p_profile_id;

  RETURN CASE WHEN v_count = 1 THEN v_unit ELSE NULL END;
END;
$$;

-- ============================================================
-- 6. Cargo en gastos comunes
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_post_to_unit(
  p_charge_id UUID,
  p_actor UUID DEFAULT NULL,
  p_event TEXT DEFAULT 'posted_to_unit'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_booking public.parking_bookings%ROWTYPE;
  v_spot_label TEXT;
  v_unit UUID;
  v_unit_charge UUID;
  v_month TEXT;
  v_label TEXT;
  v_tz CONSTANT TEXT := 'America/Santiago';
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'El cobro no existe' USING ERRCODE = '22023';
  END IF;

  -- Idempotente: si ya se cargó (o se cerró), no se vuelve a cargar.
  IF v_charge.status NOT IN ('pending', 'failed') THEN
    RETURN v_charge.status;
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = v_charge.booking_id;
  IF v_booking.status NOT IN ('confirmed', 'active', 'completed', 'no_show') THEN
    PERFORM public.parking_charge_transition(p_charge_id, 'voided', 'voided', p_actor,
      jsonb_build_object('reason', 'La reserva ya no está vigente'));
    RETURN 'voided';
  END IF;

  UPDATE public.parking_charges
  SET method = CASE WHEN amount = 0 THEN 'none' ELSE 'common_expenses' END,
      payment_url = NULL
  WHERE id = p_charge_id
  RETURNING * INTO v_charge;

  -- Arriendo gratuito: no hay nada que cobrar.
  IF v_charge.amount = 0 THEN
    PERFORM public.parking_charge_transition(p_charge_id, 'paid', 'free_booking', p_actor);
    RETURN 'paid';
  END IF;

  v_unit := COALESCE(v_charge.unit_id,
                     public.parking_resolve_billed_unit(v_charge.payer_profile_id, v_charge.community_id));
  IF v_unit IS NULL THEN
    PERFORM public.parking_charge_flag(
      p_charge_id, 'post_failed',
      CASE WHEN v_charge.payer_profile_id IS NULL
           THEN 'Conductor externo sin unidad: requiere pago en línea o cobro manual'
           ELSE 'El residente no tiene una unidad asociada en la comunidad' END,
      p_actor);
    RETURN v_charge.status;
  END IF;

  SELECT label INTO v_spot_label FROM public.parking_spots WHERE id = v_booking.spot_id;
  v_month := to_char(GREATEST(NOW(), v_booking.starts_at) AT TIME ZONE v_tz, 'YYYY-MM');
  v_label := left(
    'Estacionamiento ' || COALESCE(v_spot_label, '') || ' · '
      || to_char(v_booking.starts_at AT TIME ZONE v_tz, 'DD-MM-YYYY HH24:MI') || '–'
      || to_char(v_booking.ends_at AT TIME ZONE v_tz, 'HH24:MI'),
    160);

  BEGIN
    INSERT INTO public.unit_charges (
      community_id, unit_id, month, kind, label, amount, status, notes, created_by
    )
    VALUES (
      v_charge.community_id, v_unit, v_month, 'service', v_label, v_charge.amount, 'pending',
      'parking_booking:' || v_booking.id::text,
      -- created_by queda vacío cuando lo carga el sistema al reservar; solo se
      -- firma cuando una persona de la administración lo carga a mano.
      CASE WHEN p_event = 'admin_posted_to_unit' AND p_actor IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_actor)
           THEN p_actor ELSE NULL END
    )
    RETURNING id INTO v_unit_charge;
  EXCEPTION
    WHEN unique_violation THEN
      -- Ya existe el cargo de esta reserva (reintento): se enlaza en vez de duplicar.
      SELECT id INTO v_unit_charge FROM public.unit_charges
      WHERE notes = 'parking_booking:' || v_booking.id::text AND status <> 'cancelled'
      LIMIT 1;
    WHEN OTHERS THEN
      -- Típicamente: período financiero cerrado. La reserva sigue en pie; el
      -- cobro queda fallido y visible para la administración.
      PERFORM public.parking_charge_transition(p_charge_id, 'failed', 'post_failed', p_actor,
        jsonb_build_object('error', SQLERRM));
      PERFORM public.parking_charge_flag(p_charge_id, 'needs_review',
        'No se pudo cargar a la unidad: ' || SQLERRM, p_actor);
      RETURN 'failed';
  END;

  UPDATE public.parking_charges
  SET unit_id = v_unit,
      unit_charge_id = v_unit_charge,
      failure_reason = NULL
  WHERE id = p_charge_id;

  PERFORM public.parking_charge_transition(p_charge_id, 'charged', p_event, p_actor,
    jsonb_build_object('unit_id', v_unit, 'unit_charge_id', v_unit_charge, 'month', v_month));
  RETURN 'charged';
END;
$$;

-- ============================================================
-- 7. Anulación y regla de cancelación
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_void(
  p_charge_id UUID,
  p_actor UUID,
  p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_unit_status TEXT;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_charge.status IN ('pending', 'failed') THEN
    PERFORM public.parking_charge_transition(p_charge_id, 'voided', 'voided', p_actor,
      jsonb_build_object('reason', p_reason));
    RETURN 'voided';
  END IF;

  IF v_charge.status = 'charged' THEN
    SELECT status INTO v_unit_status FROM public.unit_charges
    WHERE id = v_charge.unit_charge_id FOR UPDATE;

    IF v_unit_status = 'pending' THEN
      BEGIN
        -- Revierte el cargo en la cuenta de la unidad. El trigger de
        -- sincronización deja el cobro en 'voided'.
        UPDATE public.unit_charges SET status = 'cancelled' WHERE id = v_charge.unit_charge_id;
      EXCEPTION WHEN OTHERS THEN
        PERFORM public.parking_charge_flag(p_charge_id, 'void_blocked',
          'Cancelación sin costo, pero el cargo no se pudo revertir: ' || SQLERRM, p_actor);
        RETURN 'charged';
      END;
    ELSIF v_unit_status = 'paid' THEN
      PERFORM public.parking_charge_flag(p_charge_id, 'refund_required',
        'Cancelación sin costo sobre un cargo ya pagado: corresponde reembolso', p_actor);
      RETURN 'charged';
    END IF;

    PERFORM public.parking_charge_transition(p_charge_id, 'voided', 'voided', p_actor,
      jsonb_build_object('reason', p_reason));
    RETURN 'voided';
  END IF;

  IF v_charge.status = 'paid' THEN
    PERFORM public.parking_charge_flag(p_charge_id, 'refund_required',
      'Cancelación sin costo sobre un cobro ya pagado: corresponde reembolso', p_actor);
    RETURN 'paid';
  END IF;

  RETURN v_charge.status;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_charge_on_cancel(p_booking public.parking_bookings)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_free_hours INTEGER;
  v_cancelled_at TIMESTAMPTZ := COALESCE(p_booking.cancelled_at, NOW());
  v_free BOOLEAN;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE booking_id = p_booking.id;
  IF v_charge.id IS NULL THEN
    RETURN;
  END IF;

  SELECT parking_free_cancellation_hours INTO v_free_hours
  FROM public.communities WHERE id = p_booking.community_id;
  v_free_hours := COALESCE(v_free_hours, 2);

  v_free := p_booking.cancelled_by_party IS DISTINCT FROM 'driver'
    OR v_cancelled_at <= p_booking.starts_at - make_interval(hours => v_free_hours);

  IF v_free THEN
    PERFORM public.parking_charge_void(
      v_charge.id, p_booking.cancelled_by,
      CASE WHEN p_booking.cancelled_by_party IS DISTINCT FROM 'driver'
           THEN 'Cancelada por ' || COALESCE(p_booking.cancelled_by_party, 'la administración o el sistema')
           ELSE 'Cancelada con al menos ' || v_free_hours || ' h de anticipación' END);
  ELSE
    PERFORM public.parking_charge_log(
      v_charge, 'late_cancellation_retained', v_charge.status, v_charge.status, p_booking.cancelled_by,
      jsonb_build_object('free_cancellation_hours', v_free_hours, 'cancelled_at', v_cancelled_at,
                         'starts_at', p_booking.starts_at));
  END IF;
END;
$$;

-- ============================================================
-- 8. Extensiones: el monto del cobro sigue al de la reserva
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_on_amount_change(
  p_old public.parking_bookings,
  p_new public.parking_bookings
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_unit_status TEXT;
  v_new_amount INTEGER := p_new.total_amount;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE booking_id = p_new.id FOR UPDATE;
  IF v_charge.id IS NULL OR v_charge.amount = v_new_amount THEN
    RETURN;
  END IF;

  IF v_charge.status IN ('pending', 'failed') THEN
    -- Un link de pago emitido por el monto anterior deja de servir.
    UPDATE public.parking_charges
    SET amount = v_new_amount, payment_url = NULL, provider_reference = NULL
    WHERE id = v_charge.id RETURNING * INTO v_charge;
    PERFORM public.parking_charge_log(v_charge, 'amount_adjusted', v_charge.status, v_charge.status, NULL,
      jsonb_build_object('previous_amount', p_old.total_amount));
    RETURN;
  END IF;

  IF v_charge.status = 'charged' THEN
    SELECT status INTO v_unit_status FROM public.unit_charges
    WHERE id = v_charge.unit_charge_id FOR UPDATE;
    IF v_unit_status = 'pending' THEN
      BEGIN
        UPDATE public.unit_charges SET amount = v_new_amount WHERE id = v_charge.unit_charge_id;
        UPDATE public.parking_charges SET amount = v_new_amount
        WHERE id = v_charge.id RETURNING * INTO v_charge;
        PERFORM public.parking_charge_log(v_charge, 'amount_adjusted', 'charged', 'charged', NULL,
          jsonb_build_object('previous_amount', p_old.total_amount));
        RETURN;
      EXCEPTION WHEN OTHERS THEN
        PERFORM public.parking_charge_flag(v_charge.id, 'extension_unbilled',
          'La extensión no se pudo sumar al cargo: ' || SQLERRM, NULL,
          jsonb_build_object('previous_amount', p_old.total_amount, 'new_amount', v_new_amount));
        RETURN;
      END;
    END IF;
  END IF;

  -- Cargo ya pagado (o cerrado): la diferencia queda para la administración.
  PERFORM public.parking_charge_flag(v_charge.id, 'extension_unbilled',
    'Extensión sobre un cobro ya pagado: falta cobrar la diferencia', NULL,
    jsonb_build_object('previous_amount', p_old.total_amount, 'new_amount', v_new_amount,
                       'difference', v_new_amount - p_old.total_amount));
END;
$$;

-- ============================================================
-- 9. Triggers sobre parking_bookings
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_booking_open_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_spot public.parking_spots%ROWTYPE;
  v_driver public.parking_drivers%ROWTYPE;
  v_method TEXT;
  v_quote INTEGER;
  v_payer UUID;
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  IF NEW.status NOT IN ('confirmed', 'active') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_spot FROM public.parking_spots WHERE id = NEW.spot_id;
  SELECT * INTO v_driver FROM public.parking_drivers WHERE id = NEW.driver_id;

  -- El monto se calcula aquí, con la tarifa del cupo, y debe coincidir con el
  -- de la reserva. Las reservas solo las escriben funciones de base (el rol
  -- authenticated no tiene INSERT), así que una diferencia significa que alguien
  -- se saltó parking_book_as: se rechaza.
  v_quote := public.parking_quote_amount(v_spot.hourly_rate, v_spot.daily_rate, NEW.starts_at, NEW.ends_at);
  IF v_quote IS DISTINCT FROM NEW.total_amount THEN
    RAISE EXCEPTION 'El monto de la reserva (%) no coincide con la tarifa del estacionamiento (%)',
      NEW.total_amount, v_quote USING ERRCODE = '22023';
  END IF;

  SELECT parking_billing_method INTO v_method FROM public.communities WHERE id = NEW.community_id;

  -- Paga el residente que reserva, solo si pertenece a la comunidad del cupo.
  v_payer := CASE WHEN NEW.driver_is_resident THEN v_driver.profile_id ELSE NULL END;
  IF v_payer IS NULL AND NEW.driver_is_resident THEN
    SELECT id INTO v_payer FROM public.profiles
    WHERE id = v_driver.user_id AND community_id = NEW.community_id;
  END IF;

  INSERT INTO public.parking_charges (
    community_id, booking_id, driver_id, payer_profile_id, unit_id, amount, method, status
  )
  VALUES (
    NEW.community_id, NEW.id, NEW.driver_id, v_payer,
    public.parking_resolve_billed_unit(v_payer, NEW.community_id),
    v_quote,
    CASE WHEN v_quote = 0 THEN 'none'
         WHEN COALESCE(v_method, 'common_expenses') = 'haulmer' THEN 'haulmer'
         ELSE 'common_expenses' END,
    'pending'
  )
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING * INTO v_charge;

  IF v_charge.id IS NULL THEN
    RETURN NEW; -- ya existía: idempotente
  END IF;

  PERFORM public.parking_charge_log(v_charge, 'created', NULL, 'pending', v_payer,
    jsonb_build_object('method', v_charge.method, 'hourly_rate', v_spot.hourly_rate,
                       'daily_rate', v_spot.daily_rate));

  IF v_charge.method = 'haulmer' THEN
    -- La aplicación genera el link de pago o, si Haulmer no está habilitado,
    -- llama a parking_charge_fallback_to_unit.
    PERFORM public.parking_charge_log(v_charge, 'awaiting_provider', 'pending', 'pending', NULL,
      jsonb_build_object('provider', 'haulmer'));
  ELSE
    PERFORM public.parking_charge_post_to_unit(v_charge.id, v_payer);
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_booking_sync_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status IN ('confirmed', 'active') THEN
    PERFORM public.parking_charge_on_cancel(NEW);
  ELSIF NEW.total_amount IS DISTINCT FROM OLD.total_amount
        AND NEW.status IN ('confirmed', 'active') THEN
    PERFORM public.parking_charge_on_amount_change(OLD, NEW);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_bookings_open_charge ON public.parking_bookings;
CREATE TRIGGER trg_parking_bookings_open_charge
AFTER INSERT ON public.parking_bookings
FOR EACH ROW EXECUTE FUNCTION public.parking_booking_open_charge();

DROP TRIGGER IF EXISTS trg_parking_bookings_sync_charge ON public.parking_bookings;
CREATE TRIGGER trg_parking_bookings_sync_charge
AFTER UPDATE OF status, total_amount ON public.parking_bookings
FOR EACH ROW EXECUTE FUNCTION public.parking_booking_sync_charge();

-- ============================================================
-- 10. unit_charges -> libro: el pago (o la anulación) hecho en finanzas se refleja
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_follow_unit_charge()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_charge FROM public.parking_charges WHERE unit_charge_id = NEW.id;
  IF v_charge.id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'paid' AND v_charge.status = 'charged' THEN
    PERFORM public.parking_charge_transition(v_charge.id, 'paid', 'paid_in_common_expenses', NULL);
  ELSIF NEW.status = 'pending' AND v_charge.status = 'paid' THEN
    PERFORM public.parking_charge_transition(v_charge.id, 'charged', 'payment_reversed', NULL);
  ELSIF NEW.status = 'cancelled' AND v_charge.status = 'charged' THEN
    PERFORM public.parking_charge_transition(v_charge.id, 'voided', 'unit_charge_cancelled', NULL);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_unit_charges_follow_parking ON public.unit_charges;
CREATE TRIGGER trg_unit_charges_follow_parking
AFTER UPDATE OF status ON public.unit_charges
FOR EACH ROW EXECUTE FUNCTION public.parking_charge_follow_unit_charge();

-- ============================================================
-- 11. cancel_parking_booking: registra de qué lado vino la cancelación
--
-- Mismo cuerpo que 20260810120000, con dos cambios: guarda cancelled_by_party y
-- ya no toca payment_status (ahora lo mueve el libro de cobros).
-- ============================================================
CREATE OR REPLACE FUNCTION public.cancel_parking_booking(
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.parking_bookings%ROWTYPE;
  v_driver_user UUID;
  v_party TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_driver_user FROM public.parking_drivers WHERE id = v_booking.driver_id;

  v_party := CASE
    WHEN v_user_id = v_driver_user THEN 'driver'
    WHEN v_user_id = v_booking.owner_id THEN 'owner'
    WHEN public.get_my_role() = 'admin'
         AND public.get_my_community_id() = v_booking.community_id THEN 'admin'
    ELSE NULL
  END;

  IF v_party IS NULL THEN
    RAISE EXCEPTION 'No puedes cancelar esta reserva' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status NOT IN ('confirmed', 'active') THEN
    RAISE EXCEPTION 'La reserva ya no se puede cancelar' USING ERRCODE = '22023';
  END IF;

  UPDATE public.parking_bookings
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancelled_by = CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id)
                          THEN v_user_id ELSE NULL END,
      cancelled_by_party = v_party,
      cancellation_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_parking_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_parking_booking(UUID, TEXT) TO authenticated;

-- ============================================================
-- 12. RPCs de la administración
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_assert_admin(p_charge_id UUID)
RETURNS public.parking_charges
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'admin' THEN
    RAISE EXCEPTION 'Solo la administración puede gestionar cobros' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id;
  IF v_charge.id IS NULL OR v_charge.community_id IS DISTINCT FROM public.get_my_community_id() THEN
    RAISE EXCEPTION 'El cobro no pertenece a tu comunidad' USING ERRCODE = '42501';
  END IF;
  RETURN v_charge;
END;
$$;

-- Carga a gastos comunes un cobro pendiente o fallido (p. ej. Haulmer no
-- respondió, o una reserva anterior al libro que la administración decide cobrar).
CREATE OR REPLACE FUNCTION public.admin_post_parking_charge_to_unit(p_charge_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
  v_result TEXT;
BEGIN
  v_charge := public.parking_charge_assert_admin(p_charge_id);
  IF v_charge.status NOT IN ('pending', 'failed') THEN
    RAISE EXCEPTION 'Solo se puede cargar un cobro pendiente o fallido' USING ERRCODE = '22023';
  END IF;
  UPDATE public.parking_charges SET needs_review = FALSE WHERE id = p_charge_id;
  v_result := public.parking_charge_post_to_unit(p_charge_id, auth.uid(), 'admin_posted_to_unit');
  RETURN v_result;
END;
$$;

-- Registra que la administración devolvió el dinero (transferencia, abono, etc.).
-- No mueve caja: el reembolso se hace fuera y se registra en finanzas.
CREATE OR REPLACE FUNCTION public.admin_mark_parking_charge_refunded(
  p_charge_id UUID,
  p_note TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  v_charge := public.parking_charge_assert_admin(p_charge_id);
  IF v_charge.status <> 'paid' THEN
    RAISE EXCEPTION 'Solo un cobro pagado se puede marcar como reembolsado' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(p_note, ''))) < 3 THEN
    RAISE EXCEPTION 'Indica cómo se hizo el reembolso' USING ERRCODE = '22023';
  END IF;
  PERFORM public.parking_charge_transition(p_charge_id, 'refunded', 'refunded', auth.uid(),
    jsonb_build_object('note', btrim(p_note)));
  UPDATE public.parking_charges SET needs_review = FALSE, failure_reason = NULL WHERE id = p_charge_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_parking_billing_settings(
  p_billing_method TEXT,
  p_free_cancellation_hours INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community UUID := public.get_my_community_id();
BEGIN
  IF auth.uid() IS NULL OR public.get_my_role() <> 'admin' OR v_community IS NULL THEN
    RAISE EXCEPTION 'Solo la administración puede cambiar el cobro de estacionamientos'
      USING ERRCODE = '42501';
  END IF;
  UPDATE public.communities
  SET parking_billing_method = COALESCE(p_billing_method, parking_billing_method),
      parking_free_cancellation_hours = COALESCE(p_free_cancellation_hours, parking_free_cancellation_hours)
  WHERE id = v_community;
  RETURN TRUE;
END;
$$;

-- ============================================================
-- 13. RPCs del servidor (service role): proveedor de pago
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_charge_fallback_to_unit(
  p_charge_id UUID,
  p_reason TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id;
  IF v_charge.id IS NULL THEN
    RAISE EXCEPTION 'El cobro no existe' USING ERRCODE = '22023';
  END IF;
  IF v_charge.status NOT IN ('pending', 'failed') THEN
    RETURN v_charge.status;
  END IF;
  PERFORM public.parking_charge_log(v_charge, 'fallback_to_common_expenses', v_charge.status, v_charge.status,
    NULL, jsonb_build_object('reason', left(COALESCE(p_reason, ''), 300)));
  RETURN public.parking_charge_post_to_unit(p_charge_id, NULL, 'posted_to_unit');
END;
$$;

CREATE OR REPLACE FUNCTION public.parking_charge_register_checkout(
  p_charge_id UUID,
  p_provider_reference TEXT,
  p_payment_url TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  UPDATE public.parking_charges
  SET provider_reference = p_provider_reference,
      payment_url = p_payment_url,
      method = 'haulmer'
  WHERE id = p_charge_id AND status = 'pending'
  RETURNING * INTO v_charge;
  IF v_charge.id IS NULL THEN
    RETURN FALSE;
  END IF;
  PERFORM public.parking_charge_log(v_charge, 'checkout_created', 'pending', 'pending', NULL,
    jsonb_build_object('provider', 'haulmer', 'reference', p_provider_reference));
  RETURN TRUE;
END;
$$;

-- Resultado del webhook de Haulmer. El monto pagado se compara con el del libro;
-- si no coincide, el cobro no se da por pagado.
CREATE OR REPLACE FUNCTION public.parking_charge_apply_provider_result(
  p_charge_id UUID,
  p_result TEXT,
  p_paid_amount INTEGER,
  p_gateway_reference TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_charge public.parking_charges%ROWTYPE;
BEGIN
  SELECT * INTO v_charge FROM public.parking_charges WHERE id = p_charge_id FOR UPDATE;
  IF v_charge.id IS NULL THEN
    RETURN 'unknown_reference';
  END IF;
  IF v_charge.method <> 'haulmer' THEN
    RETURN 'not_haulmer';
  END IF;
  IF v_charge.status IN ('paid', 'refunded') THEN
    RETURN 'idempotent';
  END IF;

  IF p_result = 'completed' THEN
    IF p_paid_amount IS NULL OR abs(p_paid_amount - v_charge.amount) > 1 THEN
      PERFORM public.parking_charge_flag(p_charge_id, 'amount_mismatch',
        'Haulmer informó un monto distinto al del cobro', NULL,
        jsonb_build_object('paid_amount', p_paid_amount, 'gateway_reference', p_gateway_reference));
      RETURN 'amount_mismatch';
    END IF;
    IF v_charge.status = 'voided' THEN
      PERFORM public.parking_charge_flag(p_charge_id, 'refund_required',
        'Pago recibido para una reserva ya anulada: corresponde reembolso', NULL,
        jsonb_build_object('gateway_reference', p_gateway_reference));
      RETURN 'paid_after_void';
    END IF;
    PERFORM public.parking_charge_transition(p_charge_id, 'paid', 'provider_paid', NULL,
      jsonb_build_object('gateway_reference', p_gateway_reference));
    RETURN 'processed';
  ELSIF p_result IN ('failed', 'rejected', 'cancelled') AND v_charge.status = 'pending' THEN
    PERFORM public.parking_charge_transition(p_charge_id, 'failed', 'provider_failed', NULL,
      jsonb_build_object('result', p_result, 'gateway_reference', p_gateway_reference));
    RETURN 'failed';
  END IF;

  PERFORM public.parking_charge_log(v_charge, 'provider_update', v_charge.status, v_charge.status, NULL,
    jsonb_build_object('result', p_result, 'gateway_reference', p_gateway_reference));
  RETURN 'recorded';
END;
$$;

-- ============================================================
-- 14. RLS
--
-- Igual que unit_charges: el dinero no es dato operativo, así que conserjería no
-- ve cobros (migración 20260729140000). Ven el cobro el conductor, el residente
-- que paga y la administración de esa comunidad. Nadie escribe directo: todo pasa
-- por las funciones de arriba.
-- ============================================================
ALTER TABLE public.parking_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_charge_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_charges_read ON public.parking_charges;
CREATE POLICY parking_charges_read
ON public.parking_charges
FOR SELECT TO authenticated
USING (
  driver_id = public.my_parking_driver_id()
  OR payer_profile_id = (SELECT auth.uid())
  OR (
    public.get_my_role() = 'admin'
    AND community_id = public.get_my_community_id()
  )
);

DROP POLICY IF EXISTS parking_charge_events_read ON public.parking_charge_events;
CREATE POLICY parking_charge_events_read
ON public.parking_charge_events
FOR SELECT TO authenticated
USING (
  (
    public.get_my_role() = 'admin'
    AND community_id = public.get_my_community_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.parking_charges c
    WHERE c.id = parking_charge_events.charge_id
      AND (c.driver_id = public.my_parking_driver_id() OR c.payer_profile_id = (SELECT auth.uid()))
  )
);

REVOKE ALL ON public.parking_charges FROM anon, authenticated;
REVOKE ALL ON public.parking_charge_events FROM anon, authenticated;
GRANT SELECT ON public.parking_charges TO authenticated;
GRANT SELECT ON public.parking_charge_events TO authenticated;
GRANT ALL ON public.parking_charges TO service_role;
GRANT SELECT, INSERT ON public.parking_charge_events TO service_role;

-- Internas: solo se alcanzan desde triggers y RPCs SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.parking_charge_log(public.parking_charges, TEXT, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_transition(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_flag(UUID, TEXT, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_resolve_billed_unit(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_post_to_unit(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_void(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_on_cancel(public.parking_bookings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_on_amount_change(public.parking_bookings, public.parking_bookings) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_booking_open_charge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_booking_sync_charge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_follow_unit_charge() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_parking_charge_rules() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_assert_admin(UUID) FROM PUBLIC, anon, authenticated;

-- Del servidor (proveedor de pago y webhook).
REVOKE ALL ON FUNCTION public.parking_charge_fallback_to_unit(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_register_checkout(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.parking_charge_apply_provider_result(UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.parking_charge_fallback_to_unit(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.parking_charge_register_checkout(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.parking_charge_apply_provider_result(UUID, TEXT, INTEGER, TEXT) TO service_role;

-- De la administración (validan rol y comunidad adentro).
REVOKE ALL ON FUNCTION public.admin_post_parking_charge_to_unit(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_mark_parking_charge_refunded(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_parking_billing_settings(TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_post_parking_charge_to_unit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_mark_parking_charge_refunded(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_parking_billing_settings(TEXT, INTEGER) TO authenticated;

-- ============================================================
-- 15. Reservas anteriores al libro
--
-- No se le carga nada a nadie de forma retroactiva. Se abre un cobro pendiente,
-- marcado para revisión, por cada reserva con monto que nunca se cobró. La
-- administración decide en la vista de estacionamientos si lo carga a gastos
-- comunes ("Cargar a gastos comunes") o lo deja.
-- ============================================================
WITH inserted AS (
  INSERT INTO public.parking_charges (
    community_id, booking_id, driver_id, payer_profile_id, unit_id, amount, method, status,
    needs_review, failure_reason
  )
  SELECT
    b.community_id, b.id, b.driver_id,
    CASE WHEN b.driver_is_resident THEN COALESCE(d.profile_id, p.id) END,
    public.parking_resolve_billed_unit(CASE WHEN b.driver_is_resident THEN COALESCE(d.profile_id, p.id) END, b.community_id),
    b.total_amount,
    CASE WHEN c.parking_billing_method = 'haulmer' THEN 'haulmer' ELSE 'common_expenses' END,
    'pending',
    TRUE,
    'Reserva anterior al libro de cobros: revisar antes de cargar'
  FROM public.parking_bookings b
  JOIN public.parking_drivers d ON d.id = b.driver_id
  JOIN public.communities c ON c.id = b.community_id
  LEFT JOIN public.profiles p ON p.id = d.user_id AND p.community_id = b.community_id
  WHERE b.status IN ('confirmed', 'active', 'completed', 'no_show')
    AND b.total_amount > 0
    AND b.payment_status <> 'paid'
  ON CONFLICT (booking_id) DO NOTHING
  RETURNING *
)
INSERT INTO public.parking_charge_events (charge_id, community_id, event_type, to_status, amount, details)
SELECT id, community_id, 'backfilled', 'pending', amount, '{}'::jsonb FROM inserted;

COMMIT;
