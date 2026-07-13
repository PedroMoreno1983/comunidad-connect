-- Remove legacy permissive training policies before installing the strict set.
DO $$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('training_modules', 'training_lessons', 'user_training_progress')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;
END $$;

CREATE POLICY training_modules_read_visible ON public.training_modules FOR SELECT TO authenticated
USING (is_active = true AND (community_id IS NULL OR community_id = public.current_profile_community_id()));
CREATE POLICY training_modules_admin_insert ON public.training_modules FOR INSERT TO authenticated
WITH CHECK (community_id = public.current_profile_community_id() AND created_by = auth.uid() AND public.current_profile_role() = 'admin');
CREATE POLICY training_modules_admin_update ON public.training_modules FOR UPDATE TO authenticated
USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin')
WITH CHECK (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');
CREATE POLICY training_modules_admin_delete ON public.training_modules FOR DELETE TO authenticated
USING (community_id IS NOT NULL AND community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

CREATE POLICY training_lessons_read_visible ON public.training_lessons FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id));
CREATE POLICY training_lessons_admin_insert ON public.training_lessons FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));
CREATE POLICY training_lessons_admin_update ON public.training_lessons FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));
CREATE POLICY training_lessons_admin_delete ON public.training_lessons FOR DELETE TO authenticated
USING (EXISTS (SELECT 1 FROM public.training_modules module WHERE module.id = training_lessons.module_id AND module.community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin'));

CREATE POLICY user_training_progress_read_own ON public.user_training_progress FOR SELECT TO authenticated
USING (user_id = auth.uid() AND community_id = public.current_profile_community_id());
CREATE POLICY user_training_progress_insert_own ON public.user_training_progress FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND community_id = public.current_profile_community_id());
CREATE POLICY user_training_progress_update_own ON public.user_training_progress FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND community_id = public.current_profile_community_id())
WITH CHECK (user_id = auth.uid() AND community_id = public.current_profile_community_id());
