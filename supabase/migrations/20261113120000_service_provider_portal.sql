-- ============================================================
-- Portal del maestro externo y protección del perfil de proveedor
--
-- Un maestro de afuera (gasfiter, electricista) no tiene cuenta en Convive:
-- la administración lo registra como proveedor externo. Hasta ahora no podía
-- corregir su perfil ni responder las solicitudes; todo pasaba por la
-- administración. La administración le envía un enlace secreto con
-- vencimiento, igual que el portal del fiscalizador (oversight_links): con él
-- edita su perfil y acepta, reagenda o cierra sus solicitudes. Se guarda solo
-- el hash del token; la tabla es solo del servidor.
--
-- Además: la política de UPDATE deja que el dueño edite su fila desde el
-- navegador, y nada impedía que se marcara verificado o se subiera la nota.
-- service_providers_guard reserva esos campos para la administración y el
-- servidor.
-- ============================================================
BEGIN;

CREATE TABLE IF NOT EXISTS public.service_provider_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT service_provider_links_expiry_check CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS service_provider_links_provider_idx
  ON public.service_provider_links (provider_id, created_at DESC);

ALTER TABLE public.service_provider_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.service_provider_links FROM anon, authenticated;
GRANT ALL ON public.service_provider_links TO service_role;

CREATE OR REPLACE FUNCTION public.service_providers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin auth.uid() es el servidor (service role); la administración puede todo.
  IF auth.uid() IS NULL OR public.get_my_role() = 'admin' THEN
    RETURN NEW;
  END IF;
  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.completed_jobs IS DISTINCT FROM OLD.completed_jobs
     OR NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Verificación, nota y trabajos los maneja la administración' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_providers_guard ON public.service_providers;
CREATE TRIGGER service_providers_guard
BEFORE UPDATE ON public.service_providers
FOR EACH ROW EXECUTE FUNCTION public.service_providers_guard();

COMMIT;
