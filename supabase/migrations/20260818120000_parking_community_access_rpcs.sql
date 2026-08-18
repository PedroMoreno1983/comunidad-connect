-- Completa el flujo de acceso de conductores externos.
--
-- La migración 20260810120000 creó la tabla parking_community_access pero quedó
-- sin usar: create_parking_booking seguía validando una columna
-- parking_drivers.verification_status que esa misma migración ya no crea, así que
-- toda reserva de un externo fallaba en runtime. Aquí se cierra el círculo:
--
--   1. El conductor externo solicita acceso a un condominio concreto.
--   2. La administración de ese condominio aprueba o rechaza.
--   3. Recién entonces create_parking_booking le deja reservar.
--
-- La autorización es por comunidad y no un flag global a propósito: que un comité
-- acepte a un conductor no dice nada sobre otro edificio.
BEGIN;

-- Por si la tabla no existe todavía en este entorno.
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
-- Helpers
-- ============================================================

-- SECURITY DEFINER para poder consultarse desde políticas RLS sin recursión.
CREATE OR REPLACE FUNCTION public.parking_driver_has_access(
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
    SELECT 1
    FROM public.parking_community_access a
    WHERE a.driver_id = p_driver_id
      AND a.community_id = p_community_id
      AND a.status = 'approved'
  );
$$;

-- Reemplaza a parking_driver_books_in_community: la administración necesita ver
-- al conductor ANTES de que pueda reservar, y lo que se lo pone delante es
-- justamente la solicitud pendiente.
CREATE OR REPLACE FUNCTION public.parking_driver_linked_to_community(
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
    WHERE b.driver_id = p_driver_id AND b.community_id = p_community_id
  ) OR EXISTS (
    SELECT 1 FROM public.parking_community_access a
    WHERE a.driver_id = p_driver_id AND a.community_id = p_community_id
  );
$$;

DROP POLICY IF EXISTS parking_drivers_self_select ON public.parking_drivers;
CREATE POLICY parking_drivers_self_select
ON public.parking_drivers
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    public.get_my_role() IN ('concierge', 'admin')
    AND public.parking_driver_linked_to_community(id, public.get_my_community_id())
  )
);

DROP FUNCTION IF EXISTS public.parking_driver_books_in_community(UUID, UUID);

-- ============================================================
-- RPC: el conductor solicita acceso a un condominio
-- ============================================================
CREATE OR REPLACE FUNCTION public.request_parking_community_access(
  p_community_id UUID,
  p_message TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_driver_id UUID;
  v_external_enabled BOOLEAN;
  v_access_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_driver_id FROM public.parking_drivers WHERE user_id = v_user_id;
  IF v_driver_id IS NULL THEN
    RAISE EXCEPTION 'Registra tu vehículo antes de solicitar acceso' USING ERRCODE = '42501';
  END IF;

  SELECT parking_external_enabled INTO v_external_enabled
  FROM public.communities WHERE id = p_community_id;

  IF v_external_enabled IS NULL THEN
    RAISE EXCEPTION 'La comunidad no existe' USING ERRCODE = '22023';
  END IF;

  IF NOT v_external_enabled THEN
    RAISE EXCEPTION 'Este condominio no recibe conductores externos' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.parking_community_access (driver_id, community_id, message)
  VALUES (v_driver_id, p_community_id, COALESCE(btrim(p_message), ''))
  ON CONFLICT (driver_id, community_id) DO UPDATE
  -- Reintentar tras un rechazo vuelve a dejar la solicitud pendiente; si ya está
  -- aprobada no se toca, para que un reenvío no revoque un acceso vigente.
  SET status = CASE WHEN public.parking_community_access.status = 'rejected'
                    THEN 'pending'
                    ELSE public.parking_community_access.status END,
      message = COALESCE(btrim(EXCLUDED.message), '')
  RETURNING id INTO v_access_id;

  RETURN v_access_id;
END;
$$;

-- ============================================================
-- RPC: la administración revisa la solicitud
-- ============================================================
CREATE OR REPLACE FUNCTION public.review_parking_community_access(
  p_access_id UUID,
  p_approved BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_community UUID := public.get_my_community_id();
  v_row_community UUID;
BEGIN
  IF v_user_id IS NULL OR public.get_my_role() <> 'admin' OR v_community IS NULL THEN
    RAISE EXCEPTION 'Solo la administración puede aprobar conductores' USING ERRCODE = '42501';
  END IF;

  SELECT community_id INTO v_row_community
  FROM public.parking_community_access WHERE id = p_access_id;

  IF v_row_community IS NULL OR v_row_community <> v_community THEN
    RAISE EXCEPTION 'La solicitud no pertenece a tu comunidad' USING ERRCODE = '42501';
  END IF;

  UPDATE public.parking_community_access
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      reviewed_by = v_user_id,
      reviewed_at = NOW(),
      review_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_access_id;

  -- Revocar el acceso cancela lo que ese conductor tuviera reservado a futuro:
  -- de otro modo seguiría entrando al edificio con reservas ya emitidas.
  IF NOT p_approved THEN
    UPDATE public.parking_bookings b
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = v_user_id,
        cancellation_reason = 'Acceso al condominio revocado por la administración'
    FROM public.parking_community_access a
    WHERE a.id = p_access_id
      AND b.driver_id = a.driver_id
      AND b.community_id = a.community_id
      AND b.driver_is_resident = FALSE
      AND b.status IN ('confirmed', 'active')
      AND b.ends_at > NOW();
  END IF;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- RPC: bandeja de solicitudes para la administración
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_parking_access_requests()
RETURNS TABLE (
  access_id UUID,
  driver_id UUID,
  full_name TEXT,
  phone TEXT,
  national_id TEXT,
  plate TEXT,
  vehicle_description TEXT,
  status TEXT,
  message TEXT,
  review_reason TEXT,
  created_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community UUID := public.get_my_community_id();
BEGIN
  IF v_community IS NULL OR public.get_my_role() NOT IN ('admin', 'concierge') THEN
    RAISE EXCEPTION 'Solo administración y conserjería pueden ver las solicitudes'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.driver_id,
    d.full_name,
    d.phone,
    d.national_id,
    d.plate,
    d.vehicle_description,
    a.status,
    a.message,
    a.review_reason,
    a.created_at,
    a.reviewed_at
  FROM public.parking_community_access a
  JOIN public.parking_drivers d ON d.id = a.driver_id
  WHERE a.community_id = v_community
  -- Pendientes primero: es lo que la administración tiene que resolver.
  ORDER BY (a.status = 'pending') DESC, a.created_at DESC;
END;
$$;

-- ============================================================
-- RPC: consulta del propio conductor sobre su acceso
-- ============================================================
CREATE OR REPLACE FUNCTION public.my_parking_community_access()
RETURNS TABLE (
  access_id UUID,
  community_id UUID,
  community_name TEXT,
  status TEXT,
  review_reason TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.id, a.community_id, c.name, a.status, a.review_reason, a.created_at
  FROM public.parking_community_access a
  JOIN public.communities c ON c.id = a.community_id
  JOIN public.parking_drivers d ON d.id = a.driver_id
  WHERE d.user_id = auth.uid()
  ORDER BY a.created_at DESC;
$$;

-- ============================================================
-- create_parking_booking: valida contra la solicitud aprobada
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

    -- Un desconocido no entra al edificio sin que el comité lo haya aprobado.
    IF NOT public.parking_driver_has_access(v_driver.id, v_spot.community_id) THEN
      RAISE EXCEPTION 'La administración del condominio aún no aprueba tu acceso'
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
-- extend_parking_booking: alargar una reserva en curso
--
-- Vive en la base porque tiene que cobrar la tarifa real del cupo y porque el
-- solape contra la reserva siguiente lo resuelve la exclusion constraint dentro
-- de la misma transacción.
-- ============================================================
CREATE OR REPLACE FUNCTION public.extend_parking_booking(
  p_booking_id UUID,
  p_additional_minutes INTEGER
)
RETURNS TABLE (new_ends_at TIMESTAMPTZ, additional_amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_booking public.parking_bookings%ROWTYPE;
  v_spot public.parking_spots%ROWTYPE;
  v_driver_user UUID;
  v_new_end TIMESTAMPTZ;
  v_extra INTEGER;
  v_fee INTEGER;
  v_commission NUMERIC(5,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  IF p_additional_minutes IS NULL OR p_additional_minutes <= 0 OR p_additional_minutes > 720 THEN
    RAISE EXCEPTION 'La extensión debe estar entre 1 y 720 minutos' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_driver_user FROM public.parking_drivers WHERE id = v_booking.driver_id;
  -- IS DISTINCT FROM y no <>: si la fila del conductor no existe, la comparación
  -- daría NULL y dejaría pasar la extensión sin dueño identificado.
  IF v_driver_user IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'Solo el conductor puede extender su reserva' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status NOT IN ('confirmed', 'active') THEN
    RAISE EXCEPTION 'Esta reserva ya no se puede extender' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_spot FROM public.parking_spots WHERE id = v_booking.spot_id;
  v_new_end := v_booking.ends_at + make_interval(mins => p_additional_minutes);

  IF NOT public.parking_windows_cover_range(v_booking.spot_id, v_booking.starts_at, v_new_end) THEN
    RAISE EXCEPTION 'El dueño no tiene el estacionamiento disponible hasta esa hora'
      USING ERRCODE = '22023';
  END IF;

  -- Diferencia entre cotizar el tramo completo y lo ya cobrado, para que la
  -- extensión respete el tope de la tarifa diaria en vez de sumar horas sueltas.
  v_extra := GREATEST(
    0,
    public.parking_quote_amount(v_spot.hourly_rate, v_spot.daily_rate, v_booking.starts_at, v_new_end)
      - v_booking.total_amount
  );

  SELECT parking_commission_percent INTO v_commission
  FROM public.communities WHERE id = v_booking.community_id;
  v_fee := ROUND((v_booking.total_amount + v_extra) * COALESCE(v_commission, 0) / 100.0);

  BEGIN
    UPDATE public.parking_bookings
    SET ends_at = v_new_end,
        total_amount = total_amount + v_extra,
        community_fee_amount = v_fee,
        owner_payout_amount = (total_amount + v_extra) - v_fee
    WHERE id = p_booking_id;
  EXCEPTION
    WHEN exclusion_violation THEN
      RAISE EXCEPTION 'No se puede extender: el estacionamiento ya está reservado por otra persona'
        USING ERRCODE = '23505';
  END;

  RETURN QUERY SELECT v_new_end, v_extra;
END;
$$;

-- ============================================================
-- RLS y permisos de parking_community_access
-- ============================================================
ALTER TABLE public.parking_community_access ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS parking_community_access_read ON public.parking_community_access;
CREATE POLICY parking_community_access_read
ON public.parking_community_access
FOR SELECT TO authenticated
USING (
  driver_id = public.my_parking_driver_id()
  OR (
    public.get_my_role() IN ('admin', 'concierge')
    AND community_id = public.get_my_community_id()
  )
);

REVOKE ALL ON public.parking_community_access FROM anon;
GRANT SELECT ON public.parking_community_access TO authenticated;

REVOKE ALL ON FUNCTION public.request_parking_community_access(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_parking_community_access(UUID, BOOLEAN, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_parking_access_requests() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.my_parking_community_access() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parking_driver_has_access(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.parking_driver_linked_to_community(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.extend_parking_booking(UUID, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.request_parking_community_access(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_parking_community_access(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_parking_access_requests() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_parking_community_access() TO authenticated;
GRANT EXECUTE ON FUNCTION public.parking_driver_has_access(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.parking_driver_linked_to_community(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.extend_parking_booking(UUID, INTEGER) TO authenticated;

-- Ya nadie usa esta columna: la autorización es por comunidad.
ALTER TABLE public.parking_drivers DROP COLUMN IF EXISTS verification_status;

COMMIT;
