-- ============================================================
-- CoCo: extender reservas de estacionamiento y acceso de conductores externos
-- ============================================================
-- Mismo patrón que 20261116120000_coco_cancel_parking_storage.sql: la lógica
-- pasa a <dominio>_as(p_user_id, ...); las funciones de la interfaz quedan
-- como wrappers con auth.uid() (mismo contrato, mismas reglas y mensajes), y
-- los coco_* son solo para service_role, que pasa el perfil autenticado.
--
-- Extender cambia el monto de la reserva; el cobro lo ajustan los triggers de
-- parking_bookings, igual que desde la pantalla.

-- ── Extender una reserva ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.parking_extend_as(
  p_user_id UUID,
  p_booking_id UUID,
  p_additional_minutes INTEGER
)
RETURNS TABLE (new_ends_at TIMESTAMPTZ, additional_amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.parking_bookings%ROWTYPE;
  v_spot public.parking_spots%ROWTYPE;
  v_driver_user UUID;
  v_new_end TIMESTAMPTZ;
  v_extra INTEGER;
  v_fee INTEGER;
  v_commission NUMERIC(5,2);
BEGIN
  IF p_user_id IS NULL THEN
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
  IF v_driver_user IS DISTINCT FROM p_user_id THEN
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
REVOKE ALL ON FUNCTION public.parking_extend_as(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.extend_parking_booking(
  p_booking_id UUID,
  p_additional_minutes INTEGER
)
RETURNS TABLE (new_ends_at TIMESTAMPTZ, additional_amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.parking_extend_as(auth.uid(), p_booking_id, p_additional_minutes);
END;
$$;
REVOKE ALL ON FUNCTION public.extend_parking_booking(UUID, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.extend_parking_booking(UUID, INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.coco_extend_parking_booking(
  p_user_id UUID,
  p_booking_id UUID,
  p_additional_minutes INTEGER
)
RETURNS TABLE (new_ends_at TIMESTAMPTZ, additional_amount INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY SELECT * FROM public.parking_extend_as(p_user_id, p_booking_id, p_additional_minutes);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_extend_parking_booking(UUID, UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_extend_parking_booking(UUID, UUID, INTEGER) TO service_role;

-- ── Revisar la solicitud de un conductor externo ────────────
CREATE OR REPLACE FUNCTION public.parking_access_review_as(
  p_user_id UUID,
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
  v_role TEXT;
  v_community UUID;
  v_row_community UUID;
BEGIN
  SELECT role, community_id INTO v_role, v_community FROM public.profiles WHERE id = p_user_id;
  IF p_user_id IS NULL OR v_role IS DISTINCT FROM 'admin' OR v_community IS NULL THEN
    RAISE EXCEPTION 'Solo la administración puede aprobar conductores' USING ERRCODE = '42501';
  END IF;

  SELECT community_id INTO v_row_community
  FROM public.parking_community_access WHERE id = p_access_id;

  IF v_row_community IS NULL OR v_row_community <> v_community THEN
    RAISE EXCEPTION 'La solicitud no pertenece a tu comunidad' USING ERRCODE = '42501';
  END IF;

  UPDATE public.parking_community_access
  SET status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
      reviewed_by = p_user_id,
      reviewed_at = NOW(),
      review_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_access_id;

  -- Revocar el acceso cancela lo que ese conductor tuviera reservado a futuro.
  IF NOT p_approved THEN
    UPDATE public.parking_bookings b
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancelled_by = p_user_id,
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
REVOKE ALL ON FUNCTION public.parking_access_review_as(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;

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
BEGIN
  RETURN public.parking_access_review_as(auth.uid(), p_access_id, p_approved, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.review_parking_community_access(UUID, BOOLEAN, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_parking_community_access(UUID, BOOLEAN, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.coco_review_parking_community_access(
  p_user_id UUID,
  p_access_id UUID,
  p_approved BOOLEAN,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_access_review_as(p_user_id, p_access_id, p_approved, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_review_parking_community_access(UUID, UUID, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_review_parking_community_access(UUID, UUID, BOOLEAN, TEXT) TO service_role;
