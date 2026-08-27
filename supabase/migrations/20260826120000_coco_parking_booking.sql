-- Permite que CoCo reserve un estacionamiento en nombre del residente.
--
-- El problema: create_parking_booking() resuelve al usuario con auth.uid(),
-- pero CoCo ejecuta sus herramientas con la service role, donde auth.uid()
-- es NULL. Llamarla desde el agente fallaba siempre con "Se requiere
-- autenticación".
--
-- La solución NO es duplicar la funcion con el usuario como parametro: son
-- mas de cien lineas de validaciones que deciden quien entra al edificio y
-- cuanto se cobra, y dos copias se desincronizan tarde o temprano. En vez de
-- eso el cuerpo real se extrae a parking_book_as(), y las dos entradas
-- publicas la comparten:
--
--   create_parking_booking(...)       -> parking_book_as(auth.uid(), ...)
--   coco_create_parking_booking(...)  -> parking_book_as(p_user_id, ...)
--
-- Asi cualquier regla nueva (verificacion del conductor, aprobacion del
-- comite, minimo de horas, ventana publicada) protege ambos caminos sin que
-- nadie tenga que acordarse de copiarla.

-- ============================================================
-- parking_book_as: el cuerpo real, con el usuario explicito
-- ============================================================
CREATE OR REPLACE FUNCTION public.parking_book_as(
  p_user_id UUID,
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
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_driver FROM public.parking_drivers WHERE user_id = p_user_id;
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

  IF v_spot.owner_id = p_user_id THEN
    RAISE EXCEPTION 'No puedes reservar tu propio estacionamiento' USING ERRCODE = '22023';
  END IF;

  SELECT profiles.community_id INTO v_my_community
  FROM public.profiles WHERE id = p_user_id;

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

-- Nadie la llama directamente: solo se alcanza por las dos entradas de abajo,
-- que son las que deciden de donde sale el usuario.
REVOKE ALL ON FUNCTION public.parking_book_as(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;

-- ============================================================
-- create_parking_booking: la entrada del residente en la app
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
BEGIN
  RETURN public.parking_book_as(auth.uid(), p_spot_id, p_starts_at, p_ends_at);
END;
$$;

REVOKE ALL ON FUNCTION public.create_parking_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_parking_booking(UUID, TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- coco_create_parking_booking: la entrada del agente
--
-- Recibe al residente como parametro porque CoCo corre con la service role.
-- Revocada de PUBLIC, anon y authenticated: si quedara accesible a un usuario
-- normal, cualquiera podria reservar en nombre de otro pasando su id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.coco_create_parking_booking(
  p_user_id UUID,
  p_spot_id UUID,
  p_starts_at TIMESTAMPTZ,
  p_ends_at TIMESTAMPTZ
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_book_as(p_user_id, p_spot_id, p_starts_at, p_ends_at);
END;
$$;

REVOKE ALL ON FUNCTION public.coco_create_parking_booking(UUID, UUID, TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
