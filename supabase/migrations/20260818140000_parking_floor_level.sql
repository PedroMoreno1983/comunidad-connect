-- Nivel real del estacionamiento dentro del edificio.
--
-- Hasta ahora el plano adivinaba el piso desde el nombre del cupo
-- (label.startsWith('2'), índice par/impar), así que un estacionamiento "205"
-- del subterráneo -1 aparecía dibujado en el -2. El dato lo tiene el dueño al
-- publicar; se guarda en vez de deducirlo.
BEGIN;

ALTER TABLE public.parking_spots
  ADD COLUMN IF NOT EXISTS floor_level TEXT NOT NULL DEFAULT 'S1';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'parking_spots_floor_level_valid'
  ) THEN
    ALTER TABLE public.parking_spots
      ADD CONSTRAINT parking_spots_floor_level_valid
      CHECK (floor_level IN ('S1', 'S2', 'S3', 'PB', 'EXT'));
  END IF;
END $$;

COMMENT ON COLUMN public.parking_spots.floor_level IS
  'Nivel del edificio: S1/S2/S3 subterráneos, PB planta baja, EXT superficie.';

CREATE INDEX IF NOT EXISTS parking_spots_floor_level_idx
  ON public.parking_spots(community_id, floor_level);

-- search_parking_spots suma el nivel a su resultado. El tipo de retorno cambia,
-- y eso CREATE OR REPLACE no lo permite: hay que reemplazar la función.
DROP FUNCTION IF EXISTS public.search_parking_spots(TIMESTAMPTZ, TIMESTAMPTZ, UUID);

CREATE FUNCTION public.search_parking_spots(
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
  floor_level TEXT,
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
    s.floor_level,
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

REVOKE ALL ON FUNCTION public.search_parking_spots(TIMESTAMPTZ, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_parking_spots(TIMESTAMPTZ, TIMESTAMPTZ, UUID) TO authenticated;

COMMIT;
