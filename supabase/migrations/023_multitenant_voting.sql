-- =====================================================
-- MIGRATION: 023_multitenant_voting.sql
-- Production voting schema with strict community isolation.
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Keep helper functions available even when this migration is applied alone.
CREATE OR REPLACE FUNCTION get_my_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'community' CHECK (category IN ('community', 'maintenance', 'rules', 'other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'closed', 'cancelled')),
  end_date TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  option_id UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (poll_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_polls_community_status_created
  ON public.polls(community_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_poll_options_poll_order
  ON public.poll_options(poll_id, display_order);

CREATE INDEX IF NOT EXISTS idx_poll_votes_community_poll
  ON public.poll_votes(community_id, poll_id);

CREATE INDEX IF NOT EXISTS idx_poll_votes_user_poll
  ON public.poll_votes(user_id, poll_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_polls_touch_updated_at ON public.polls;
CREATE TRIGGER trg_polls_touch_updated_at
BEFORE UPDATE ON public.polls
FOR EACH ROW
EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.assert_poll_vote_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_poll_community UUID;
  v_option_poll UUID;
  v_user_community UUID;
BEGIN
  SELECT community_id INTO v_poll_community
  FROM public.polls
  WHERE id = NEW.poll_id;

  SELECT poll_id INTO v_option_poll
  FROM public.poll_options
  WHERE id = NEW.option_id;

  SELECT community_id INTO v_user_community
  FROM public.profiles
  WHERE id = NEW.user_id;

  IF v_poll_community IS NULL OR v_option_poll IS NULL OR v_user_community IS NULL THEN
    RAISE EXCEPTION 'Invalid poll vote reference';
  END IF;

  IF v_option_poll <> NEW.poll_id THEN
    RAISE EXCEPTION 'Poll option does not belong to poll';
  END IF;

  IF v_user_community <> v_poll_community THEN
    RAISE EXCEPTION 'User and poll belong to different communities';
  END IF;

  NEW.community_id = v_poll_community;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_poll_votes_integrity ON public.poll_votes;
CREATE TRIGGER trg_poll_votes_integrity
BEFORE INSERT OR UPDATE ON public.poll_votes
FOR EACH ROW
EXECUTE FUNCTION public.assert_poll_vote_integrity();

CREATE OR REPLACE FUNCTION public.refresh_poll_option_votes()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_option_id UUID;
BEGIN
  v_option_id := COALESCE(NEW.option_id, OLD.option_id);

  UPDATE public.poll_options
  SET votes = (
    SELECT COUNT(*)::INTEGER
    FROM public.poll_votes
    WHERE option_id = v_option_id
  )
  WHERE id = v_option_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_poll_votes_refresh_insert ON public.poll_votes;
CREATE TRIGGER trg_poll_votes_refresh_insert
AFTER INSERT ON public.poll_votes
FOR EACH ROW
EXECUTE FUNCTION public.refresh_poll_option_votes();

DROP TRIGGER IF EXISTS trg_poll_votes_refresh_update ON public.poll_votes;
CREATE TRIGGER trg_poll_votes_refresh_update
AFTER UPDATE OF option_id ON public.poll_votes
FOR EACH ROW
EXECUTE FUNCTION public.refresh_poll_option_votes();

DROP TRIGGER IF EXISTS trg_poll_votes_refresh_delete ON public.poll_votes;
CREATE TRIGGER trg_poll_votes_refresh_delete
AFTER DELETE ON public.poll_votes
FOR EACH ROW
EXECUTE FUNCTION public.refresh_poll_option_votes();

ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "polls_select_community_only" ON public.polls;
CREATE POLICY "polls_select_community_only"
ON public.polls FOR SELECT
USING (community_id = get_my_community_id());

DROP POLICY IF EXISTS "polls_insert_admin_community_only" ON public.polls;
CREATE POLICY "polls_insert_admin_community_only"
ON public.polls FOR INSERT
WITH CHECK (
  community_id = get_my_community_id()
  AND created_by = auth.uid()
  AND get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "polls_update_admin_community_only" ON public.polls;
CREATE POLICY "polls_update_admin_community_only"
ON public.polls FOR UPDATE
USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
)
WITH CHECK (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "polls_delete_admin_community_only" ON public.polls;
CREATE POLICY "polls_delete_admin_community_only"
ON public.polls FOR DELETE
USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);

DROP POLICY IF EXISTS "poll_options_select_community_only" ON public.poll_options;
CREATE POLICY "poll_options_select_community_only"
ON public.poll_options FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND p.community_id = get_my_community_id()
  )
);

DROP POLICY IF EXISTS "poll_options_insert_admin_community_only" ON public.poll_options;
CREATE POLICY "poll_options_insert_admin_community_only"
ON public.poll_options FOR INSERT
WITH CHECK (
  get_my_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND p.community_id = get_my_community_id()
  )
);

DROP POLICY IF EXISTS "poll_options_update_admin_community_only" ON public.poll_options;
CREATE POLICY "poll_options_update_admin_community_only"
ON public.poll_options FOR UPDATE
USING (
  get_my_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND p.community_id = get_my_community_id()
  )
)
WITH CHECK (
  get_my_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND p.community_id = get_my_community_id()
  )
);

DROP POLICY IF EXISTS "poll_options_delete_admin_community_only" ON public.poll_options;
CREATE POLICY "poll_options_delete_admin_community_only"
ON public.poll_options FOR DELETE
USING (
  get_my_role() = 'admin'
  AND EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_options.poll_id
      AND p.community_id = get_my_community_id()
  )
);

DROP POLICY IF EXISTS "poll_votes_select_community_only" ON public.poll_votes;
CREATE POLICY "poll_votes_select_community_only"
ON public.poll_votes FOR SELECT
USING (community_id = get_my_community_id());

DROP POLICY IF EXISTS "poll_votes_insert_own_community_only" ON public.poll_votes;
CREATE POLICY "poll_votes_insert_own_community_only"
ON public.poll_votes FOR INSERT
WITH CHECK (
  user_id = auth.uid()
  AND community_id = get_my_community_id()
  AND EXISTS (
    SELECT 1 FROM public.polls p
    WHERE p.id = poll_votes.poll_id
      AND p.community_id = get_my_community_id()
      AND p.status = 'active'
      AND p.end_date >= NOW()
  )
);

DROP POLICY IF EXISTS "poll_votes_update_own_community_only" ON public.poll_votes;
CREATE POLICY "poll_votes_update_own_community_only"
ON public.poll_votes FOR UPDATE
USING (
  user_id = auth.uid()
  AND community_id = get_my_community_id()
)
WITH CHECK (
  user_id = auth.uid()
  AND community_id = get_my_community_id()
);

DROP POLICY IF EXISTS "poll_votes_delete_admin_community_only" ON public.poll_votes;
CREATE POLICY "poll_votes_delete_admin_community_only"
ON public.poll_votes FOR DELETE
USING (
  community_id = get_my_community_id()
  AND get_my_role() = 'admin'
);
