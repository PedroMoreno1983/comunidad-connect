-- Archivos que CoCo manda por WhatsApp (borradores). Caducan solos.
-- No borra datos existentes. Nadie del cliente los lee: solo el servidor,
-- y Twilio con una firma que vence.

CREATE TABLE IF NOT EXISTS public.coco_outbound_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  filename text NOT NULL,
  content_type text NOT NULL,
  body text NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coco_outbound_media_filename_len CHECK (char_length(filename) BETWEEN 1 AND 120),
  CONSTRAINT coco_outbound_media_type_len CHECK (char_length(content_type) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS coco_outbound_media_expires
  ON public.coco_outbound_media (expires_at);

ALTER TABLE public.coco_outbound_media ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_outbound_media FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_outbound_media TO service_role;
