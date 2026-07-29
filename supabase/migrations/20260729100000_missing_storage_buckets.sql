-- Buckets de Storage que el código usa pero que nunca se crearon.
--
-- Verificado contra producción el 2026-07-29: existen avatars, marketing-reels
-- y onboarding-documents, pero faltan marketplace, social-images y
-- marketing-reels-audio. El síntoma visible era "bucket not found" al publicar
-- en el marketplace: ningún residente podía subir una foto de su artículo.
--
-- Los límites son deliberadamente chicos comparados con los de video: son fotos
-- que se suben desde el teléfono, y un tope alto solo sirve para llenar el
-- storage con imágenes sin comprimir.

BEGIN;

-- ── marketplace: fotos de los artículos en venta ────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketplace', 'marketplace', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── social-images: fotos del muro social ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'social-images', 'social-images', true, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── marketing-reels-audio: pistas de audio de los reels ─────────────────────
-- La migración 033 lo declaraba junto a marketing-reels, pero en producción
-- solo quedó el de video.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-reels-audio', 'marketing-reels-audio', true, 524288000,
  ARRAY['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac', 'audio/ogg']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Políticas de acceso ─────────────────────────────────────────────────────
-- Lectura pública: las fotos se muestran en el listado del marketplace y en el
-- muro, que ya están protegidos por el RLS de sus propias tablas. El bucket
-- guarda solo la imagen, no quién puede verla.
DROP POLICY IF EXISTS "marketplace_public_read" ON storage.objects;
CREATE POLICY "marketplace_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketplace');

DROP POLICY IF EXISTS "social_images_public_read" ON storage.objects;
CREATE POLICY "social_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'social-images');

DROP POLICY IF EXISTS "marketing_reels_audio_public_read" ON storage.objects;
CREATE POLICY "marketing_reels_audio_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'marketing-reels-audio');

-- Escritura: cada usuario solo puede escribir dentro de su propia carpeta.
-- El código sube a `${user.id}/archivo`, así que el primer segmento del path
-- tiene que ser su uid; sin esto, cualquier autenticado podría sobrescribir
-- las fotos de otro.
DROP POLICY IF EXISTS "marketplace_own_folder_write" ON storage.objects;
CREATE POLICY "marketplace_own_folder_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketplace'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "marketplace_own_folder_delete" ON storage.objects;
CREATE POLICY "marketplace_own_folder_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketplace'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- El muro sube a `posts/${user.id}/archivo`, así que el uid es el SEGUNDO
-- segmento, no el primero.
DROP POLICY IF EXISTS "social_images_own_folder_write" ON storage.objects;
CREATE POLICY "social_images_own_folder_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'social-images'
    AND (storage.foldername(name))[1] = 'posts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "social_images_own_folder_delete" ON storage.objects;
CREATE POLICY "social_images_own_folder_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'social-images'
    AND (storage.foldername(name))[1] = 'posts'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- El audio de los reels lo sube el backend con service_role, no el cliente.
DROP POLICY IF EXISTS "marketing_reels_audio_service_write" ON storage.objects;
CREATE POLICY "marketing_reels_audio_service_write" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'marketing-reels-audio')
  WITH CHECK (bucket_id = 'marketing-reels-audio');

COMMIT;
