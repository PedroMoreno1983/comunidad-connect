-- ============================================================
-- Perfil del maestro: foto, fotos de trabajos, documentos y reseñas verificadas
--
-- * Fotos de trabajos (service_provider_photos): públicas para quien ya ve al
--   proveedor (misma visibilidad que service_providers, por RLS). La foto de
--   perfil sigue en service_providers.photo, ahora como URL del bucket
--   provider-media en vez de base64 en la fila.
-- * Documentos (service_provider_documents): certificado de antecedentes y
--   cédula. Son datos sensibles: tabla y bucket solo del servidor. Al subirlos,
--   el sistema los lee y deja un chequeo automático (RUT válido, nombre, fecha,
--   "sin anotaciones"); la administración (o Convive, para la Red) aprueba o
--   rechaza. Al aprobar se marca background_checked_at / identity_checked_at,
--   que es lo único que ven los vecinos.
-- * Reseñas: verified_service marca las que vienen de un servicio completado
--   con ese maestro; service_request_id lo enlaza.
-- ============================================================
BEGIN;

ALTER TABLE public.service_providers
  ADD COLUMN IF NOT EXISTS background_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS identity_checked_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS public.service_provider_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_provider_photos_provider_idx
  ON public.service_provider_photos (provider_id, created_at DESC);

ALTER TABLE public.service_provider_photos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_provider_photos FROM anon, authenticated;
GRANT SELECT ON public.service_provider_photos TO authenticated;
GRANT ALL ON public.service_provider_photos TO service_role;
-- Mismas fotos que proveedores visibles: la subconsulta pasa por la RLS de
-- service_providers (comunidad propia o Red Convive).
DROP POLICY IF EXISTS "service_provider_photos_visible" ON public.service_provider_photos;
CREATE POLICY "service_provider_photos_visible"
  ON public.service_provider_photos
  FOR SELECT
  TO authenticated
  USING (provider_id IN (SELECT id FROM public.service_providers));

CREATE TABLE IF NOT EXISTS public.service_provider_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('background_certificate', 'identity')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  auto_check JSONB NOT NULL DEFAULT '{}'::jsonb,
  issued_on DATE,
  review_note TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  uploaded_via TEXT NOT NULL DEFAULT 'app',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_provider_documents_provider_idx
  ON public.service_provider_documents (provider_id, created_at DESC);

ALTER TABLE public.service_provider_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_provider_documents FROM anon, authenticated;
GRANT ALL ON public.service_provider_documents TO service_role;

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS verified_service BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS service_request_id UUID REFERENCES public.service_requests(id) ON DELETE SET NULL;

-- Las marcas de documentos revisados solo las pone el servidor, al aprobar.
CREATE OR REPLACE FUNCTION public.service_providers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin auth.uid() es el servidor (service role): puede todo.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Mover un maestro entre comunidades o a la red, y marcar sus documentos
  -- como revisados, es solo del servidor.
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.background_checked_at IS DISTINCT FROM OLD.background_checked_at
     OR NEW.identity_checked_at IS DISTINCT FROM OLD.identity_checked_at THEN
    RAISE EXCEPTION 'Ese dato del proveedor lo maneja Convive' USING ERRCODE = '42501';
  END IF;
  IF public.get_my_role() = 'admin' AND OLD.community_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.completed_jobs IS DISTINCT FROM OLD.completed_jobs THEN
    RAISE EXCEPTION 'Verificación, nota y trabajos los maneja la administración' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- Buckets: provider-media público (fotos), provider-documents privado.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('provider-media', 'provider-media', TRUE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES ('provider-documents', 'provider-documents', FALSE, 10485760, ARRAY['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

COMMIT;
