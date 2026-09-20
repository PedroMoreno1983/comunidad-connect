-- Follow-up hardening from Supabase security/performance advisors.
-- Course versions stay immutable from browser clients; server RPCs own writes.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_training_assignments_assigned_by ON public.training_assignments(assigned_by) WHERE assigned_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_attempts_module ON public.training_attempts(module_id);
CREATE INDEX IF NOT EXISTS idx_training_certificates_module ON public.training_certificates(module_id);
CREATE INDEX IF NOT EXISTS idx_training_lessons_module ON public.training_lessons(module_id);
CREATE INDEX IF NOT EXISTS idx_training_versions_created_by ON public.training_module_versions(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_training_modules_created_by ON public.training_modules(created_by) WHERE created_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_training_progress_module ON public.user_training_progress(module_id);

DROP POLICY IF EXISTS training_versions_admin_write ON public.training_module_versions;
DROP POLICY IF EXISTS training_assignments_admin_write ON public.training_assignments;

DROP POLICY IF EXISTS training_modules_admin_insert ON public.training_modules;
CREATE POLICY training_modules_admin_insert ON public.training_modules FOR INSERT TO authenticated
WITH CHECK (
  community_id = public.current_profile_community_id()
  AND created_by = (SELECT auth.uid())
  AND public.current_profile_role() = 'admin'
);

DROP POLICY IF EXISTS user_training_progress_read_own ON public.user_training_progress;
CREATE POLICY user_training_progress_read_own ON public.user_training_progress FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS user_training_progress_insert_own ON public.user_training_progress;
CREATE POLICY user_training_progress_insert_own ON public.user_training_progress FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()) AND community_id = public.current_profile_community_id());

DROP POLICY IF EXISTS user_training_progress_update_own ON public.user_training_progress;
CREATE POLICY user_training_progress_update_own ON public.user_training_progress FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND community_id = public.current_profile_community_id())
WITH CHECK (user_id = (SELECT auth.uid()) AND community_id = public.current_profile_community_id());

COMMIT;
