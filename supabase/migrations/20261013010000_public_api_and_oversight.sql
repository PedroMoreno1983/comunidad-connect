-- API pública de solo lectura y portal del fiscalizador.
-- Ninguna clave ni enlace se guarda en claro: solo su SHA-256. Quien los
-- genera los ve una vez; la base solo puede compararlos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.community_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 80),
  key_prefix text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL CHECK (
    cardinality(scopes) > 0 AND scopes <@ ARRAY['units', 'finance', 'access']::text[]
  ),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS community_api_keys_community_idx
  ON public.community_api_keys (community_id, created_at DESC);
ALTER TABLE public.community_api_keys ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.community_api_keys FROM anon, authenticated;
GRANT ALL ON public.community_api_keys TO service_role;

-- Enlace de solo lectura para un fiscalizador, auditor o comité de vigilancia.
CREATE TABLE IF NOT EXISTS public.oversight_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 120),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  view_count integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS oversight_links_community_idx
  ON public.oversight_links (community_id, created_at DESC);
ALTER TABLE public.oversight_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oversight_links FROM anon, authenticated;
GRANT ALL ON public.oversight_links TO service_role;

COMMIT;
