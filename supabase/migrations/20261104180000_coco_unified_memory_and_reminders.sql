-- Memoria unificada de CoCo y recordatorios del chat.
--
-- Los hechos durables no abren otra tabla: se guardan en agent_memories con
-- scope user | community. coco_user_memory se copia y la app lo sigue
-- escribiendo, para no cortar a quien ya lo leía.
--
-- Los recordatorios son reglas de agent_trigger_rules (señal coco_reminder).
-- El scheduler de siempre las entrega cuando next_run_at ya llegó. Puede haber
-- varias por comunidad, así que el único (community_id, signal_key) no aplica
-- a esta señal.

ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'user';

ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

ALTER TABLE public.agent_memories
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_memories_scope_check') THEN
    ALTER TABLE public.agent_memories
      ADD CONSTRAINT agent_memories_scope_check CHECK (scope IN ('user', 'community'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_memories_category_check') THEN
    ALTER TABLE public.agent_memories
      ADD CONSTRAINT agent_memories_category_check CHECK (
        category IN ('general', 'preferencia', 'reglamento', 'proveedor', 'acuerdo')
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agent_memories_scope_category_check') THEN
    ALTER TABLE public.agent_memories
      ADD CONSTRAINT agent_memories_scope_category_check CHECK (
        (scope = 'user' AND category IN ('preferencia', 'general'))
        OR (scope = 'community' AND category IN ('reglamento', 'proveedor', 'acuerdo', 'general'))
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_memories_coco_facts
  ON public.agent_memories (condominio_id, scope, user_id);

-- La memoria de la comunidad solo la escribe un admin de esa comunidad.
-- service_role (el servidor, después de revisar el rol) y postgres pueden.
CREATE OR REPLACE FUNCTION public.enforce_agent_memory_scope()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  row_scope text := CASE WHEN TG_OP = 'DELETE' THEN OLD.scope ELSE NEW.scope END;
  row_community uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.condominio_id ELSE NEW.condominio_id END;
  row_user uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
BEGIN
  IF row_scope IS DISTINCT FROM 'community' THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF auth.role() = 'service_role' OR current_user IN ('postgres', 'supabase_admin') THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  IF public.current_profile_role() = 'admin'
     AND public.current_profile_community_id() = row_community
     AND row_user = auth.uid() THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Solo la administracion puede escribir la memoria de la comunidad';
END;
$$;

DROP TRIGGER IF EXISTS trg_agent_memory_scope ON public.agent_memories;
CREATE TRIGGER trg_agent_memory_scope
  BEFORE INSERT OR UPDATE OR DELETE ON public.agent_memories
  FOR EACH ROW EXECUTE FUNCTION public.enforce_agent_memory_scope();

REVOKE ALL ON FUNCTION public.enforce_agent_memory_scope() FROM PUBLIC, anon, authenticated;

ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.agent_memories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_memories TO authenticated;
GRANT ALL ON public.agent_memories TO service_role;

DROP POLICY IF EXISTS agent_memories_select_community ON public.agent_memories;
CREATE POLICY agent_memories_select_community ON public.agent_memories
  FOR SELECT TO authenticated
  USING (
    condominio_id = public.current_profile_community_id()
    AND (
      (scope = 'user' AND user_id = auth.uid())
      OR scope = 'community'
    )
  );

DROP POLICY IF EXISTS agent_memories_write_own ON public.agent_memories;
CREATE POLICY agent_memories_write_own ON public.agent_memories
  FOR ALL TO authenticated
  USING (
    scope = 'user'
    AND user_id = auth.uid()
    AND condominio_id = public.current_profile_community_id()
  )
  WITH CHECK (
    scope = 'user'
    AND user_id = auth.uid()
    AND condominio_id = public.current_profile_community_id()
    AND category IN ('preferencia', 'general')
  );

DROP POLICY IF EXISTS agent_memories_admin_community_write ON public.agent_memories;
CREATE POLICY agent_memories_admin_community_write ON public.agent_memories
  FOR ALL TO authenticated
  USING (
    scope = 'community'
    AND condominio_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  )
  WITH CHECK (
    scope = 'community'
    AND user_id = auth.uid()
    AND condominio_id = public.current_profile_community_id()
    AND public.current_profile_role() = 'admin'
  );

-- Copia los hechos que ya estaban en coco_user_memory. Idempotente.
INSERT INTO public.agent_memories (
  condominio_id, user_id, role, content, importance, metadata, scope, category, created_at, updated_at
)
SELECT
  src.community_id,
  src.user_id,
  LEFT(COALESCE(src.role, 'resident'), 50),
  src.fact,
  0.5,
  jsonb_build_object('kind', 'coco_fact', 'source', 'coco_user_memory', 'position', src.position),
  'user',
  'preferencia',
  src.updated_at,
  src.updated_at
FROM (
  SELECT
    ranked.community_id,
    ranked.user_id,
    ranked.role,
    ranked.fact,
    (ROW_NUMBER() OVER (PARTITION BY ranked.user_id ORDER BY ranked.ord) - 1)::int AS position,
    ranked.updated_at
  FROM (
    SELECT DISTINCT ON (m.user_id, lower(btrim(fact.value)))
      COALESCE(m.community_id, p.community_id) AS community_id,
      m.user_id,
      p.role,
      LEFT(btrim(fact.value), 240) AS fact,
      fact.ord,
      m.updated_at
    FROM public.coco_user_memory m
    JOIN public.profiles p ON p.id = m.user_id
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(m.facts) = 'array' THEN m.facts ELSE '[]'::jsonb END
    ) WITH ORDINALITY AS fact(value, ord)
    WHERE COALESCE(m.community_id, p.community_id) IS NOT NULL
      AND btrim(fact.value) <> ''
    ORDER BY m.user_id, lower(btrim(fact.value)), fact.ord DESC
  ) ranked
) src
WHERE src.position < 20
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_memories existing
    WHERE existing.user_id = src.user_id
      AND existing.scope = 'user'
      AND existing.metadata->>'kind' = 'coco_fact'
      AND lower(btrim(existing.content)) = lower(src.fact)
  );

-- Varios recordatorios por comunidad. El resto de las señales sigue siendo una por comunidad.
ALTER TABLE public.agent_trigger_rules DROP CONSTRAINT IF EXISTS agent_trigger_rules_signal_key_check;
ALTER TABLE public.agent_trigger_rules
  ADD CONSTRAINT agent_trigger_rules_signal_key_check
  CHECK (signal_key = ANY (ARRAY[
    'overdue_expenses',
    'maintenance_backlog',
    'onboarding_gap',
    'emergency_readiness',
    'coco_reminder'
  ]));

ALTER TABLE public.agent_trigger_rules DROP CONSTRAINT IF EXISTS agent_trigger_rules_community_id_signal_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS agent_trigger_rules_community_signal_unique
  ON public.agent_trigger_rules (community_id, signal_key)
  WHERE signal_key <> 'coco_reminder';
