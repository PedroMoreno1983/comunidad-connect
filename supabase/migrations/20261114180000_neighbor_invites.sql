-- ============================================================
-- Invitaciones entre vecinos por WhatsApp
--
-- Cada residente tiene un enlace personal (/unirse/<código>) para invitar a sus
-- vecinos. El enlace ya trae el edificio: el invitado no busca la dirección.
--
-- * neighbor_invites: un código por persona y edificio. No es una credencial:
--   da acceso solo como vecino SIN validar (modo vecino) hasta que la
--   administración lo valide; nunca liga a una unidad de un edificio
--   administrado. Tabla solo del servidor.
-- * profiles.invited_by: quién invitó a quién (para el premio de vecino
--   fundador y para medir cómo se contagia el edificio).
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.neighbor_invites (
  code TEXT PRIMARY KEY CHECK (code ~ '^[A-Z2-9]{8}$'),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uses INTEGER NOT NULL DEFAULT 0,
  UNIQUE (community_id, inviter_id)
);

ALTER TABLE public.neighbor_invites ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.neighbor_invites FROM anon, authenticated;
GRANT ALL ON public.neighbor_invites TO service_role;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMIT;
