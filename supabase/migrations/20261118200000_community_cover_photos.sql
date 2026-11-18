-- Foto de portada del condominio (18-11-2026).
--
-- La portada del inicio (administración y residentes) leía
-- communities.cover_photo_url, pero nadie podía cambiarla: todos veían la
-- misma foto genérica de un edificio. La administración la sube desde el
-- inicio o se la pasa a CoCo por el chat.
--
-- Bucket público: es la foto de la fachada o del jardín, la ve toda la
-- comunidad y next/image la sirve sin firmar. Solo escribe el servidor
-- (service_role), que valida que quien sube sea admin de esa comunidad.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('community-covers', 'community-covers', true, 8388608, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
