-- Closes the remaining P0 cross-tenant / open-RLS findings from the external
-- audit of 2026-07-16 (section 2.1 items 3/5/6 residue + section 3 "ALTOS"
-- items), on top of the profiles/agent_memories/service_providers fix already
-- applied in 20260717120000_fix_confirmed_privilege_escalation.sql.
--
-- Every table below already had SOME RLS policy, but an earlier permissive
-- policy (USING (true), often with no TO clause so it applies to PUBLIC) was
-- never dropped when a later migration added a properly-scoped one -- Postgres
-- ORs all permissive policies together, so the old permissive one kept
-- overriding the new restrictive one.

BEGIN;

-- ── 1. profiles: drop the redundant PUBLIC/anon read-everything policy ──────
-- profiles_select_community_only (016) already covers legitimate same-tenant
-- reads; profiles_public_read (006) is strictly more permissive and exposes
-- email/phone/department_number of every tenant to anon.
DROP POLICY IF EXISTS "profiles_public_read" ON public.profiles;

-- ── 2. marketplace_items: scope to the caller's own tenant ───────────────────
-- marketplace_items has no community_id column; sellers are always profiles,
-- so we scope via the seller's own community instead of altering the schema.
DROP POLICY IF EXISTS "marketplace_select_all" ON public.marketplace_items;
CREATE POLICY "marketplace_select_community"
  ON public.marketplace_items
  FOR SELECT
  TO authenticated
  USING (
    seller_id IN (
      SELECT id FROM public.profiles WHERE community_id = public.get_my_community_id()
    )
  );

-- ── 3. notifications: only the backend (service_role) may insert ────────────
-- notifications_insert WITH CHECK (true) had no TO clause, so any authenticated
-- client could insert a notification with an arbitrary user_id, impersonating
-- the system. Every real insert path already goes through supabaseAdmin.
DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert"
  ON public.notifications
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ── 4. maintenance: scope both read and admin/concierge write to the caller's
--    own tenant (previously any authenticated user of ANY building could read,
--    and any admin/concierge of ANY building could write, every other building's
--    maintenance data). ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "building_assets_read_authenticated" ON public.building_assets;
CREATE POLICY "building_assets_read_authenticated" ON public.building_assets
  FOR SELECT TO authenticated USING (community_id = public.get_my_community_id());

DROP POLICY IF EXISTS "maintenance_tasks_read_authenticated" ON public.maintenance_tasks;
CREATE POLICY "maintenance_tasks_read_authenticated" ON public.maintenance_tasks
  FOR SELECT TO authenticated USING (community_id = public.get_my_community_id());

DROP POLICY IF EXISTS "maintenance_logs_read_authenticated" ON public.maintenance_logs;
CREATE POLICY "maintenance_logs_read_authenticated" ON public.maintenance_logs
  FOR SELECT TO authenticated USING (community_id = public.get_my_community_id());

DROP POLICY IF EXISTS "building_assets_admin_write" ON public.building_assets;
CREATE POLICY "building_assets_admin_write" ON public.building_assets FOR ALL TO authenticated USING (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
) WITH CHECK (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
);

DROP POLICY IF EXISTS "maintenance_tasks_admin_write" ON public.maintenance_tasks;
CREATE POLICY "maintenance_tasks_admin_write" ON public.maintenance_tasks FOR ALL TO authenticated USING (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
) WITH CHECK (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
);

DROP POLICY IF EXISTS "maintenance_logs_admin_write" ON public.maintenance_logs;
CREATE POLICY "maintenance_logs_admin_write" ON public.maintenance_logs FOR ALL TO authenticated USING (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
) WITH CHECK (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
);

-- ── 5. social_posts / social_comments / chat_messages: scope the "everyone" ──
-- views to the caller's own tenant. No community_id column exists on these
-- tables; we scope via the author/sender's own profile instead of a schema
-- change, since author_id/sender_id always reference profiles.
DROP POLICY IF EXISTS "posts_select" ON public.social_posts;
CREATE POLICY "posts_select" ON public.social_posts FOR SELECT USING (
  author_id IN (SELECT id FROM public.profiles WHERE community_id = public.get_my_community_id())
);

DROP POLICY IF EXISTS "comments_select" ON public.social_comments;
CREATE POLICY "comments_select" ON public.social_comments FOR SELECT USING (
  post_id IN (
    SELECT id FROM public.social_posts
    WHERE author_id IN (SELECT id FROM public.profiles WHERE community_id = public.get_my_community_id())
  )
);

DROP POLICY IF EXISTS "chat_global_select" ON public.chat_messages;
CREATE POLICY "chat_global_select" ON public.chat_messages FOR SELECT USING (
  (receiver_id IS NULL AND sender_id IN (
    SELECT id FROM public.profiles WHERE community_id = public.get_my_community_id()
  ))
  OR sender_id = auth.uid()
  OR receiver_id = auth.uid()
);

-- increment_post_likes: was SECURITY DEFINER with no EXECUTE restriction, so
-- any anon/authenticated caller could spam-increment likes on any post_id.
REVOKE EXECUTE ON FUNCTION public.increment_post_likes(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_post_likes(uuid) TO authenticated;

-- ── 6. coco_cases: the INSERT check verified user_id/role but never that the
--    community_id on the new row matches the caller's own tenant, so any
--    authenticated user could inject a fabricated case into another
--    community's admin/concierge dashboard. ──────────────────────────────────
DROP POLICY IF EXISTS "coco_cases_insert_own" ON public.coco_cases;
CREATE POLICY "coco_cases_insert_own" ON public.coco_cases FOR INSERT WITH CHECK (
  community_id = public.get_my_community_id()
  AND (
    user_id = auth.uid()
    OR public.get_my_role() IN ('admin', 'concierge')
  )
);

-- ── 7. instagram_connections: stop exposing the (encrypted) access token to
--    PostgREST entirely -- the app only ever needs status/username/expiry
--    client-side; the actual publish calls run server-side with service_role.
REVOKE SELECT (encrypted_access_token) ON public.instagram_connections FROM authenticated;

-- ── 8. search_profiles_lexical / search_profiles_semantic: the
--    community_filter_id parameter let any authenticated caller override
--    their own tenant and read name/email/role/avatar_url of every other
--    community. Always derive the tenant from the caller's own profile.
DROP FUNCTION IF EXISTS search_profiles_lexical(text, uuid);
CREATE OR REPLACE FUNCTION search_profiles_lexical(query text)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  rank real
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.email, p.role, p.avatar_url,
    ts_rank(p.search_vector, websearch_to_tsquery('spanish', query)) AS rank
  FROM public.profiles p
  WHERE
    p.search_vector @@ websearch_to_tsquery('spanish', query)
    AND p.community_id = public.get_my_community_id()
  ORDER BY rank DESC
  LIMIT 20;
END;
$$;

DROP FUNCTION IF EXISTS search_profiles_semantic(vector, int, uuid);
CREATE OR REPLACE FUNCTION search_profiles_semantic(
  query_embedding vector(1024),
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  role text,
  avatar_url text,
  similarity real
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name, p.email, p.role, p.avatar_url,
    (1 - (p.embedding_voyage <=> query_embedding))::real AS similarity
  FROM public.profiles p
  WHERE
    p.embedding_voyage IS NOT NULL
    AND p.community_id = public.get_my_community_id()
  ORDER BY p.embedding_voyage <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ── 9. match_agent_memories: defense in depth. agent_memories RLS already
--    restricts the underlying table to service_role only (previous migration),
--    so this was already unreachable via anon/authenticated, but restrict
--    EXECUTE too so a client key gets a clean permission error instead of an
--    empty-looking result. Only the server-side orchestrator calls this.
REVOKE EXECUTE ON FUNCTION match_agent_memories(vector, uuid, uuid, float, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION match_agent_memories(vector, uuid, uuid, float, int) TO service_role;

-- ── 10. agent_runs / agent_tool_calls / agent_action_approvals: these are the
--    Agent Center's internal audit trail (admin actions, finance operations).
--    The previous policy let ANY resident of the tenant read it, not just
--    staff -- restrict to admin/concierge (still allow a user to see rows
--    that are literally their own, e.g. an approval they personally triggered).
DROP POLICY IF EXISTS "agent_runs_tenant_select" ON public.agent_runs;
CREATE POLICY "agent_runs_tenant_select" ON public.agent_runs FOR SELECT USING (
  user_id = auth.uid()
  OR (community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge'))
);

DROP POLICY IF EXISTS "agent_tool_calls_tenant_select" ON public.agent_tool_calls;
CREATE POLICY "agent_tool_calls_tenant_select" ON public.agent_tool_calls FOR SELECT USING (
  user_id = auth.uid()
  OR (community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge'))
);

DROP POLICY IF EXISTS "agent_action_approvals_tenant_select" ON public.agent_action_approvals;
CREATE POLICY "agent_action_approvals_tenant_select" ON public.agent_action_approvals FOR SELECT USING (
  user_id = auth.uid()
  OR (community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge'))
);

-- ── 11. solidarity_tasks.pin_code: never expose the supervisor PIN via
--    PostgREST at all -- verification happens server-side (service_role) in
--    /api/solidarity/tasks. Residents/staff only ever need the other columns.
REVOKE SELECT (pin_code) ON public.solidarity_tasks FROM authenticated;

COMMIT;
