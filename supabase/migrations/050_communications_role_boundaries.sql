BEGIN;

DROP POLICY IF EXISTS "announcements_select_all" ON public.announcements;
DROP POLICY IF EXISTS "announcements_insert_admin" ON public.announcements;
DROP POLICY IF EXISTS "announcements_admin_all" ON public.announcements;
DROP POLICY IF EXISTS "announcements_select_community_only" ON public.announcements;
DROP POLICY IF EXISTS "announcements_all_staff_community" ON public.announcements;
DROP POLICY IF EXISTS "tenant_announcements_select" ON public.announcements;
DROP POLICY IF EXISTS "tenant_announcements_insert" ON public.announcements;
DROP POLICY IF EXISTS "tenant_announcements_update" ON public.announcements;
DROP POLICY IF EXISTS "tenant_announcements_delete" ON public.announcements;

CREATE POLICY "announcements_select_community"
  ON public.announcements
  FOR SELECT
  USING (community_id = public.get_my_community_id());

CREATE POLICY "announcements_insert_staff"
  ON public.announcements
  FOR INSERT
  WITH CHECK (
    community_id = public.get_my_community_id()
    AND public.get_my_role() IN ('admin', 'concierge')
    AND author_id = auth.uid()
  );

CREATE POLICY "announcements_update_staff"
  ON public.announcements
  FOR UPDATE
  USING (
    community_id = public.get_my_community_id()
    AND public.get_my_role() IN ('admin', 'concierge')
  )
  WITH CHECK (
    community_id = public.get_my_community_id()
    AND public.get_my_role() IN ('admin', 'concierge')
  );

CREATE POLICY "announcements_delete_staff"
  ON public.announcements
  FOR DELETE
  USING (
    community_id = public.get_my_community_id()
    AND public.get_my_role() IN ('admin', 'concierge')
  );

COMMIT;
