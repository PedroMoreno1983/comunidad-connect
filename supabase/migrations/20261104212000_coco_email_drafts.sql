-- Borradores de correo de CoCo. Un destinatario de la misma comunidad.
-- No borra datos. El cliente no escribe: solo el servidor, después de confirmar.

CREATE TABLE IF NOT EXISTS public.coco_email_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'sent')),
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS coco_email_drafts_community_created
  ON public.coco_email_drafts (community_id, created_at DESC);

ALTER TABLE public.coco_email_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_email_drafts FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_email_drafts TO service_role;
