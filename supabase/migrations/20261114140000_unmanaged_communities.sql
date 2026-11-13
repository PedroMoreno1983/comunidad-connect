-- ============================================================
-- Comunidades "sin administrar": entrada por residente
-- (diseño: docs/comercial/entrada-por-residente.md)
--
-- Un residente cuyo edificio no usa Convive se registra con la dirección. Si
-- el edificio no existe, se crea una comunidad con managed = false; los
-- siguientes vecinos de esa dirección se suman a ella. Ahí funciona el "modo
-- vecino" (CoCo, supermercado, marketplace, Red Convive...) pero no lo que es
-- de la administración (gastos comunes, reservas, avisos oficiales).
--
-- * managed: false mientras ninguna administración tomó el edificio.
-- * claimed_at: cuando una administración lo tomó (fase 4).
-- * created_by_resident: quién lo creó.
-- * profiles.residence_verified: false para quien entra sin código; la
--   administración lo valida al tomar el edificio.
--
-- Nadie fuera del servidor cambia managed, claimed_at ni residence_verified
-- (la administración de una comunidad administrada sí puede validar vecinos).
-- ============================================================
BEGIN;

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by_resident UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Una comunidad sin administrar por lugar geocodificado.
CREATE UNIQUE INDEX IF NOT EXISTS communities_unmanaged_place_idx
  ON public.communities (address_place_id)
  WHERE managed = FALSE AND address_place_id IS NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS residence_verified BOOLEAN NOT NULL DEFAULT TRUE;

CREATE OR REPLACE FUNCTION public.communities_managed_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.managed IS DISTINCT FROM OLD.managed
     OR NEW.claimed_at IS DISTINCT FROM OLD.claimed_at
     OR NEW.created_by_resident IS DISTINCT FROM OLD.created_by_resident THEN
    RAISE EXCEPTION 'El estado de la comunidad lo maneja Convive' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS communities_managed_guard ON public.communities;
CREATE TRIGGER communities_managed_guard
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.communities_managed_guard();

CREATE OR REPLACE FUNCTION public.profiles_residence_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NEW.residence_verified IS NOT DISTINCT FROM OLD.residence_verified THEN
    RETURN NEW;
  END IF;
  -- Solo la administración de una comunidad administrada valida a sus vecinos.
  IF public.get_my_role() = 'admin'
     AND OLD.community_id = public.get_my_community_id()
     AND EXISTS (SELECT 1 FROM public.communities c WHERE c.id = OLD.community_id AND c.managed) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'La validación de residencia la hace la administración' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS profiles_residence_guard ON public.profiles;
CREATE TRIGGER profiles_residence_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_residence_guard();

COMMIT;
