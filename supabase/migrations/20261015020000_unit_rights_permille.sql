-- Derechos de cada unidad (‰) para votar en asambleas (Ley 21.442, arts. 3 y 15).
--
-- Los votos se ponderan por units.share_permille. Esa proporción la fija el
-- reglamento de copropiedad: suele coincidir con la de gastos comunes, pero no
-- es lo mismo. Esta migración agrega:
--   1. unit_rights_revisions: registro auditable (append-only) de cada carga,
--      con quién, cuándo, la fuente y los valores anteriores. Una carga sin
--      fuente queda "provisoria" (verified = false) hasta que alguien registre
--      la fuente (reglamento, escritura).
--   2. save_unit_rights(): la única vía de carga en lote (solo service_role):
--      valida que estén todas las unidades, que sumen 1000‰ ± 0,5 y que no haya
--      una votación abierta; guarda y deja la revisión en la misma transacción.
--   3. Triggers en units: bloquean cambiar share_permille mientras haya una
--      asamblea en curso con votación abierta (cualquier vía) y registran como
--      "direct" (provisoria) cualquier cambio que no pase por save_unit_rights.
--   4. Los clientes (anon/authenticated) ya no escriben units.share_permille:
--      UPDATE e INSERT quedan por columna sin ella, y sin TRUNCATE.
-- Idempotente.

-- ── 1. Registro auditable ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unit_rights_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  method text NOT NULL CHECK (method IN ('manual', 'csv', 'expense_prorate', 'verify', 'direct')),
  verified boolean NOT NULL DEFAULT false,
  source_note text NOT NULL DEFAULT '' CHECK (char_length(source_note) <= 500),
  previous_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  new_values jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_permille numeric(12, 4),
  units_count integer NOT NULL DEFAULT 0,
  saved_by uuid,
  saved_by_name text NOT NULL DEFAULT '' CHECK (char_length(saved_by_name) <= 160),
  saved_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unit_rights_revisions_verified_has_source CHECK (NOT verified OR char_length(btrim(source_note)) > 0)
);
CREATE INDEX IF NOT EXISTS unit_rights_revisions_community_idx
  ON public.unit_rights_revisions (community_id, saved_at DESC);

COMMENT ON TABLE public.unit_rights_revisions IS
  'Cargas de derechos por unidad (units.share_permille, ‰) para asambleas (Ley 21.442 arts. 3 y 15). Append-only. verified = false: provisoria, sin fuente del reglamento.';

-- Append-only: nadie edita ni borra una revisión.
CREATE OR REPLACE FUNCTION public.unit_rights_revisions_append_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'El registro de derechos no se edita ni se borra.' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS unit_rights_revisions_append_only ON public.unit_rights_revisions;
CREATE TRIGGER unit_rights_revisions_append_only BEFORE UPDATE OR DELETE ON public.unit_rights_revisions
  FOR EACH ROW EXECUTE FUNCTION public.unit_rights_revisions_append_only();

-- ── 2. ¿Hay una votación abierta? ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.unit_rights_open_vote(target_community uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.title FROM public.assemblies a
  JOIN public.assembly_agenda_items i ON i.assembly_id = a.id
  WHERE a.community_id = target_community AND a.status = 'in_progress' AND i.voting_status = 'open'
  ORDER BY a.started_at DESC NULLS LAST
  LIMIT 1;
$$;

-- Bloqueo en la base: cubre la herramienta, el agente CoCo y cualquier otra vía.
CREATE OR REPLACE FUNCTION public.units_share_permille_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE open_title text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.share_permille IS NOT DISTINCT FROM OLD.share_permille THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.share_permille IS NULL THEN RETURN NEW; END IF;
  open_title := public.unit_rights_open_vote(NEW.community_id);
  IF open_title IS NOT NULL THEN
    RAISE EXCEPTION 'Hay una votación abierta en la asamblea "%": los derechos no se cambian hasta cerrarla.', open_title
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS units_share_permille_guard ON public.units;
CREATE TRIGGER units_share_permille_guard BEFORE INSERT OR UPDATE OF share_permille ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.units_share_permille_guard();

-- Todo cambio que no pase por save_unit_rights queda registrado como provisorio.
CREATE OR REPLACE FUNCTION public.units_share_permille_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE actor uuid; actor_name text;
BEGIN
  IF NEW.share_permille IS NOT DISTINCT FROM OLD.share_permille THEN RETURN NEW; END IF;
  IF coalesce(current_setting('app.unit_rights_rpc', true), '') = 'on' THEN RETURN NEW; END IF;
  actor := auth.uid();
  SELECT p.name INTO actor_name FROM public.profiles p WHERE p.id = actor;
  INSERT INTO public.unit_rights_revisions (community_id, method, verified, previous_values, new_values, total_permille, units_count, saved_by, saved_by_name)
  VALUES (
    NEW.community_id, 'direct', false,
    jsonb_build_array(jsonb_build_object('unit_id', NEW.id, 'label', NEW.number, 'permille', OLD.share_permille)),
    jsonb_build_array(jsonb_build_object('unit_id', NEW.id, 'label', NEW.number, 'permille', NEW.share_permille)),
    (SELECT sum(u.share_permille) FROM public.units u WHERE u.community_id = NEW.community_id),
    1, actor, left(coalesce(actor_name, ''), 160)
  );
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS units_share_permille_audit ON public.units;
CREATE TRIGGER units_share_permille_audit AFTER UPDATE OF share_permille ON public.units
  FOR EACH ROW EXECUTE FUNCTION public.units_share_permille_audit();

-- ── 3. Carga en lote (solo el servidor) ─────────────────────────────────────
-- p_values: [{"unit_id": "...", "permille": 123.4567}, ...] con TODAS las unidades.
-- p_method = 'verify': registra la fuente sin cambiar valores (ignora p_values).
CREATE OR REPLACE FUNCTION public.save_unit_rights(
  p_community_id uuid, p_values jsonb, p_method text, p_source_note text, p_saved_by uuid, p_saved_by_name text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  note text := left(btrim(coalesce(p_source_note, '')), 500);
  open_title text;
  prev jsonb;
  next jsonb;
  total numeric;
  n_units integer;
  n_values integer;
  bad text;
  rev public.unit_rights_revisions;
BEGIN
  IF p_method NOT IN ('manual', 'csv', 'expense_prorate', 'verify') THEN
    RAISE EXCEPTION 'Derechos: método no válido.' USING ERRCODE = 'check_violation';
  END IF;
  -- Serializa cargas concurrentes de la comunidad.
  PERFORM 1 FROM public.units WHERE community_id = p_community_id FOR UPDATE;
  open_title := public.unit_rights_open_vote(p_community_id);
  IF open_title IS NOT NULL THEN
    RAISE EXCEPTION 'Hay una votación abierta en la asamblea "%": los derechos no se cambian hasta cerrarla.', open_title
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('unit_id', u.id, 'label', u.number, 'permille', u.share_permille) ORDER BY u.number), '[]'::jsonb), count(*)
    INTO prev, n_units FROM public.units u WHERE u.community_id = p_community_id;
  IF n_units = 0 THEN RAISE EXCEPTION 'Derechos: la comunidad no tiene unidades.' USING ERRCODE = 'check_violation'; END IF;

  IF p_method = 'verify' THEN
    IF char_length(note) = 0 THEN
      RAISE EXCEPTION 'Derechos: para verificar hay que registrar la fuente (reglamento o escritura).' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM public.units WHERE community_id = p_community_id AND (share_permille IS NULL OR share_permille <= 0)) THEN
      RAISE EXCEPTION 'Derechos: hay unidades sin derechos cargados.' USING ERRCODE = 'check_violation';
    END IF;
    SELECT sum(share_permille) INTO total FROM public.units WHERE community_id = p_community_id;
    IF abs(total - 1000) > 0.5 THEN
      RAISE EXCEPTION 'Derechos: suman % ‰ (diferencia % ‰); deben sumar 1000 ‰ ± 0,5.', round(total, 4), round(total - 1000, 4) USING ERRCODE = 'check_violation';
    END IF;
    next := prev;
  ELSE
    IF jsonb_typeof(p_values) <> 'array' THEN RAISE EXCEPTION 'Derechos: formato no válido.' USING ERRCODE = 'check_violation'; END IF;
    CREATE TEMP TABLE IF NOT EXISTS _unit_rights_input (unit_id uuid, permille numeric) ON COMMIT DROP;
    DELETE FROM pg_temp._unit_rights_input;
    INSERT INTO pg_temp._unit_rights_input (unit_id, permille)
      SELECT (e->>'unit_id')::uuid, round((e->>'permille')::numeric, 4) FROM jsonb_array_elements(p_values) e;
    SELECT count(*) INTO n_values FROM pg_temp._unit_rights_input;
    IF EXISTS (SELECT 1 FROM pg_temp._unit_rights_input GROUP BY unit_id HAVING count(*) > 1) THEN
      RAISE EXCEPTION 'Derechos: una unidad viene repetida.' USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_temp._unit_rights_input i WHERE NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = i.unit_id AND u.community_id = p_community_id)) THEN
      RAISE EXCEPTION 'Derechos: hay unidades que no son de esta comunidad.' USING ERRCODE = 'check_violation';
    END IF;
    IF n_values <> n_units THEN
      RAISE EXCEPTION 'Derechos: faltan unidades (% de %).', n_values, n_units USING ERRCODE = 'check_violation';
    END IF;
    SELECT string_agg(u.number, ', ') INTO bad FROM pg_temp._unit_rights_input i JOIN public.units u ON u.id = i.unit_id
      WHERE i.permille IS NULL OR i.permille <= 0 OR i.permille > 1000;
    IF bad IS NOT NULL THEN
      RAISE EXCEPTION 'Derechos: valores no válidos en %.', bad USING ERRCODE = 'check_violation';
    END IF;
    SELECT sum(permille) INTO total FROM pg_temp._unit_rights_input;
    IF abs(total - 1000) > 0.5 THEN
      RAISE EXCEPTION 'Derechos: suman % ‰ (diferencia % ‰); deben sumar 1000 ‰ ± 0,5.', round(total, 4), round(total - 1000, 4) USING ERRCODE = 'check_violation';
    END IF;

    PERFORM set_config('app.unit_rights_rpc', 'on', true);
    UPDATE public.units u SET share_permille = i.permille
      FROM pg_temp._unit_rights_input i WHERE u.id = i.unit_id AND u.community_id = p_community_id;
    PERFORM set_config('app.unit_rights_rpc', '', true);
    SELECT jsonb_agg(jsonb_build_object('unit_id', u.id, 'label', u.number, 'permille', u.share_permille) ORDER BY u.number)
      INTO next FROM public.units u WHERE u.community_id = p_community_id;
  END IF;

  INSERT INTO public.unit_rights_revisions (community_id, method, verified, source_note, previous_values, new_values, total_permille, units_count, saved_by, saved_by_name)
  VALUES (p_community_id, p_method, char_length(note) > 0, note, prev, next, total, n_units, p_saved_by, left(coalesce(p_saved_by_name, ''), 160))
  RETURNING * INTO rev;
  RETURN to_jsonb(rev);
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'unit_rights_open_vote(uuid)', 'units_share_permille_guard()', 'units_share_permille_audit()',
    'unit_rights_revisions_append_only()', 'save_unit_rights(uuid, jsonb, text, text, uuid, text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
  END LOOP;
END $$;
GRANT EXECUTE ON FUNCTION public.save_unit_rights(uuid, jsonb, text, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unit_rights_open_vote(uuid) TO service_role;

-- ── 4. RLS y permisos mínimos ───────────────────────────────────────────────
ALTER TABLE public.unit_rights_revisions ENABLE ROW LEVEL SECURITY;
-- REVOKE ALL (no solo INSERT/UPDATE/DELETE): TRUNCATE ignora el RLS.
REVOKE ALL ON public.unit_rights_revisions FROM anon;
REVOKE ALL ON public.unit_rights_revisions FROM authenticated;
REVOKE ALL ON public.unit_rights_revisions FROM service_role;
GRANT SELECT ON public.unit_rights_revisions TO authenticated;
GRANT SELECT, INSERT ON public.unit_rights_revisions TO service_role;

DROP POLICY IF EXISTS unit_rights_revisions_admin_read ON public.unit_rights_revisions;
CREATE POLICY unit_rights_revisions_admin_read ON public.unit_rights_revisions FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  );

-- units.share_permille: solo por el servidor. El resto de las columnas sigue
-- igual para authenticated (su RLS no cambia). anon no escribe units. Sin TRUNCATE.
DO $$
DECLARE cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position) INTO cols
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'units' AND column_name <> 'share_permille';
  REVOKE INSERT, UPDATE, TRUNCATE ON public.units FROM anon;
  REVOKE INSERT, UPDATE, TRUNCATE ON public.units FROM authenticated;
  REVOKE INSERT (share_permille), UPDATE (share_permille) ON public.units FROM anon, authenticated;
  EXECUTE format('GRANT INSERT (%s) ON public.units TO authenticated', cols);
  EXECUTE format('GRANT UPDATE (%s) ON public.units TO authenticated', cols);
END $$;

COMMENT ON COLUMN public.units.share_permille IS
  'Derechos de la unidad en ‰ (Ley 21.442 arts. 3 y 15; los fija el reglamento de copropiedad). Pondera los votos de asamblea y el prorrateo de gastos comunes con método share. Se carga en /admin/asambleas (save_unit_rights); historial en unit_rights_revisions.';
