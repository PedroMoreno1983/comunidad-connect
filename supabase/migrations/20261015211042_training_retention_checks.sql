-- Repaso diferido: una respuesta por actividad y por intento certificado.
-- Solo el servidor escribe y consulta esta tabla con service_role; el endpoint
-- valida identidad, comunidad, versión y fecha antes de registrar la respuesta.
CREATE TABLE IF NOT EXISTS public.training_retention_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  module_version integer NOT NULL CHECK (module_version > 0),
  slide_id text NOT NULL,
  answer jsonb NOT NULL,
  is_correct boolean NOT NULL,
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, slide_id)
);

CREATE INDEX IF NOT EXISTS idx_training_retention_community_module
  ON public.training_retention_checks (community_id, module_id, responded_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_retention_user
  ON public.training_retention_checks (user_id, module_id, responded_at DESC);

ALTER TABLE public.training_retention_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.training_retention_checks FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.training_retention_checks TO service_role;
