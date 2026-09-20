-- Professional learning operations for administrators and concierge staff.
-- Adds immutable course versions, assignments, auditable attempts/responses,
-- downloadable certificates and an origin-bound completion bridge for embeds.

BEGIN;

ALTER TABLE public.training_modules
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quality_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completion_mode text NOT NULL DEFAULT 'interactive',
  ADD COLUMN IF NOT EXISTS embed_allowed_origin text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.training_modules
SET completion_mode = CASE WHEN embed_url IS NULL THEN 'interactive' ELSE 'embed_manual' END,
    embed_allowed_origin = CASE
      WHEN embed_url ~ '^https://[^/]+' THEN substring(embed_url from '^https://[^/]+')
      ELSE NULL
    END
WHERE completion_mode = 'interactive';

ALTER TABLE public.training_modules DROP CONSTRAINT IF EXISTS training_modules_version_number_check;
ALTER TABLE public.training_modules ADD CONSTRAINT training_modules_version_number_check CHECK (version_number > 0);
ALTER TABLE public.training_modules DROP CONSTRAINT IF EXISTS training_modules_quality_score_check;
ALTER TABLE public.training_modules ADD CONSTRAINT training_modules_quality_score_check CHECK (quality_score BETWEEN 0 AND 100);
ALTER TABLE public.training_modules DROP CONSTRAINT IF EXISTS training_modules_completion_mode_check;
ALTER TABLE public.training_modules ADD CONSTRAINT training_modules_completion_mode_check
  CHECK (completion_mode IN ('interactive', 'embed_post_message', 'embed_manual'));
ALTER TABLE public.training_modules DROP CONSTRAINT IF EXISTS training_modules_embed_completion_check;
ALTER TABLE public.training_modules ADD CONSTRAINT training_modules_embed_completion_check
  CHECK (
    completion_mode NOT IN ('embed_post_message', 'embed_manual')
    OR (embed_url IS NOT NULL AND embed_allowed_origin IS NOT NULL)
  );

CREATE TABLE IF NOT EXISTS public.training_module_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id),
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  title text NOT NULL,
  description text NOT NULL,
  target_audience text NOT NULL CHECK (target_audience IN ('admin', 'concierge', 'all')),
  lesson_title text NOT NULL,
  lesson_content text NOT NULL,
  embed_url text,
  completion_mode text NOT NULL CHECK (completion_mode IN ('interactive', 'embed_post_message', 'embed_manual')),
  embed_allowed_origin text,
  learning_objectives jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_minutes integer NOT NULL CHECK (estimated_minutes BETWEEN 5 AND 480),
  quality_score integer NOT NULL CHECK (quality_score BETWEEN 0 AND 100),
  change_summary text NOT NULL DEFAULT 'Publicación inicial',
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.training_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  module_version integer NOT NULL CHECK (module_version > 0),
  mandatory boolean NOT NULL DEFAULT true,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, user_id, module_version)
);

CREATE TABLE IF NOT EXISTS public.training_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES public.training_modules(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.training_assignments(id) ON DELETE SET NULL,
  module_version integer NOT NULL CHECK (module_version > 0),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  score numeric(5,2) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  passed boolean,
  completion_source text NOT NULL DEFAULT 'interactive' CHECK (completion_source IN ('interactive', 'embed_post_message', 'legacy')),
  embed_nonce uuid NOT NULL DEFAULT gen_random_uuid(),
  completion_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id, module_version, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.training_activity_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.training_attempts(id) ON DELETE CASCADE,
  slide_id text NOT NULL,
  activity_type text NOT NULL CHECK (activity_type IN ('knowledge_check', 'scenario', 'checklist')),
  response_number integer NOT NULL CHECK (response_number > 0),
  answer jsonb NOT NULL,
  is_correct boolean NOT NULL,
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  responded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, slide_id, response_number)
);

CREATE TABLE IF NOT EXISTS public.training_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.training_attempts(id),
  module_id uuid NOT NULL REFERENCES public.training_modules(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  certificate_number text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_training_versions_module ON public.training_module_versions(module_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_training_versions_community ON public.training_module_versions(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_assignments_user ON public.training_assignments(user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_training_assignments_community ON public.training_assignments(community_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_training_assignments_module ON public.training_assignments(module_id, module_version);
CREATE INDEX IF NOT EXISTS idx_training_assignments_due_active ON public.training_assignments(due_at)
  WHERE status IN ('assigned', 'in_progress') AND due_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_attempts_user_module ON public.training_attempts(user_id, module_id, module_version, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_training_attempts_community ON public.training_attempts(community_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_attempts_assignment ON public.training_attempts(assignment_id) WHERE assignment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_responses_attempt ON public.training_activity_responses(attempt_id, slide_id, response_number DESC);
CREATE INDEX IF NOT EXISTS idx_training_certificates_user ON public.training_certificates(user_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_training_certificates_community ON public.training_certificates(community_id, issued_at DESC);

-- Enrich every existing structured course with a visual layout vocabulary.
-- IDs and progress remain intact while the renderer gets professional layouts.
UPDATE public.training_lessons lesson
SET content = (
  SELECT jsonb_agg(
    item || jsonb_build_object(
      'layout', CASE
        WHEN ordinal = 1 THEN 'opening'
        WHEN item #>> '{activity,type}' = 'scenario' THEN 'scenario'
        WHEN item #>> '{activity,type}' = 'checklist' THEN 'checklist'
        WHEN ordinal = 3 THEN 'process'
        WHEN ordinal = jsonb_array_length(lesson.content::jsonb) THEN 'summary'
        ELSE 'framework'
      END,
      'lead', COALESCE(NULLIF(item->>'lead', ''), item #>> '{bullets,0}', item->>'title'),
      'role_cards', CASE
        WHEN ordinal = 3 THEN jsonb_build_array(
          jsonb_build_object('role', 'Administración', 'responsibility', 'Define criterio, responsable y control', 'action', 'Autoriza, asigna y verifica el cierre'),
          jsonb_build_object('role', 'Conserjería', 'responsibility', 'Observa y activa el protocolo', 'action', 'Registra hechos y escala dentro de sus atribuciones')
        )
        ELSE COALESCE(item->'role_cards', '[]'::jsonb)
      END
    ) ORDER BY ordinal
  ) AS content
  FROM jsonb_array_elements(lesson.content::jsonb) WITH ORDINALITY AS entries(item, ordinal)
)
WHERE left(ltrim(lesson.content), 1) = '['
  AND jsonb_typeof(lesson.content::jsonb) = 'array';

UPDATE public.training_modules
SET quality_version = GREATEST(quality_version, 4),
    quality_score = CASE WHEN embed_url IS NULL THEN 92 ELSE 85 END,
    updated_at = now();

INSERT INTO public.training_module_versions (
  module_id, community_id, version_number, title, description, target_audience,
  lesson_title, lesson_content, embed_url, completion_mode, embed_allowed_origin,
  learning_objectives, estimated_minutes, quality_score, change_summary, created_by, created_at
)
SELECT module.id, module.community_id, module.version_number, module.title, COALESCE(module.description, ''),
       COALESCE(module.target_audience, 'all'), COALESCE(lesson.title, 'Curso interactivo'),
       COALESCE(lesson.content, ''), module.embed_url, module.completion_mode, module.embed_allowed_origin,
       module.learning_objectives, module.estimated_minutes, module.quality_score,
       'Versión base incorporada al historial', module.created_by, COALESCE(module.published_at, module.created_at)
FROM public.training_modules module
LEFT JOIN LATERAL (
  SELECT title, content FROM public.training_lessons
  WHERE module_id = module.id ORDER BY order_index ASC LIMIT 1
) lesson ON true
ON CONFLICT (module_id, version_number) DO NOTHING;

-- Preserve historical progress as an auditable legacy attempt.
INSERT INTO public.training_attempts (
  module_id, user_id, community_id, module_version, attempt_number, status,
  score, passed, completion_source, started_at, completed_at, updated_at
)
SELECT progress.module_id, progress.user_id, progress.community_id, module.version_number, 1,
       progress.status, CASE WHEN progress.status = 'completed' THEN 100 ELSE NULL END,
       CASE WHEN progress.status = 'completed' THEN true ELSE NULL END,
       'legacy', progress.started_at, progress.completed_at, progress.updated_at
FROM public.user_training_progress progress
JOIN public.training_modules module ON module.id = progress.module_id
ON CONFLICT (user_id, module_id, module_version, attempt_number) DO NOTHING;

-- Atomic creation and publication keep the module, lesson and immutable snapshot aligned.
CREATE OR REPLACE FUNCTION public.training_create_module_version(
  p_actor_id uuid,
  p_community_id uuid,
  p_title text,
  p_description text,
  p_target_audience text,
  p_lesson_title text,
  p_lesson_content text,
  p_embed_url text,
  p_completion_mode text,
  p_embed_allowed_origin text,
  p_learning_objectives jsonb,
  p_estimated_minutes integer,
  p_quality_score integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_module_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_id AND community_id = p_community_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'training_admin_required';
  END IF;

  INSERT INTO public.training_modules (
    title, description, target_audience, is_active, community_id, created_by,
    embed_url, learning_objectives, estimated_minutes, quality_version,
    version_number, quality_score, completion_mode, embed_allowed_origin,
    published_at, updated_at
  ) VALUES (
    p_title, p_description, p_target_audience, true, p_community_id, p_actor_id,
    p_embed_url, p_learning_objectives, p_estimated_minutes, 4,
    1, p_quality_score, p_completion_mode, p_embed_allowed_origin,
    now(), now()
  ) RETURNING id INTO v_module_id;

  INSERT INTO public.training_lessons (module_id, title, content, order_index)
  VALUES (v_module_id, p_lesson_title, p_lesson_content, 0);

  INSERT INTO public.training_module_versions (
    module_id, community_id, version_number, title, description, target_audience,
    lesson_title, lesson_content, embed_url, completion_mode, embed_allowed_origin,
    learning_objectives, estimated_minutes, quality_score, change_summary, created_by
  ) VALUES (
    v_module_id, p_community_id, 1, p_title, p_description, p_target_audience,
    p_lesson_title, p_lesson_content, p_embed_url, p_completion_mode, p_embed_allowed_origin,
    p_learning_objectives, p_estimated_minutes, p_quality_score, 'Publicación inicial', p_actor_id
  );

  RETURN v_module_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.training_publish_module_version(
  p_module_id uuid,
  p_actor_id uuid,
  p_community_id uuid,
  p_title text,
  p_description text,
  p_target_audience text,
  p_lesson_title text,
  p_lesson_content text,
  p_embed_url text,
  p_completion_mode text,
  p_embed_allowed_origin text,
  p_learning_objectives jsonb,
  p_estimated_minutes integer,
  p_quality_score integer,
  p_change_summary text
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_version integer;
  v_lesson_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_actor_id AND community_id = p_community_id AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'training_admin_required';
  END IF;

  SELECT version_number + 1 INTO v_next_version
  FROM public.training_modules
  WHERE id = p_module_id AND community_id = p_community_id
  FOR UPDATE;

  IF v_next_version IS NULL THEN
    RAISE EXCEPTION 'training_module_not_editable';
  END IF;

  UPDATE public.training_modules
  SET title = p_title,
      description = p_description,
      target_audience = p_target_audience,
      embed_url = p_embed_url,
      completion_mode = p_completion_mode,
      embed_allowed_origin = p_embed_allowed_origin,
      learning_objectives = p_learning_objectives,
      estimated_minutes = p_estimated_minutes,
      quality_version = 4,
      quality_score = p_quality_score,
      version_number = v_next_version,
      is_active = true,
      published_at = now(),
      updated_at = now()
  WHERE id = p_module_id AND community_id = p_community_id;

  SELECT id INTO v_lesson_id
  FROM public.training_lessons
  WHERE module_id = p_module_id
  ORDER BY order_index ASC
  LIMIT 1
  FOR UPDATE;

  IF v_lesson_id IS NULL THEN
    INSERT INTO public.training_lessons (module_id, title, content, order_index)
    VALUES (p_module_id, p_lesson_title, p_lesson_content, 0);
  ELSE
    UPDATE public.training_lessons
    SET title = p_lesson_title, content = p_lesson_content
    WHERE id = v_lesson_id;
  END IF;

  INSERT INTO public.training_module_versions (
    module_id, community_id, version_number, title, description, target_audience,
    lesson_title, lesson_content, embed_url, completion_mode, embed_allowed_origin,
    learning_objectives, estimated_minutes, quality_score, change_summary, created_by
  ) VALUES (
    p_module_id, p_community_id, v_next_version, p_title, p_description, p_target_audience,
    p_lesson_title, p_lesson_content, p_embed_url, p_completion_mode, p_embed_allowed_origin,
    p_learning_objectives, p_estimated_minutes, p_quality_score,
    COALESCE(NULLIF(trim(p_change_summary), ''), 'Actualización del curso'), p_actor_id
  );

  RETURN v_next_version;
END;
$$;

REVOKE ALL ON FUNCTION public.training_create_module_version(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.training_publish_module_version(uuid, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.training_create_module_version(uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.training_publish_module_version(uuid, uuid, uuid, text, text, text, text, text, text, text, text, jsonb, integer, integer, text) TO service_role;

ALTER TABLE public.training_module_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_activity_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_modules_read_visible ON public.training_modules;
CREATE POLICY training_modules_read_visible ON public.training_modules FOR SELECT TO authenticated
USING (
  is_active = true
  AND public.current_profile_role() IN ('admin', 'concierge')
  AND (community_id IS NULL OR community_id = public.current_profile_community_id())
  AND (public.current_profile_role() = 'admin' OR target_audience IN ('all', public.current_profile_role()))
);

DROP POLICY IF EXISTS training_lessons_read_visible ON public.training_lessons;
CREATE POLICY training_lessons_read_visible ON public.training_lessons FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.training_modules module
  WHERE module.id = training_lessons.module_id
    AND module.is_active = true
    AND public.current_profile_role() IN ('admin', 'concierge')
    AND (module.community_id IS NULL OR module.community_id = public.current_profile_community_id())
    AND (public.current_profile_role() = 'admin' OR module.target_audience IN ('all', public.current_profile_role()))
));

CREATE POLICY training_versions_read_visible ON public.training_module_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.training_modules module
  WHERE module.id = training_module_versions.module_id
    AND public.current_profile_role() IN ('admin', 'concierge')
    AND (module.community_id IS NULL OR module.community_id = public.current_profile_community_id())
    AND (public.current_profile_role() = 'admin' OR module.target_audience IN ('all', public.current_profile_role()))
));
CREATE POLICY training_versions_admin_write ON public.training_module_versions FOR ALL TO authenticated
USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

CREATE POLICY training_assignments_read ON public.training_assignments FOR SELECT TO authenticated
USING (
  community_id = public.current_profile_community_id()
  AND (user_id = (SELECT auth.uid()) OR public.current_profile_role() = 'admin')
);
CREATE POLICY training_assignments_admin_write ON public.training_assignments FOR ALL TO authenticated
USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

CREATE POLICY training_attempts_read ON public.training_attempts FOR SELECT TO authenticated
USING (
  community_id = public.current_profile_community_id()
  AND (user_id = (SELECT auth.uid()) OR public.current_profile_role() = 'admin')
);
CREATE POLICY training_attempts_insert_own ON public.training_attempts FOR INSERT TO authenticated
WITH CHECK (community_id = public.current_profile_community_id() AND user_id = (SELECT auth.uid()));
CREATE POLICY training_attempts_update_own ON public.training_attempts FOR UPDATE TO authenticated
USING (community_id = public.current_profile_community_id() AND user_id = (SELECT auth.uid()))
WITH CHECK (community_id = public.current_profile_community_id() AND user_id = (SELECT auth.uid()));

CREATE POLICY training_responses_read ON public.training_activity_responses FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.training_attempts attempt
  WHERE attempt.id = training_activity_responses.attempt_id
    AND attempt.community_id = public.current_profile_community_id()
    AND (attempt.user_id = (SELECT auth.uid()) OR public.current_profile_role() = 'admin')
));
CREATE POLICY training_responses_insert_own ON public.training_activity_responses FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.training_attempts attempt
  WHERE attempt.id = training_activity_responses.attempt_id
    AND attempt.community_id = public.current_profile_community_id()
    AND attempt.user_id = (SELECT auth.uid())
));

CREATE POLICY training_certificates_read ON public.training_certificates FOR SELECT TO authenticated
USING (
  community_id = public.current_profile_community_id()
  AND (user_id = (SELECT auth.uid()) OR public.current_profile_role() = 'admin')
);

GRANT SELECT ON public.training_module_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_assignments TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_attempts TO authenticated;
GRANT SELECT, INSERT ON public.training_activity_responses TO authenticated;
GRANT SELECT ON public.training_certificates TO authenticated;

COMMIT;
