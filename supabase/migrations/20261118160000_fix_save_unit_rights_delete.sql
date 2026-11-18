-- Guardar los derechos de las unidades fallaba en producción (18-11-2026):
-- "DELETE requires a WHERE clause". save_unit_rights vacía su tabla temporal con
-- un DELETE sin WHERE y la base lo bloquea (pg_safeupdate). Se redefine igual,
-- con WHERE true. Afectaba a Admin › Asambleas › Derechos, a la carga masiva y a
-- CoCo (set_unit_alicuota, distribute_alicuotas_equally).

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
  IF p_method NOT IN ('manual', 'csv', 'expense_prorate', 'verify', 'onboarding') THEN
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
    DELETE FROM pg_temp._unit_rights_input WHERE true;
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

REVOKE ALL ON FUNCTION public.save_unit_rights(uuid, jsonb, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_unit_rights(uuid, jsonb, text, text, uuid, text) TO service_role;
