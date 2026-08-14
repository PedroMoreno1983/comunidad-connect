-- Marketplace de estacionamientos: el residente publica su estacionamiento ocioso
-- y un conductor lo arrienda por hora, día o mes.
--
-- Dos decisiones estructurales:
--
-- 1. Los conductores externos NO tienen fila en public.profiles. Todo el RLS de la
--    plataforma se apoya en profiles.community_id, así que darles un perfil sin
--    comunidad los expondría a cada política existente. Viven en parking_drivers,
--    identificados por auth.users, y solo alcanzan las tablas de este módulo.
--
-- 2. Abrir el estacionamiento a conductores externos es una decisión del comité de
--    copropiedad, no de un residente suelto. Por eso el interruptor maestro vive en
--    communities y un trigger impide que un estacionamiento se declare abierto a
--    externos si la comunidad no lo habilitó.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================
-- Gobernanza a nivel de comunidad
-- ============================================================
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS parking_external_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS parking_commission_percent NUMERIC(5,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'communities_parking_commission_range'
  ) THEN
    ALTER TABLE public.communities
      ADD CONSTRAINT communities_parking_commission_range
      CHECK (parking_commission_percent >= 0 AND parking_commission_percent <= 50);
  END IF;
END $$;

COMMENT ON COLUMN public.communities.parking_external_enabled IS
  'Interruptor maestro del comité: permite que conductores ajenos al condominio reserven estacionamientos.';
COMMENT ON COLUMN public.communities.parking_commission_percent IS
  'Porcentaje de cada arriendo que retiene la comunidad. El resto se abona al dueño del estacionamiento.';

-- ============================================================
-- Identidad de conductores (residentes y externos)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Poblado solo cuando el conductor además es residente de alguna comunidad.
  profile_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 120),
  phone TEXT NOT NULL CHECK (char_length(btrim(phone)) BETWEEN 8 AND 20),
  -- RUT: conserjería lo necesita para dejar entrar a un externo.
  national_id TEXT CHECK (national_id IS NULL OR char_length(btrim(national_id)) BETWEEN 7 AND 15),
  plate TEXT NOT NULL CHECK (char_length(btrim(plate)) BETWEEN 4 AND 10),
  vehicle_description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parking_drivers_plate_idx ON public.parking_drivers(plate);

-- Autorización de un conductor externo para operar en un condominio concreto.
--
-- La verificación tiene que ser por comunidad y no un flag global: que el comité
-- de un edificio acepte a un conductor no dice nada sobre otro edificio. Además
-- resuelve el problema de visibilidad — la administración necesita ver al
-- conductor ANTES de que pueda reservar, y esta solicitud es lo que se lo pone
-- delante.
CREATE TABLE IF NOT EXISTS public.parking_community_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES public.parking_drivers(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  message TEXT NOT NULL DEFAULT '',
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_community_access_unique UNIQUE (driver_id, community_id)
);

CREATE INDEX IF NOT EXISTS parking_community_access_pending_idx
  ON public.parking_community_access(community_id, status);

-- ============================================================
-- Estacionamientos publicados
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  unit_label TEXT NOT NULL DEFAULT '',
  label TEXT NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 40),
  description TEXT NOT NULL DEFAULT '',
  -- Instrucciones de acceso: solo se revelan al conductor con reserva confirmada.
  access_notes TEXT NOT NULL DEFAULT '',
  vehicle_size TEXT NOT NULL DEFAULT 'auto'
    CHECK (vehicle_size IN ('moto', 'auto', 'suv', 'camioneta')),
  is_covered BOOLEAN NOT NULL DEFAULT FALSE,
  has_ev_charger BOOLEAN NOT NULL DEFAULT FALSE,
  -- Montos en pesos chilenos, sin decimales.
  hourly_rate INTEGER NOT NULL DEFAULT 0 CHECK (hourly_rate >= 0),
  daily_rate INTEGER CHECK (daily_rate IS NULL OR daily_rate >= 0),
  monthly_rate INTEGER CHECK (monthly_rate IS NULL OR monthly_rate >= 0),
  min_hours INTEGER NOT NULL DEFAULT 1 CHECK (min_hours BETWEEN 1 AND 24),
  allows_external BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_approval', 'published', 'paused', 'rejected')),
  approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_spots_label_unique_per_community UNIQUE (community_id, label)
);

CREATE INDEX IF NOT EXISTS parking_spots_owner_idx ON public.parking_spots(owner_id);
CREATE INDEX IF NOT EXISTS parking_spots_community_published_idx
  ON public.parking_spots(community_id, status)
  WHERE status = 'published';

-- ============================================================
-- Ventanas semanales de disponibilidad
-- weekday sigue la convención de Date.getDay(): 0 = domingo .. 6 = sábado.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_spot_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
  weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  CONSTRAINT parking_availability_window_valid CHECK (end_time > start_time),
  CONSTRAINT parking_availability_unique UNIQUE (spot_id, weekday, start_time, end_time)
);

CREATE INDEX IF NOT EXISTS parking_spot_availability_spot_idx
  ON public.parking_spot_availability(spot_id, weekday);

-- ============================================================
-- Reservas
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  spot_id UUID NOT NULL REFERENCES public.parking_spots(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES public.parking_drivers(id) ON DELETE CASCADE,
  -- Desnormalizado para que el RLS del dueño no tenga que unir con parking_spots.
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  driver_is_resident BOOLEAN NOT NULL DEFAULT FALSE,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  community_fee_amount INTEGER NOT NULL DEFAULT 0 CHECK (community_fee_amount >= 0),
  owner_payout_amount INTEGER NOT NULL DEFAULT 0 CHECK (owner_payout_amount >= 0),
  status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (status IN ('confirmed', 'active', 'completed', 'cancelled', 'no_show')),
  -- Haulmer aún no tiene permisos de API: se registra el monto, no se cobra.
  payment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  access_code TEXT NOT NULL,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancellation_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT parking_bookings_range_valid CHECK (ends_at > starts_at),
  CONSTRAINT parking_bookings_access_code_unique UNIQUE (community_id, access_code)
);

CREATE INDEX IF NOT EXISTS parking_bookings_driver_idx
  ON public.parking_bookings(driver_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS parking_bookings_owner_idx
  ON public.parking_bookings(owner_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS parking_bookings_community_window_idx
  ON public.parking_bookings(community_id, starts_at, ends_at);

-- La garantía de no-doble-reserva vive en la base de datos: dos reservas
-- simultáneas del mismo cupo no pueden ganar la carrera contra un chequeo hecho
-- en la aplicación, pero sí chocan contra esta restricción.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parking_bookings_no_overlap'
  ) THEN
    ALTER TABLE public.parking_bookings
      ADD CONSTRAINT parking_bookings_no_overlap
      EXCLUDE USING gist (
        spot_id WITH =,
        tstzrange(starts_at, ends_at, '[)') WITH &&
      ) WHERE (status IN ('confirmed', 'active'));
  END IF;
END $$;

-- ============================================================
-- Bitácora de acceso al estacionamiento
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parking_access_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES public.parking_bookings(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('entry', 'exit', 'denied')),
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS parking_access_events_booking_idx
  ON public.parking_access_events(booking_id, created_at DESC);
CREATE INDEX IF NOT EXISTS parking_access_events_community_idx
  ON public.parking_access_events(community_id, created_at DESC);

-- ============================================================
-- Triggers de consistencia
-- ============================================================
CREATE OR REPLACE FUNCTION public.touch_parking_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_drivers_touch ON public.parking_drivers;
CREATE TRIGGER trg_parking_drivers_touch
BEFORE UPDATE ON public.parking_drivers
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

DROP TRIGGER IF EXISTS trg_parking_spots_touch ON public.parking_spots;
CREATE TRIGGER trg_parking_spots_touch
BEFORE UPDATE ON public.parking_spots
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

DROP TRIGGER IF EXISTS trg_parking_bookings_touch ON public.parking_bookings;
CREATE TRIGGER trg_parking_bookings_touch
BEFORE UPDATE ON public.parking_bookings
FOR EACH ROW EXECUTE FUNCTION public.touch_parking_updated_at();

CREATE OR REPLACE FUNCTION public.normalize_parking_driver()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  NEW.phone := btrim(NEW.phone);
  NEW.national_id := NULLIF(btrim(COALESCE(NEW.national_id, '')), '');
  -- La patente se guarda canónica para que conserjería pueda buscarla escrita
  -- de cualquier forma: "bbcc12", "BB-CC-12" y "BB CC 12" son la misma.
  NEW.plate := upper(regexp_replace(NEW.plate, '[^A-Za-z0-9]', '', 'g'));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_drivers_normalize ON public.parking_drivers;
CREATE TRIGGER trg_parking_drivers_normalize
BEFORE INSERT OR UPDATE ON public.parking_drivers
FOR EACH ROW EXECUTE FUNCTION public.normalize_parking_driver();

CREATE OR REPLACE FUNCTION public.enforce_parking_spot_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_community UUID;
  v_owner_unit TEXT;
  v_external_enabled BOOLEAN;
BEGIN
  SELECT community_id, COALESCE(NULLIF(btrim(department_number), ''), '')
  INTO v_owner_community, v_owner_unit
  FROM public.profiles
  WHERE id = NEW.owner_id;

  IF v_owner_community IS NULL THEN
    RAISE EXCEPTION 'El dueño del estacionamiento no pertenece a ninguna comunidad'
      USING ERRCODE = '42501';
  END IF;

  -- El estacionamiento siempre queda en la comunidad de su dueño, venga lo que venga
  -- desde el cliente.
  NEW.community_id := v_owner_community;

  IF btrim(COALESCE(NEW.unit_label, '')) = '' THEN
    NEW.unit_label := v_owner_unit;
  END IF;

  NEW.label := btrim(NEW.label);

  SELECT parking_external_enabled INTO v_external_enabled
  FROM public.communities
  WHERE id = NEW.community_id;

  IF NEW.allows_external AND NOT COALESCE(v_external_enabled, FALSE) THEN
    RAISE EXCEPTION 'La comunidad no habilitó el arriendo a conductores externos'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_parking_spots_rules ON public.parking_spots;
CREATE TRIGGER trg_parking_spots_rules
BEFORE INSERT OR UPDATE ON public.parking_spots
FOR EACH ROW EXECUTE FUNCTION public.enforce_parking_spot_rules();

-- Si el comité revoca el acceso externo, los estacionamientos abiertos vuelven a
-- ser solo para residentes de inmediato.
CREATE OR REPLACE FUNCTION public.sync_parking_external_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.parking_external_enabled AND NOT NEW.parking_external_enabled THEN
    UPDATE public.parking_spots
    SET allows_external = FALSE
    WHERE community_id = NEW.id
      AND allows_external;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_communities_parking_external_sync ON public.communities;
CREATE TRIGGER trg_communities_parking_external_sync
AFTER UPDATE OF parking_external_enabled ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.sync_parking_external_flag();

-- ============================================================
-- Cálculo de disponibilidad y precio
-- ============================================================

-- ¿Las ventanas semanales del cupo cubren por completo el rango pedido?
-- Se evalúa en hora de Chile, que es donde vive el condominio: una ventana
-- "lunes 08:00-18:00" significa 08:00 en Santiago, no en UTC.
CREATE OR REPLACE FUNCTION public.parking_windows_cover_range(
  p_spot_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tz CONSTANT TEXT := 'America/Santiago';
  v_covered tstzmultirange := '{}'::tstzmultirange;
  v_day DATE;
BEGIN
  FOR v_day IN
    SELECT generate_series(
      (p_starts_at AT TIME ZONE v_tz)::date,
      (p_ends_at AT TIME ZONE v_tz)::date,
      INTERVAL '1 day'
    )::date
  LOOP
    SELECT v_covered + COALESCE(
             range_agg(
               tstzrange(
                 (v_day + a.start_time) AT TIME ZONE v_tz,
                 (v_day + a.end_time) AT TIME ZONE v_tz,
                 '[)'
               )
             ),
             '{}'::tstzmultirange
           )
    INTO v_covered
    FROM public.parking_spot_availability a
    WHERE a.spot_id = p_spot_id
      AND a.weekday = EXTRACT(DOW FROM v_day)::SMALLINT;
  END LOOP;

  RETURN (tstzmultirange(tstzrange(p_starts_at, p_ends_at, '[)')) - v_covered)
         = '{}'::tstzmultirange;
END;
$$;

-- Precio del arriendo. La tarifa diaria actúa como techo: si arrendar por horas
-- sale más caro que el día completo, se cobra el día.
CREATE OR REPLACE FUNCTION public.parking_quote_amount(
  p_hourly_rate INTEGER,
  p_daily_rate INTEGER,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  WITH d AS (
    SELECT GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600.0)::INTEGER) AS hours
  )
  SELECT CASE
           WHEN p_daily_rate IS NULL THEN d.hours * p_hourly_rate
           WHEN d.hours >= 24 THEN CEIL(d.hours / 24.0)::INTEGER * p_daily_rate
           ELSE LEAST(d.hours * p_hourly_rate, p_daily_rate)
         END
  FROM d;
$$;

-- ============================================================
-- RPC: registro del conductor
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_parking_driver(
  p_full_name TEXT,
  p_phone TEXT,
  p_plate TEXT,
  p_vehicle_description TEXT DEFAULT '',
  p_national_id TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_profile_id UUID;
  v_driver_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE id = v_user_id;

  INSERT INTO public.parking_drivers (
    user_id, profile_id, full_name, phone, plate, vehicle_description, national_id
  )
  VALUES (
    v_user_id, v_profile_id, p_full_name, p_phone, p_plate,
    COALESCE(p_vehicle_description, ''), p_national_id
  )
  ON CONFLICT (user_id) DO UPDATE
  SET full_name = EXCLUDED.full_name,
      phone = EXCLUDED.phone,
      plate = EXCLUDED.plate,
      vehicle_description = EXCLUDED.vehicle_description,
      national_id = COALESCE(EXCLUDED.national_id, public.parking_drivers.national_id),
      profile_id = COALESCE(EXCLUDED.profile_id, public.parking_drivers.profile_id)
  RETURNING id INTO v_driver_id;

  RETURN v_driver_id;
END;
$$;

-- ============================================================
-- RPC: búsqueda de estacionamientos disponibles
-- ============================================================
CREATE OR REPLACE FUNCTION public.search_parking_spots(
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ,
  p_community_id UUID DEFAULT NULL
)
RETURNS TABLE (
  spot_id UUID,
  community_id UUID,
  community_name TEXT,
  label TEXT,
  unit_label TEXT,
  description TEXT,
  vehicle_size TEXT,
  is_covered BOOLEAN,
  has_ev_charger BOOLEAN,
  hourly_rate INTEGER,
  daily_rate INTEGER,
  monthly_rate INTEGER,
  min_hours INTEGER,
  owner_name TEXT,
  quoted_amount INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_my_community UUID;
  v_is_driver BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'El rango horario es inválido' USING ERRCODE = '22023';
  END IF;

  SELECT profiles.community_id INTO v_my_community
  FROM public.profiles WHERE id = v_user_id;

  SELECT EXISTS (SELECT 1 FROM public.parking_drivers d WHERE d.user_id = v_user_id)
  INTO v_is_driver;

  IF v_my_community IS NULL AND NOT v_is_driver THEN
    RAISE EXCEPTION 'Registra tu vehículo antes de buscar estacionamientos'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.id,
    s.community_id,
    c.name,
    s.label,
    s.unit_label,
    s.description,
    s.vehicle_size,
    s.is_covered,
    s.has_ev_charger,
    s.hourly_rate,
    s.daily_rate,
    s.monthly_rate,
    s.min_hours,
    COALESCE(owner_profile.name, 'Residente'),
    public.parking_quote_amount(s.hourly_rate, s.daily_rate, p_starts_at, p_ends_at)
  FROM public.parking_spots s
  JOIN public.communities c ON c.id = s.community_id
  JOIN public.profiles owner_profile ON owner_profile.id = s.owner_id
  WHERE s.status = 'published'
    AND (p_community_id IS NULL OR s.community_id = p_community_id)
    -- Un residente ve los cupos de su propia comunidad; cualquier otro conductor
    -- solo ve los que el comité y el dueño abrieron explícitamente a externos.
    AND (
      s.community_id = v_my_community
      OR (s.allows_external AND c.parking_external_enabled)
    )
    AND s.owner_id <> v_user_id
    AND CEIL(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600.0) >= s.min_hours
    AND public.parking_windows_cover_range(s.id, p_starts_at, p_ends_at)
    AND NOT EXISTS (
      SELECT 1
      FROM public.parking_bookings b
      WHERE b.spot_id = s.id
        AND b.status IN ('confirmed', 'active')
        AND tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  ORDER BY public.parking_quote_amount(s.hourly_rate, s.daily_rate, p_starts_at, p_ends_at),
           s.label;
END;
$$;

-- ============================================================
-- RPC: crear reserva
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_parking_booking(
  p_spot_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_driver public.parking_drivers%ROWTYPE;
  v_spot public.parking_spots%ROWTYPE;
  v_my_community UUID;
  v_external_enabled BOOLEAN;
  v_commission NUMERIC(5,2);
  v_hours INTEGER;
  v_total INTEGER;
  v_fee INTEGER;
  v_access_code TEXT;
  v_booking_id UUID;
  v_is_resident BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_driver FROM public.parking_drivers WHERE user_id = v_user_id;
  IF v_driver.id IS NULL THEN
    RAISE EXCEPTION 'Registra tu vehículo antes de reservar' USING ERRCODE = '42501';
  END IF;

  IF p_ends_at <= p_starts_at THEN
    RAISE EXCEPTION 'El rango horario es inválido' USING ERRCODE = '22023';
  END IF;

  IF p_starts_at < NOW() - INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'No se puede reservar en el pasado' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_spot FROM public.parking_spots WHERE id = p_spot_id;
  IF v_spot.id IS NULL OR v_spot.status <> 'published' THEN
    RAISE EXCEPTION 'El estacionamiento no está disponible' USING ERRCODE = '22023';
  END IF;

  IF v_spot.owner_id = v_user_id THEN
    RAISE EXCEPTION 'No puedes reservar tu propio estacionamiento' USING ERRCODE = '22023';
  END IF;

  SELECT profiles.community_id INTO v_my_community
  FROM public.profiles WHERE id = v_user_id;

  v_is_resident := v_my_community IS NOT NULL AND v_my_community = v_spot.community_id;

  IF NOT v_is_resident THEN
    SELECT parking_external_enabled, parking_commission_percent
    INTO v_external_enabled, v_commission
    FROM public.communities WHERE id = v_spot.community_id;

    IF NOT COALESCE(v_external_enabled, FALSE) OR NOT v_spot.allows_external THEN
      RAISE EXCEPTION 'Este estacionamiento es solo para residentes de la comunidad'
        USING ERRCODE = '42501';
    END IF;

    -- Un desconocido no entra al edificio sin que la administración lo haya validado.
    IF v_driver.verification_status <> 'verified' THEN
      RAISE EXCEPTION 'Tu cuenta de conductor todavía no está verificada por la administración'
        USING ERRCODE = '42501';
    END IF;
  ELSE
    SELECT parking_commission_percent INTO v_commission
    FROM public.communities WHERE id = v_spot.community_id;
  END IF;

  v_hours := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (p_ends_at - p_starts_at)) / 3600.0)::INTEGER);
  IF v_hours < v_spot.min_hours THEN
    RAISE EXCEPTION 'La reserva mínima de este estacionamiento es de % horas', v_spot.min_hours
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.parking_windows_cover_range(p_spot_id, p_starts_at, p_ends_at) THEN
    RAISE EXCEPTION 'El horario pedido está fuera de la disponibilidad publicada'
      USING ERRCODE = '22023';
  END IF;

  v_total := public.parking_quote_amount(v_spot.hourly_rate, v_spot.daily_rate, p_starts_at, p_ends_at);
  v_fee := ROUND(v_total * COALESCE(v_commission, 0) / 100.0);

  -- Código corto que el conductor muestra en portería. Sin caracteres ambiguos.
  LOOP
    v_access_code := (
      SELECT string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', (random() * 31)::INTEGER + 1, 1), '')
      FROM generate_series(1, 6)
    );
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.parking_bookings
      WHERE community_id = v_spot.community_id AND access_code = v_access_code
    );
  END LOOP;

  BEGIN
    INSERT INTO public.parking_bookings (
      community_id, spot_id, driver_id, owner_id, driver_is_resident,
      starts_at, ends_at, total_amount, community_fee_amount, owner_payout_amount,
      status, payment_status, access_code
    )
    VALUES (
      v_spot.community_id, p_spot_id, v_driver.id, v_spot.owner_id, v_is_resident,
      p_starts_at, p_ends_at, v_total, v_fee, v_total - v_fee,
      'confirmed', 'pending', v_access_code
    )
    RETURNING id INTO v_booking_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'Alguien acaba de reservar ese estacionamiento en el mismo horario'
        USING ERRCODE = '23505';
  END;

  RETURN v_booking_id;
END;
$$;

-- ============================================================
-- RPC: cancelar reserva
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
  v_can_cancel BOOLEAN;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_driver_user FROM public.parking_drivers WHERE id = v_booking.driver_id;

  v_can_cancel := v_user_id IN (v_driver_user, v_booking.owner_id)
    OR (
      public.get_my_role() = 'admin'
      AND public.get_my_community_id() = v_booking.community_id
    );

  IF NOT v_can_cancel THEN
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
      cancellation_reason = NULLIF(btrim(COALESCE(p_reason, '')), ''),
      payment_status = CASE WHEN payment_status = 'paid' THEN 'refunded' ELSE payment_status END
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- RPC: portería — validar código y registrar acceso
-- ============================================================
CREATE OR REPLACE FUNCTION public.lookup_parking_access(p_code TEXT)
RETURNS TABLE (
  booking_id UUID,
  spot_label TEXT,
  unit_label TEXT,
  driver_name TEXT,
  driver_phone TEXT,
  driver_national_id TEXT,
  plate TEXT,
  vehicle_description TEXT,
  driver_is_resident BOOLEAN,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  status TEXT,
  is_valid_now BOOLEAN,
  last_event TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community UUID := public.get_my_community_id();
  v_role TEXT := public.get_my_role();
  v_code TEXT := upper(btrim(COALESCE(p_code, '')));
BEGIN
  IF v_community IS NULL OR v_role NOT IN ('concierge', 'admin') THEN
    RAISE EXCEPTION 'Solo conserjería y administración pueden validar accesos'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    s.label,
    s.unit_label,
    d.full_name,
    d.phone,
    d.national_id,
    d.plate,
    d.vehicle_description,
    b.driver_is_resident,
    b.starts_at,
    b.ends_at,
    b.status,
    -- Se tolera un cuarto de hora antes y después: nadie llega al minuto exacto.
    (
      b.status IN ('confirmed', 'active')
      AND NOW() BETWEEN b.starts_at - INTERVAL '15 minutes' AND b.ends_at + INTERVAL '15 minutes'
    ),
    (
      SELECT e.event_type
      FROM public.parking_access_events e
      WHERE e.booking_id = b.id
      ORDER BY e.created_at DESC
      LIMIT 1
    )
  FROM public.parking_bookings b
  JOIN public.parking_spots s ON s.id = b.spot_id
  JOIN public.parking_drivers d ON d.id = b.driver_id
  WHERE b.community_id = v_community
    AND (
      b.access_code = v_code
      OR d.plate = upper(regexp_replace(v_code, '[^A-Za-z0-9]', '', 'g'))
    )
  ORDER BY b.starts_at DESC
  LIMIT 5;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_parking_access(
  p_booking_id UUID,
  p_event_type TEXT,
  p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_community UUID := public.get_my_community_id();
  v_role TEXT := public.get_my_role();
  v_booking public.parking_bookings%ROWTYPE;
  v_event_id UUID;
BEGIN
  IF v_community IS NULL OR v_role NOT IN ('concierge', 'admin') THEN
    RAISE EXCEPTION 'Solo conserjería y administración pueden registrar accesos'
      USING ERRCODE = '42501';
  END IF;

  IF p_event_type NOT IN ('entry', 'exit', 'denied') THEN
    RAISE EXCEPTION 'Tipo de evento inválido' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL OR v_booking.community_id <> v_community THEN
    RAISE EXCEPTION 'La reserva no pertenece a esta comunidad' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.parking_access_events (booking_id, community_id, event_type, recorded_by, notes)
  VALUES (p_booking_id, v_community, p_event_type, v_user_id, COALESCE(btrim(p_notes), ''))
  RETURNING id INTO v_event_id;

  -- La entrada y la salida mueven el estado de la reserva sin intervención del residente.
  IF p_event_type = 'entry' AND v_booking.status = 'confirmed' THEN
    UPDATE public.parking_bookings SET status = 'active' WHERE id = p_booking_id;
  ELSIF p_event_type = 'exit' AND v_booking.status IN ('confirmed', 'active') THEN
    UPDATE public.parking_bookings SET status = 'completed' WHERE id = p_booking_id;
  END IF;

  RETURN v_event_id;
END;
$$;

-- ============================================================
-- Ayudantes de RLS
--
-- parking_drivers y parking_bookings se necesitan mutuamente para decidir quién ve
-- qué. Si esa consulta cruzada se escribe como subconsulta dentro de la política,
-- cada tabla dispara la política de la otra y el RLS entra en recursión infinita
-- (el mismo problema que resolvió la migración 016). Estas funciones SECURITY
-- DEFINER cortan el ciclo: leen sin RLS y devuelven un dato escalar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_parking_driver_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.parking_drivers WHERE user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.parking_driver_books_in_community(
  p_driver_id UUID,
  p_community_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.parking_bookings b
    WHERE b.driver_id = p_driver_id
      AND b.community_id = p_community_id
  );
$$;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE public.parking_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_spots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_spot_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parking_access_events ENABLE ROW LEVEL SECURITY;

-- parking_drivers -------------------------------------------------
DROP POLICY IF EXISTS parking_drivers_self_select ON public.parking_drivers;
CREATE POLICY parking_drivers_self_select
ON public.parking_drivers
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  -- Conserjería y administración ven al conductor solo si tiene una reserva en su comunidad.
  OR (
    public.get_my_role() IN ('concierge', 'admin')
    AND public.parking_driver_books_in_community(id, public.get_my_community_id())
  )
);

DROP POLICY IF EXISTS parking_drivers_self_update ON public.parking_drivers;
CREATE POLICY parking_drivers_self_update
ON public.parking_drivers
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

-- parking_spots ---------------------------------------------------
DROP POLICY IF EXISTS parking_spots_read ON public.parking_spots;
CREATE POLICY parking_spots_read
ON public.parking_spots
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR (status = 'published' AND community_id = public.get_my_community_id())
  OR (
    public.get_my_role() IN ('admin', 'concierge')
    AND community_id = public.get_my_community_id()
  )
  -- Conductor externo: solo cupos abiertos a externos en comunidades que lo permiten.
  OR (
    status = 'published'
    AND allows_external
    AND EXISTS (
      SELECT 1 FROM public.communities c
      WHERE c.id = parking_spots.community_id AND c.parking_external_enabled
    )
    AND public.my_parking_driver_id() IS NOT NULL
  )
);

DROP POLICY IF EXISTS parking_spots_owner_insert ON public.parking_spots;
CREATE POLICY parking_spots_owner_insert
ON public.parking_spots
FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS parking_spots_owner_update ON public.parking_spots;
CREATE POLICY parking_spots_owner_update
ON public.parking_spots
FOR UPDATE TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
)
WITH CHECK (
  owner_id = (SELECT auth.uid())
  OR (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
);

DROP POLICY IF EXISTS parking_spots_owner_delete ON public.parking_spots;
CREATE POLICY parking_spots_owner_delete
ON public.parking_spots
FOR DELETE TO authenticated
USING (owner_id = (SELECT auth.uid()));

-- parking_spot_availability --------------------------------------
DROP POLICY IF EXISTS parking_availability_read ON public.parking_spot_availability;
CREATE POLICY parking_availability_read
ON public.parking_spot_availability
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.parking_spots s WHERE s.id = spot_id)
);

DROP POLICY IF EXISTS parking_availability_owner_write ON public.parking_spot_availability;
CREATE POLICY parking_availability_owner_write
ON public.parking_spot_availability
FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.parking_spots s
    WHERE s.id = spot_id AND s.owner_id = (SELECT auth.uid())
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.parking_spots s
    WHERE s.id = spot_id AND s.owner_id = (SELECT auth.uid())
  )
);

-- parking_bookings ------------------------------------------------
DROP POLICY IF EXISTS parking_bookings_read ON public.parking_bookings;
CREATE POLICY parking_bookings_read
ON public.parking_bookings
FOR SELECT TO authenticated
USING (
  owner_id = (SELECT auth.uid())
  OR driver_id = public.my_parking_driver_id()
  OR (
    public.get_my_role() IN ('admin', 'concierge')
    AND community_id = public.get_my_community_id()
  )
);

-- parking_access_events -------------------------------------------
DROP POLICY IF EXISTS parking_access_events_read ON public.parking_access_events;
CREATE POLICY parking_access_events_read
ON public.parking_access_events
FOR SELECT TO authenticated
USING (
  (
    public.get_my_role() IN ('admin', 'concierge')
    AND community_id = public.get_my_community_id()
  )
  OR EXISTS (
    SELECT 1 FROM public.parking_bookings b
    LEFT JOIN public.parking_drivers d ON d.id = b.driver_id
    WHERE b.id = parking_access_events.booking_id
      AND (b.owner_id = (SELECT auth.uid()) OR d.user_id = (SELECT auth.uid()))
  )
);

-- ============================================================
-- Permisos
-- ============================================================
REVOKE ALL ON public.parking_drivers FROM anon;
REVOKE ALL ON public.parking_spots FROM anon;
REVOKE ALL ON public.parking_spot_availability FROM anon;
REVOKE ALL ON public.parking_bookings FROM anon;
REVOKE ALL ON public.parking_access_events FROM anon;

GRANT SELECT, UPDATE ON public.parking_drivers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parking_spots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.parking_spot_availability TO authenticated;
GRANT SELECT ON public.parking_bookings TO authenticated;
GRANT SELECT ON public.parking_access_events TO authenticated;

REVOKE ALL ON FUNCTION public.upsert_parking_driver(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_parking_spots(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_parking_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_parking_booking(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.lookup_parking_access(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_parking_access(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parking_windows_cover_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_parking_driver(TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_parking_spots(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_parking_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_parking_booking(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_parking_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_parking_access(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parking_windows_cover_range(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- El módulo queda disponible en todos los planes. Si se decide venderlo como
-- premium, basta con poner "parking": false en el tier correspondiente.
-- ============================================================
UPDATE public.pricing_tiers
SET features = COALESCE(features, '{}'::jsonb) || '{"parking": true}'::jsonb
WHERE NOT (COALESCE(features, '{}'::jsonb) ? 'parking');

COMMIT;
