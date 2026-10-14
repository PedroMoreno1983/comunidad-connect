-- Asambleas de copropietarios en línea según la Ley 21.442 y su reglamento
-- (DS 7 de 2025). Sesiones ordinarias, extraordinarias y de mayoría reforzada;
-- presenciales, telemáticas o mixtas; asistencia por unidad con verificación
-- de imagen y voz; poderes; votos ponderados por derechos y acta.
--
-- Los derechos de cada unidad salen de units.share_permille (alícuota de
-- gastos comunes, migración 20260728140000). Si falta en alguna unidad, la
-- app cuenta 1 unidad = 1 voto y lo advierte al admin. Al iniciar la sesión
-- se guarda una foto de los derechos en assemblies.rights_snapshot.
--
-- Escrituras: solo el servidor (service_role). Lectura multi-tenant por RLS:
--   admin de la comunidad: todo.
--   comité vigente (is_active_committee_member): todo, en solo lectura.
--   residente: asambleas ya citadas, y solo la asistencia, votos y poderes de
--   sus propias unidades; el acta cuando está firmada.
-- Idempotente.

-- ── 1. Asambleas ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assemblies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  session_type text NOT NULL CHECK (session_type IN ('ordinary', 'extraordinary', 'reinforced')),
  modality text NOT NULL CHECK (modality IN ('in_person', 'remote', 'hybrid')),
  scheduled_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '' CHECK (char_length(location) <= 300),
  video_url text NOT NULL DEFAULT '' CHECK (char_length(video_url) <= 500),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'cited', 'in_progress', 'closed', 'minutes_signed', 'cancelled')),
  citation_text text NOT NULL DEFAULT '' CHECK (char_length(citation_text) <= 12000),
  citation_source text CHECK (citation_source IN ('ai', 'fallback', 'manual')),
  cited_at timestamptz,
  citation_date date,
  -- Petición de extraordinaria por copropietarios (art. 14; DS 7 art. 15).
  request_received_on date,
  request_rights_share numeric(7, 6) CHECK (request_rights_share IS NULL OR (request_rights_share >= 0 AND request_rights_share <= 1)),
  secretary_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notary_required boolean NOT NULL DEFAULT false,
  notary_name text NOT NULL DEFAULT '' CHECK (char_length(notary_name) <= 160),
  rights_method text CHECK (rights_method IN ('share', 'equal')),
  rights_snapshot jsonb,
  rights_total numeric(14, 4),
  started_at timestamptz,
  closed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assemblies_link_for_online CHECK (
    status IN ('draft', 'cancelled') OR modality = 'in_person' OR char_length(video_url) > 0
  ),
  CONSTRAINT assemblies_cited_has_text CHECK (
    status IN ('draft', 'cancelled') OR (cited_at IS NOT NULL AND char_length(citation_text) > 0)
  )
);
CREATE INDEX IF NOT EXISTS assemblies_by_community ON public.assemblies (community_id, scheduled_at DESC);

-- ── 2. Tabla (puntos) ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 50),
  matter_code text NOT NULL CHECK (char_length(matter_code) BETWEEN 3 AND 60),
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 200),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 2000),
  quorum_class text NOT NULL CHECK (quorum_class IN ('ordinary', 'absolute', 'reinforced')),
  requires_notary boolean NOT NULL DEFAULT false,
  voting_status text NOT NULL DEFAULT 'pending' CHECK (voting_status IN ('pending', 'open', 'closed')),
  opened_at timestamptz,
  closed_at timestamptz,
  outcome text CHECK (outcome IN ('approved', 'rejected', 'no_quorum')),
  result jsonb,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_agenda_items_position UNIQUE (assembly_id, position),
  CONSTRAINT assembly_agenda_items_closed_has_result CHECK (voting_status <> 'closed' OR (outcome IS NOT NULL AND result IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS assembly_agenda_items_by_assembly ON public.assembly_agenda_items (assembly_id, position);

-- ── 3. Poderes y representación (DS 7, arts. 11 y 12) ───────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_proxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  -- proxy: poder a otra persona. occupant_authorization: autorización expresa
  -- al arrendatario u ocupante (necesaria en materias reforzadas). occupant_opt_out:
  -- el copropietario no otorga la representación legal al ocupante.
  kind text NOT NULL DEFAULT 'proxy' CHECK (kind IN ('proxy', 'occupant_authorization', 'occupant_opt_out')),
  grantor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proxy_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  proxy_name text NOT NULL DEFAULT '' CHECK (char_length(proxy_name) <= 160),
  covers_reinforced boolean NOT NULL DEFAULT false,
  document_note text NOT NULL DEFAULT '' CHECK (char_length(document_note) <= 500),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'revoked')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_proxies_has_representative CHECK (
    kind = 'occupant_opt_out' OR proxy_profile_id IS NOT NULL OR char_length(proxy_name) > 0
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS assembly_proxies_one_accepted
  ON public.assembly_proxies (assembly_id, unit_id, kind) WHERE status = 'accepted';
CREATE INDEX IF NOT EXISTS assembly_proxies_by_assembly ON public.assembly_proxies (assembly_id);

-- ── 4. Asistencia por unidad ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  unit_label text NOT NULL DEFAULT '',
  weight numeric(12, 4) NOT NULL DEFAULT 0 CHECK (weight >= 0),
  attendee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attendee_name text NOT NULL DEFAULT '' CHECK (char_length(attendee_name) <= 160),
  capacity text NOT NULL DEFAULT 'owner' CHECK (capacity IN ('owner', 'proxy', 'occupant')),
  proxy_id uuid REFERENCES public.assembly_proxies(id) ON DELETE SET NULL,
  mode text NOT NULL DEFAULT 'in_person' CHECK (mode IN ('in_person', 'remote')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'present', 'left')),
  rsvp_at timestamptz,
  checked_in_at timestamptz,
  -- Imagen y voz (telemática) o acreditación en sala, marcada por secretaría
  -- o administración (DS 7, art. 16 N°3).
  identity_verified_at timestamptz,
  identity_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  left_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_attendance_one_per_unit UNIQUE (assembly_id, unit_id),
  CONSTRAINT assembly_attendance_proxy_needs_poder CHECK (capacity <> 'proxy' OR proxy_id IS NOT NULL),
  CONSTRAINT assembly_attendance_verified_by CHECK (identity_verified_at IS NULL OR identity_verified_by IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS assembly_attendance_by_assembly ON public.assembly_attendance (assembly_id);

-- ── 5. Votos ponderados ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL REFERENCES public.assemblies(id) ON DELETE CASCADE,
  agenda_item_id uuid NOT NULL REFERENCES public.assembly_agenda_items(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id uuid NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  attendance_id uuid NOT NULL REFERENCES public.assembly_attendance(id) ON DELETE CASCADE,
  choice text NOT NULL CHECK (choice IN ('yes', 'no', 'abstain')),
  weight numeric(12, 4) NOT NULL CHECK (weight >= 0),
  mode text NOT NULL CHECK (mode IN ('in_person', 'remote')),
  cast_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  recorded_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  identity_verified_at timestamptz,
  identity_verified_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_votes_one_per_unit UNIQUE (agenda_item_id, unit_id)
);
CREATE INDEX IF NOT EXISTS assembly_votes_by_item ON public.assembly_votes (agenda_item_id);

-- ── 6. Acta ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.assembly_minutes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assembly_id uuid NOT NULL UNIQUE REFERENCES public.assemblies(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 40000),
  generated_content text NOT NULL CHECK (char_length(generated_content) BETWEEN 1 AND 40000),
  source text NOT NULL DEFAULT 'fallback' CHECK (source IN ('ai', 'fallback', 'manual')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'signed')),
  -- Firma a más tardar dentro de 30 días del acuerdo (art. 15).
  due_on date NOT NULL,
  signers text NOT NULL DEFAULT '' CHECK (char_length(signers) <= 1000),
  signed_at timestamptz,
  signed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assembly_minutes_signed CHECK (status <> 'signed' OR (signed_at IS NOT NULL AND signed_by IS NOT NULL AND char_length(signers) > 0))
);

-- ── 7. Integridad ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assemblies_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assemblies', 'assembly_agenda_items', 'assembly_proxies', 'assembly_attendance', 'assembly_votes', 'assembly_minutes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_touch', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.assemblies_touch_updated_at()', t || '_touch', t);
  END LOOP;
END $$;

-- El administrador no puede representar a ningún copropietario (Ley 21.442,
-- art. 15; DS 7, art. 22). Sí puede asistir como titular de su propia unidad.
CREATE OR REPLACE FUNCTION public.assembly_guard_admin_representation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE representative uuid;
BEGIN
  IF TG_TABLE_NAME = 'assembly_proxies' THEN
    IF NEW.kind = 'occupant_opt_out' OR NEW.status IN ('rejected', 'revoked') THEN RETURN NEW; END IF;
    representative := NEW.proxy_profile_id;
  ELSE
    IF NEW.capacity = 'owner' THEN RETURN NEW; END IF;
    representative := NEW.attendee_profile_id;
  END IF;
  IF representative IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.profiles WHERE id = representative AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'El administrador no puede representar a copropietarios en la asamblea (Ley 21.442, art. 15).'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS assembly_proxies_no_admin ON public.assembly_proxies;
CREATE TRIGGER assembly_proxies_no_admin BEFORE INSERT OR UPDATE ON public.assembly_proxies
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_admin_representation();
DROP TRIGGER IF EXISTS assembly_attendance_no_admin ON public.assembly_attendance;
CREATE TRIGGER assembly_attendance_no_admin BEFORE INSERT OR UPDATE ON public.assembly_attendance
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_admin_representation();

-- Solo se vota con la sesión en curso y el punto abierto.
CREATE OR REPLACE FUNCTION public.assembly_guard_vote()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.assembly_agenda_items i
    JOIN public.assemblies a ON a.id = i.assembly_id
    WHERE i.id = NEW.agenda_item_id AND i.assembly_id = NEW.assembly_id
      AND a.community_id = NEW.community_id
      AND a.status = 'in_progress' AND i.voting_status = 'open'
  ) THEN
    RAISE EXCEPTION 'La votación de este punto no está abierta.' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_votes_open_only ON public.assembly_votes;
CREATE TRIGGER assembly_votes_open_only BEFORE INSERT OR UPDATE ON public.assembly_votes
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_vote();

-- Un acta firmada no se edita.
CREATE OR REPLACE FUNCTION public.assembly_guard_signed_minutes()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'signed' THEN
    RAISE EXCEPTION 'El acta ya está firmada y no se puede modificar.' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS assembly_minutes_immutable ON public.assembly_minutes;
CREATE TRIGGER assembly_minutes_immutable BEFORE UPDATE OR DELETE ON public.assembly_minutes
  FOR EACH ROW EXECUTE FUNCTION public.assembly_guard_signed_minutes();

-- ── 8. RLS ──────────────────────────────────────────────────────────────────
-- ¿La unidad es mía? (titular, residente vinculado u ocupante). SECURITY DEFINER
-- para no depender del RLS de units/profiles dentro de la política.
CREATE OR REPLACE FUNCTION public.assembly_unit_is_mine(target_unit uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.units u
    WHERE u.id = target_unit
      AND u.community_id = public.current_profile_community_id()
      AND (u.owner_id = auth.uid() OR u.resident_profile_id = auth.uid())
  ) OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.unit_id = target_unit::text
  );
$$;
REVOKE ALL ON FUNCTION public.assembly_unit_is_mine(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assembly_unit_is_mine(uuid) TO authenticated, service_role;

-- Vista amplia: admin de la comunidad o integrante vigente del comité.
CREATE OR REPLACE FUNCTION public.assembly_can_oversee(target_community uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT target_community = public.current_profile_community_id()
    AND (public.current_profile_role() = 'admin' OR public.is_active_committee_member(target_community));
$$;
REVOKE ALL ON FUNCTION public.assembly_can_oversee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assembly_can_oversee(uuid) TO authenticated, service_role;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['assemblies', 'assembly_agenda_items', 'assembly_proxies', 'assembly_attendance', 'assembly_votes', 'assembly_minutes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    -- REVOKE ALL (no solo INSERT/UPDATE/DELETE): TRUNCATE ignora el RLS.
    EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS assemblies_read ON public.assemblies;
CREATE POLICY assemblies_read ON public.assemblies FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND (status <> 'draft' OR public.current_profile_role() = 'admin')
  );

DROP POLICY IF EXISTS assembly_agenda_items_read ON public.assembly_agenda_items;
CREATE POLICY assembly_agenda_items_read ON public.assembly_agenda_items FOR SELECT TO authenticated
  USING (
    community_id = public.current_profile_community_id()
    AND EXISTS (
      SELECT 1 FROM public.assemblies a
      WHERE a.id = assembly_id AND a.community_id = assembly_agenda_items.community_id
        AND (a.status <> 'draft' OR public.current_profile_role() = 'admin')
    )
  );

DROP POLICY IF EXISTS assembly_proxies_read ON public.assembly_proxies;
CREATE POLICY assembly_proxies_read ON public.assembly_proxies FOR SELECT TO authenticated
  USING (
    public.assembly_can_oversee(community_id)
    OR (community_id = public.current_profile_community_id()
        AND (grantor_profile_id = auth.uid() OR proxy_profile_id = auth.uid() OR public.assembly_unit_is_mine(unit_id)))
  );

DROP POLICY IF EXISTS assembly_attendance_read ON public.assembly_attendance;
CREATE POLICY assembly_attendance_read ON public.assembly_attendance FOR SELECT TO authenticated
  USING (
    public.assembly_can_oversee(community_id)
    OR (community_id = public.current_profile_community_id()
        AND (attendee_profile_id = auth.uid() OR public.assembly_unit_is_mine(unit_id)))
  );

DROP POLICY IF EXISTS assembly_votes_read ON public.assembly_votes;
CREATE POLICY assembly_votes_read ON public.assembly_votes FOR SELECT TO authenticated
  USING (
    public.assembly_can_oversee(community_id)
    OR (community_id = public.current_profile_community_id()
        AND (cast_by_profile_id = auth.uid() OR public.assembly_unit_is_mine(unit_id)))
  );

DROP POLICY IF EXISTS assembly_minutes_read ON public.assembly_minutes;
CREATE POLICY assembly_minutes_read ON public.assembly_minutes FOR SELECT TO authenticated
  USING (
    public.assembly_can_oversee(community_id)
    OR (community_id = public.current_profile_community_id() AND status = 'signed')
  );

COMMENT ON TABLE public.assemblies IS
  'Asambleas de copropietarios (Ley 21.442 y DS 7 de 2025). Escrituras solo por el servidor; ver src/lib/assemblies.';
