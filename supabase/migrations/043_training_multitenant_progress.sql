-- Training tenant isolation and resident progress.
ALTER TABLE public.training_modules
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_training_modules_community ON public.training_modules(community_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.user_training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.training_modules(id) ON DELETE CASCADE,
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'in_progress',
  last_slide_index integer NOT NULL DEFAULT 0 CHECK (last_slide_index >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_id)
);
ALTER TABLE public.user_training_progress
  ADD COLUMN IF NOT EXISTS community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS last_slide_index integer NOT NULL DEFAULT 0 CHECK (last_slide_index >= 0),
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.user_training_progress DROP CONSTRAINT IF EXISTS user_training_progress_status_check;
UPDATE public.user_training_progress SET status = 'in_progress' WHERE status = 'started';
ALTER TABLE public.user_training_progress ADD CONSTRAINT user_training_progress_status_check CHECK (status IN ('in_progress', 'completed'));
UPDATE public.user_training_progress progress
SET community_id = profile.community_id
FROM public.profiles profile
WHERE progress.user_id = profile.id AND progress.community_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_user_training_progress_community ON public.user_training_progress(community_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_training_progress_user ON public.user_training_progress(user_id, updated_at DESC);

ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS training_modules_read_visible ON public.training_modules;
CREATE POLICY training_modules_read_visible ON public.training_modules FOR SELECT TO authenticated
USING (is_active = true AND (community_id IS NULL OR community_id = public.current_profile_community_id()));
DROP POLICY IF EXISTS training_modules_admin_insert ON public.training_modules;
CREATE POLICY training_modules_admin_insert ON public.training_modules FOR INSERT TO authenticated
WITH CHECK (community_id = public.current_profile_community_id() AND created_by = auth.uid() AND public.current_profile_role() = 'admin');
DROP POLICY IF EXISTS training_modules_admin_update ON public.training_modules;
CREATE POLICY training_modules_admin_update ON public.training_modules FOR UPDATE TO authenticated
USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');
DROP POLICY IF EXISTS training_modules_admin_delete ON public.training_modules;
CREATE POLICY training_modules_admin_delete ON public.training_modules FOR DELETE TO authenticated
USING (community_id IS NOT NULL AND community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS training_lessons_read_visible ON public.training_lessons;
CREATE POLICY training_lessons_read_visible ON public.training_lessons FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id));
DROP POLICY IF EXISTS training_lessons_admin_insert ON public.training_lessons;
CREATE POLICY training_lessons_admin_insert ON public.training_lessons FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));
DROP POLICY IF EXISTS training_lessons_admin_update ON public.training_lessons;
CREATE POLICY training_lessons_admin_update ON public.training_lessons FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));
DROP POLICY IF EXISTS training_lessons_admin_delete ON public.training_lessons;
CREATE POLICY training_lessons_admin_delete ON public.training_lessons FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));

DROP POLICY IF EXISTS user_training_progress_read_own ON public.user_training_progress;
CREATE POLICY user_training_progress_read_own ON public.user_training_progress FOR SELECT TO authenticated
USING (user_id = auth.uid() AND community_id = public.current_profile_community_id());
DROP POLICY IF EXISTS user_training_progress_insert_own ON public.user_training_progress;
CREATE POLICY user_training_progress_insert_own ON public.user_training_progress FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND community_id = public.current_profile_community_id());
DROP POLICY IF EXISTS user_training_progress_update_own ON public.user_training_progress;
CREATE POLICY user_training_progress_update_own ON public.user_training_progress FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND community_id = public.current_profile_community_id())
WITH CHECK (user_id = auth.uid() AND community_id = public.current_profile_community_id());
