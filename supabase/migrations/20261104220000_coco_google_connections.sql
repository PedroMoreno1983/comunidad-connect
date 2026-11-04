-- Conexión de Google de un administrador. Los tokens van cifrados.
-- No borra datos. El cliente no lee ni escribe esta tabla.

CREATE TABLE IF NOT EXISTS public.coco_google_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  google_email text NOT NULL,
  access_token text NOT NULL,
  refresh_token text,
  scopes text[] NOT NULL DEFAULT '{}',
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

ALTER TABLE public.coco_google_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_google_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_google_connections TO service_role;
