-- Copropietarios hábiles para votar en asamblea (Ley 21.442, arts. 2 N°13, 6
-- y 15; DS 7 de 2025, arts. 9 y 14). Revisado en bcn.cl el 2026-10-14.
--
--   * Solo los copropietarios hábiles "concurren con su voto" (art. 15). Hábil:
--     al día en toda obligación económica (art. 2 N°13), o con convenio de pago
--     vigente desde el pago de su primera cuota (art. 6; DS 7 art. 9). Quien
--     tiene varias unidades es hábil solo si está al día en todas (DS 7 art. 14).
--   * La calidad se acredita con un certificado "expedido por el administrador
--     o por quien haga sus veces" (art. 15; DS 7 art. 14). Ni la ley ni el DS 7
--     fijan anticipación: la app lo emite en la sesión, con fecha de corte = ese
--     día, antes de abrir la primera votación.
--
-- Dos tablas:
--   assembly_eligibility_certificates: el certificado (fecha de corte, totales
--     de unidades y derechos habilitados, quién lo emitió y cuándo). Lo pueden
--     leer los miembros de la comunidad: son solo totales, van en el acta.
--   assembly_eligibility_units: el detalle por unidad, respaldo legal. RLS: SOLO
--     el admin de la comunidad. Ni el comité ni otros residentes lo ven.
-- Reglas en la base: sin certificado vigente no se abre una votación, y el voto
-- de una unidad no habilitada no se registra.
--
-- Además deja por escrito el REVOKE de TRUNCATE en committee_digests (ya
-- aplicado a mano en producción).
-- Idempotente.

-- ── 1. Certificado ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_eligibility_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  cutoff_date date NOT NULL,
  rights_method text NOT NULL CHECK (rights_method IN ('share', 'equal')),
  total_units integer NOT NULL CHECK (total_units >= 0),
  eligible_units integer NOT NULL CHECK (eligible_units >= 0),
  total_rights numeric(14, 4) NOT NULL CHECK (total_rights >= 0),
  eligible_rights numeric(14, 4) NOT NULL CHECK (eligible_rights >= 0),
  status text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded')),
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_by_name text NOT NULL DEFAULT '' CHECK (char_length(issued_by_name) <= 160),
  issued_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  legal_basis text NOT NULL DEFAULT 'Ley 21.442, arts. 2 N°13, 6 y 15; DS 7 de 2025, arts. 9 y 14',
  CONSTRAINT assembly_eligibility_counts CHECK (eligible_units <= total_units AND eligible_rights <= total_rights),
  CONSTRAINT assembly_eligibility_superseded CHECK ((status = 'superseded') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS assembly_eligibility_one_current
  ON public.assembly_eligibility_certificates (assembly_id) WHERE status = 'current';
CREATE INDEX IF NOT EXISTS assembly_eligibility_by_assembly
  ON public.assembly_eligibility_certificates (assembly_id, issued_at DESC);

-- ── 2. Detalle por unidad (respaldo legal, solo admin) ──────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_eligibility_units (
  certificate_id uuid NOT NULL REFERENCES public.assembly_eligibility_certificates(id) ON DELETE CASCADE,
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  eligible boolean NOT NULL,
  basis text NOT NULL CHECK (basis IN ('up_to_date', 'agreement', 'overdue', 'agreement_lapsed', 'other_unit')),
  weight numeric(14, 4) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (certificate_id, unit_id),
  CONSTRAINT assembly_eligibility_units_basis CHECK (eligible = (basis IN ('up_to_date', 'agreement')))
);
CREATE INDEX IF NOT EXISTS assembly_eligibility_units_by_assembly
  ON public.assembly_eligibility_units (assembly_id, unit_id);

-- ── 3. Reglas ───────────────────────────────────────────────────────────────
-- El certificado se emite con la sesión en curso, antes de abrir la primera
-- votación, y su fecha de corte no puede ser posterior al día de emisión.
CREATE OR REPLACE FUNCTION public.assembly_eligibility_guard_issue()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assemblies a
    WHERE a.id = NEW.assembly_id AND a.community_id = NEW.community_id AND a.status = 'in_progress'
  ) THEN
    RAISE EXCEPTION 'El certificado de habilidad se emite con la sesión en curso.' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.assembly_agenda_items i
    WHERE i.assembly_id = NEW.assembly_id AND i.voting_status <> 'pending'
  ) THEN
    RAISE EXCEPTION 'El certificado de habilidad se emite antes de abrir la primera votación.' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.cutoff_date > (NEW.issued_at AT TIME ZONE 'America/Santiago')::date THEN
    RAISE EXCEPTION 'La fecha de corte del certificado de habilidad no puede ser posterior a su emisión.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_eligibility_issue ON public.assembly_eligibility_certificates;
CREATE TRIGGER assembly_eligibility_issue BEFORE INSERT ON public.assembly_eligibility_certificates
  FOR EACH ROW EXECUTE FUNCTION public.assembly_eligibility_guard_issue();

-- Un certificado emitido no se edita: solo pasa de vigente a reemplazado, y
-- solo antes de la primera votación.
CREATE OR REPLACE FUNCTION public.assembly_eligibility_guard_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.status = 'current' AND NEW.status = 'superseded'
     AND (to_jsonb(NEW) - 'status' - 'superseded_at') = (to_jsonb(OLD) - 'status' - 'superseded_at') THEN
    IF EXISTS (
      SELECT 1 FROM public.assembly_agenda_items i
      WHERE i.assembly_id = OLD.assembly_id AND i.voting_status <> 'pending'
    ) THEN
      RAISE EXCEPTION 'El certificado de habilidad ya no se puede reemplazar: la votación comenzó.' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'El certificado de habilidad emitido no se modifica.' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS assembly_eligibility_immutable ON public.assembly_eligibility_certificates;
CREATE TRIGGER assembly_eligibility_immutable BEFORE UPDATE ON public.assembly_eligibility_certificates
  FOR EACH ROW EXECUTE FUNCTION public.assembly_eligibility_guard_update();

CREATE OR REPLACE FUNCTION public.assembly_eligibility_units_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'El detalle del certificado de habilidad no se modifica.' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS assembly_eligibility_units_immutable ON public.assembly_eligibility_units;
CREATE TRIGGER assembly_eligibility_units_immutable BEFORE UPDATE ON public.assembly_eligibility_units
  FOR EACH ROW EXECUTE FUNCTION public.assembly_eligibility_units_guard();

-- Sin certificado vigente no se abre una votación.
CREATE OR REPLACE FUNCTION public.assembly_guard_open_requires_certificate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.voting_status = 'open' AND OLD.voting_status IS DISTINCT FROM 'open' AND NOT EXISTS (
    SELECT 1 FROM public.assembly_eligibility_certificates c
    WHERE c.assembly_id = NEW.assembly_id AND c.community_id = NEW.community_id AND c.status = 'current'
  ) THEN
    RAISE EXCEPTION 'Antes de abrir la votación hay que emitir el certificado de habilidad.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_items_open_requires_certificate ON public.assembly_agenda_items;
CREATE TRIGGER assembly_items_open_requires_certificate BEFORE UPDATE ON public.assembly_agenda_items
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_open_requires_certificate();

-- El voto de una unidad no habilitada no se registra (art. 15).
CREATE OR REPLACE FUNCTION public.assembly_guard_vote_eligibility()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assembly_eligibility_certificates c
    JOIN public.assembly_eligibility_units u ON u.certificate_id = c.id
    WHERE c.assembly_id = NEW.assembly_id AND c.community_id = NEW.community_id AND c.status = 'current'
      AND u.unit_id = NEW.unit_id AND u.eligible
  ) THEN
    RAISE EXCEPTION 'Voto no registrado: la unidad no figura habilitada en el certificado de habilidad.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_votes_eligible_only ON public.assembly_votes;
CREATE TRIGGER assembly_votes_eligible_only BEFORE INSERT OR UPDATE ON public.assembly_votes
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_vote_eligibility();

-- Las funciones de trigger no se llaman directo.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'assembly_eligibility_guard_issue()', 'assembly_eligibility_guard_update()', 'assembly_eligibility_units_guard()',
    'assembly_guard_open_requires_certificate()', 'assembly_guard_vote_eligibility()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assembly_eligibility_certificates', 'assembly_eligibility_units'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- REVOKE ALL (no solo INSERT/UPDATE/DELETE): TRUNCATE ignora el RLS.
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Totales: los ve la comunidad (van en el panel y en el acta), solo de asambleas ya citadas.
DROP POLICY IF EXISTS assembly_eligibility_certificates_read ON public.assembly_eligibility_certificates;
CREATE POLICY assembly_eligibility_certificates_read ON public.assembly_eligibility_certificates FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND EXISTS (
      SELECT 1 FROM public.assemblies a
      WHERE a.id = assembly_id AND a.community_id = assembly_eligibility_certificates.community_id
        AND (a.status <> 'draft' OR public.current_profile_role() = 'admin')
    )
  );

-- Detalle por unidad: SOLO el admin de la comunidad.
DROP POLICY IF EXISTS assembly_eligibility_units_admin_read ON public.assembly_eligibility_units;
CREATE POLICY assembly_eligibility_units_admin_read ON public.assembly_eligibility_units FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  );

COMMENT ON TABLE public.assembly_eligibility_certificates IS
  'Certificado de habilidad para votar en asamblea (Ley 21.442 art. 15; DS 7 art. 14): solo totales. Escrituras solo por el servidor.';
COMMENT ON TABLE public.assembly_eligibility_units IS
  'Respaldo legal del certificado de habilidad por unidad. RLS: solo el admin de la comunidad. Nunca va en el acta ni en pantallas compartidas.';

-- ── 5. committee_digests: sin TRUNCATE para authenticated ni anon ───────────
-- TRUNCATE ignora el RLS. Ya se revocó a mano en producción; queda por escrito.
DO $$
BEGIN
  IF to_regclass('public.committee_digests') IS NOT NULL THEN
    REVOKE ALL ON public.committee_digests FROM anon;
    REVOKE ALL ON public.committee_digests FROM authenticated;
    GRANT SELECT ON public.committee_digests TO authenticated;
    GRANT ALL ON public.committee_digests TO service_role;
  END IF;
END $$;
