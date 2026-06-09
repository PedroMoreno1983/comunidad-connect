-- Community geocoding metadata for onboarding and future location-aware operations.

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS address_latitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS address_longitude NUMERIC(10, 7),
  ADD COLUMN IF NOT EXISTS address_place_id TEXT,
  ADD COLUMN IF NOT EXISTS address_geocoding_source TEXT;

CREATE INDEX IF NOT EXISTS idx_communities_coordinates
  ON public.communities(address_latitude, address_longitude)
  WHERE address_latitude IS NOT NULL AND address_longitude IS NOT NULL;
