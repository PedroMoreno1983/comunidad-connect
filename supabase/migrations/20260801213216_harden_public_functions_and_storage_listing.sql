-- Recuperada del historial de migraciones el 2026-08-25.
--
-- Esta migracion se aplico directamente en produccion el 2026-08-01 y nunca
-- llego al repositorio: era el unico registro del historial sin archivo .sql
-- local. Su contenido se rescato desde supabase_migrations.schema_migrations
-- y se restituye aqui palabra por palabra, sin modificaciones.
--
-- Que hace: revoca EXECUTE a PUBLIC sobre todas las funciones de public y lo
-- vuelve a otorgar solo a los roles que corresponden, y restringe el listado
-- de objetos de storage. Cubre funciones sensibles como handle_new_user y
-- prevent_profile_privilege_escalation, que nunca deben ser invocables por un
-- usuario anonimo. Perderla del control de versiones significaba que una
-- reconstruccion de la base desde migraciones habria dejado esa superficie
-- abierta.

-- Close implicit Postgres EXECUTE grants that exposed privileged helpers as
-- public RPC endpoints. RLS helper and marketplace RPC functions remain
-- available to signed-in users; trigger and maintenance functions are kept
-- server-only.

-- Authenticated RLS helpers and user-facing RPCs.
REVOKE ALL ON FUNCTION public.current_profile_community_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.current_profile_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_community_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_unit_id() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_marketplace_inbox() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.increment_post_likes(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_marketplace_conversation_read(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_marketplace_conversation(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.current_profile_community_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_profile_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_community_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_unit_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_marketplace_inbox() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_post_likes(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_conversation_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.start_marketplace_conversation(uuid) TO authenticated, service_role;

-- Trigger functions and scheduled maintenance are never browser RPCs.
REVOKE ALL ON FUNCTION public.enforce_marketplace_message_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_community_solidarity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notify_package_residents() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_expired_supermarket_cart_plans() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_notification_community() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_package_community_from_unit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_qr_invitation_context() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_visitor_log_community() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_water_reading_community() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_marketplace_conversation_from_message() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enforce_marketplace_message_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_community_solidarity() TO service_role;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.notify_package_residents() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_profile_privilege_escalation() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_supermarket_cart_plans() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_notification_community() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_package_community_from_unit() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_qr_invitation_context() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_visitor_log_community() TO service_role;
GRANT EXECUTE ON FUNCTION public.set_water_reading_community() TO service_role;
GRANT EXECUTE ON FUNCTION public.touch_marketplace_conversation_from_message() TO service_role;

-- The legacy like counter bypasses table RLS, so it must enforce both
-- authentication and tenant membership inside the function.
CREATE OR REPLACE FUNCTION public.increment_post_likes(post_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_community_id uuid;
BEGIN
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT community_id
    INTO caller_community_id
  FROM public.profiles
  WHERE id = caller_id;

  IF caller_community_id IS NULL THEN
    RAISE EXCEPTION 'Profile community required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.social_posts
  SET likes_count = COALESCE(likes_count, 0) + 1
  WHERE id = $1
    AND community_id = caller_community_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Post unavailable in this community' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_post_likes(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_post_likes(uuid) TO authenticated, service_role;

-- Pin the lookup namespace for application-owned functions flagged by the
-- database advisor. The vector extension currently lives in public, so public
-- remains first until that extension is moved in a separately tested change.
ALTER FUNCTION public.generate_community_codes() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_service_requests_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.search_marketplace_lexical(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.update_coco_cases_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.assert_poll_vote_integrity() SET search_path = public, pg_temp;
ALTER FUNCTION public.refresh_poll_option_votes() SET search_path = public, pg_temp;
ALTER FUNCTION public.search_marketplace_semantic(vector, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.touch_ai_budget_updated_at() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_community_solidarity() SET search_path = public, pg_temp;
ALTER FUNCTION public.search_profiles_lexical(text) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_profiles_semantic(vector, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.match_agent_memories(vector, uuid, uuid, double precision, integer) SET search_path = public, pg_temp;

-- Public object URLs do not require SELECT policies. Removing these broad
-- policies prevents bucket enumeration while keeping CDN URLs and uploads.
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
DROP POLICY IF EXISTS marketing_reels_public_read ON storage.objects;
DROP POLICY IF EXISTS marketing_reels_audio_public_read ON storage.objects;
DROP POLICY IF EXISTS marketplace_public_read ON storage.objects;
DROP POLICY IF EXISTS social_images_public_read ON storage.objects;

-- New functions become private by default; migrations must explicitly grant
-- authenticated execution for intentional browser RPCs.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
