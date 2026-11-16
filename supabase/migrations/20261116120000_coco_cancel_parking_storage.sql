-- ============================================================
-- CoCo puede deshacer lo que reserva: cancelar estacionamiento y bodega
-- ============================================================
-- CoCo reservaba estacionamientos (coco_create_parking_booking) y arrendaba
-- bodegas (coco_rent_storage_unit), pero no podía cancelar ninguna de las dos:
-- las funciones de cancelar leen auth.uid(), y CoCo corre con la service role,
-- sin sesión de usuario. El residente reservaba conversando y tenía que buscar
-- la pantalla para anular.
--
-- Mismo patrón que storage_rent_as / rent_storage_unit / coco_rent_storage_unit:
--   * <dominio>_cancel_as(p_user_id, ...) tiene la lógica, con quien actúa
--     como parámetro. Nadie fuera de la base la llama directo.
--   * cancel_parking_booking / cancel_storage_rental (las de la interfaz)
--     pasan auth.uid(). Mismo contrato, mismas reglas y mismos mensajes.
--   * coco_cancel_* solo para service_role: CoCo pasa el perfil autenticado.
--
-- Las reglas de dinero no cambian: los triggers de parking_bookings deciden si
-- la cancelación tiene costo, y cancelar una bodega anula solo los cargos
-- futuros y pendientes.

-- ── Estacionamiento ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.parking_cancel_as(
  p_user_id UUID,
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.parking_bookings%ROWTYPE;
  v_driver_user UUID;
  v_role TEXT;
  v_community UUID;
  v_party TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_driver_user FROM public.parking_drivers WHERE id = v_booking.driver_id;
  SELECT role, community_id INTO v_role, v_community FROM public.profiles WHERE id = p_user_id;

  v_party := CASE
    WHEN p_user_id = v_driver_user THEN 'driver'
    WHEN p_user_id = v_booking.owner_id THEN 'owner'
    WHEN v_role = 'admin' AND v_community = v_booking.community_id THEN 'admin'
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
      cancelled_by = CASE WHEN EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_id)
                          THEN p_user_id ELSE NULL END,
      cancelled_by_party = v_party,
      cancellation_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.parking_cancel_as(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_parking_booking(
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_cancel_as(auth.uid(), p_booking_id, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_parking_booking(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_parking_booking(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.coco_cancel_parking_booking(
  p_user_id UUID,
  p_booking_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_cancel_as(p_user_id, p_booking_id, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_cancel_parking_booking(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_cancel_parking_booking(UUID, UUID, TEXT) TO service_role;

-- ── Bodega ──────────────────────────────────────────────────
-- Anula los cargos de los meses que aún no empiezan y que siguen pendientes. El
-- mes en curso y los ya pagados no se tocan: devolver plata es una decisión de
-- la administración, fuera de esta función.
CREATE OR REPLACE FUNCTION public.storage_cancel_as(
  p_user_id UUID,
  p_rental_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental public.storage_rentals%ROWTYPE;
  v_role TEXT;
  v_community UUID;
  v_current TEXT := to_char((NOW() AT TIME ZONE 'America/Santiago')::date, 'YYYY-MM');
  v_cancelled INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;

  SELECT role, community_id INTO v_role, v_community FROM public.profiles WHERE id = p_user_id;

  SELECT * INTO v_rental FROM public.storage_rentals WHERE id = p_rental_id FOR UPDATE;
  IF v_rental.id IS NULL
     OR v_rental.community_id IS DISTINCT FROM v_community
     OR NOT (v_rental.tenant_id = p_user_id OR v_role = 'admin') THEN
    RAISE EXCEPTION 'Arriendo no encontrado' USING ERRCODE = '42501';
  END IF;
  IF v_rental.status <> 'active' THEN
    RAISE EXCEPTION 'El arriendo ya no está activo' USING ERRCODE = '22023';
  END IF;

  UPDATE public.storage_rentals
  SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = p_user_id,
      cancel_reason = NULLIF(left(btrim(COALESCE(p_reason, '')), 300), '')
  WHERE id = p_rental_id;

  UPDATE public.unit_charges uc
  SET status = 'cancelled'
  FROM public.storage_rental_charges src
  WHERE src.rental_id = p_rental_id
    AND src.unit_charge_id = uc.id
    AND src.period > v_current
    AND uc.status = 'pending';
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;
REVOKE ALL ON FUNCTION public.storage_cancel_as(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancel_storage_rental(
  p_rental_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.storage_cancel_as(auth.uid(), p_rental_id, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.cancel_storage_rental(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_storage_rental(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.coco_cancel_storage_rental(
  p_user_id UUID,
  p_rental_id UUID,
  p_reason TEXT DEFAULT ''
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.storage_cancel_as(p_user_id, p_rental_id, p_reason);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_cancel_storage_rental(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_cancel_storage_rental(UUID, UUID, TEXT) TO service_role;
