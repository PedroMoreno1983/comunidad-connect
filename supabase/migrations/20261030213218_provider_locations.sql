-- Ubicación declarada y geocodificada de proveedores para búsquedas cercanas.
-- Los registros antiguos quedan sin coordenadas: CoCo no presume cercanía.
ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS service_address TEXT,
  ADD COLUMN IF NOT EXISTS service_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS service_longitude NUMERIC(10, 7);

ALTER TABLE public.service_providers
  ADD CONSTRAINT service_providers_coordinates_pair
  CHECK ((service_latitude IS NULL AND service_longitude IS NULL)
      OR (service_latitude IS NOT NULL AND service_longitude IS NOT NULL
          AND service_latitude BETWEEN -90 AND 90 AND service_longitude BETWEEN -180 AND 180));

CREATE INDEX IF NOT EXISTS idx_service_providers_community_coordinates
  ON public.service_providers (community_id, service_latitude, service_longitude)
  WHERE service_latitude IS NOT NULL AND service_longitude IS NOT NULL;
