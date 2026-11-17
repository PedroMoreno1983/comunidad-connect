-- ============================================================
-- Calificar una reserva de estacionamiento
-- ============================================================
-- El pase de acceso dejaba calificar con estrellas, pero parking_bookings no
-- tenía dónde guardarlo: ParkingService.rateBooking actualizaba columnas que no
-- existen, el error se tragaba con un console.warn y la pantalla igual decía
-- "¡Gracias por calificar!". Nadie guardó nunca una calificación.
--
-- Ahora: columnas en la reserva y una función con las reglas, para la pantalla
-- (auth.uid()) y para CoCo (service_role, con el perfil autenticado). Solo
-- califica el conductor, y solo una reserva que ya terminó. Puede cambiar su
-- calificación después.

ALTER TABLE public.parking_bookings
  ADD COLUMN IF NOT EXISTS rating SMALLINT,
  ADD COLUMN IF NOT EXISTS rating_comment TEXT,
  ADD COLUMN IF NOT EXISTS rated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_bookings_rating_range') THEN
    ALTER TABLE public.parking_bookings
      ADD CONSTRAINT parking_bookings_rating_range CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parking_bookings_rating_comment_length') THEN
    ALTER TABLE public.parking_bookings
      ADD CONSTRAINT parking_bookings_rating_comment_length CHECK (rating_comment IS NULL OR char_length(rating_comment) <= 500);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.parking_rate_as(
  p_user_id UUID,
  p_booking_id UUID,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.parking_bookings%ROWTYPE;
  v_driver_user UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere autenticación' USING ERRCODE = '42501';
  END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'La calificación va de 1 a 5 estrellas' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_booking FROM public.parking_bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN
    RAISE EXCEPTION 'La reserva no existe' USING ERRCODE = '22023';
  END IF;

  SELECT user_id INTO v_driver_user FROM public.parking_drivers WHERE id = v_booking.driver_id;
  IF v_driver_user IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Solo el conductor puede calificar su reserva' USING ERRCODE = '42501';
  END IF;

  IF v_booking.status IN ('cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Esa reserva no se usó: no se puede calificar' USING ERRCODE = '22023';
  END IF;
  IF v_booking.status <> 'completed' AND v_booking.ends_at > NOW() THEN
    RAISE EXCEPTION 'Podrás calificar cuando termine la reserva' USING ERRCODE = '22023';
  END IF;

  UPDATE public.parking_bookings
  SET rating = p_rating,
      rating_comment = NULLIF(left(btrim(COALESCE(p_comment, '')), 500), ''),
      rated_at = NOW()
  WHERE id = p_booking_id;

  RETURN TRUE;
END;
$$;
REVOKE ALL ON FUNCTION public.parking_rate_as(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.rate_parking_booking(
  p_booking_id UUID,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_rate_as(auth.uid(), p_booking_id, p_rating, p_comment);
END;
$$;
REVOKE ALL ON FUNCTION public.rate_parking_booking(UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rate_parking_booking(UUID, INTEGER, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.coco_rate_parking_booking(
  p_user_id UUID,
  p_booking_id UUID,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.parking_rate_as(p_user_id, p_booking_id, p_rating, p_comment);
END;
$$;
REVOKE ALL ON FUNCTION public.coco_rate_parking_booking(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coco_rate_parking_booking(UUID, UUID, INTEGER, TEXT) TO service_role;
