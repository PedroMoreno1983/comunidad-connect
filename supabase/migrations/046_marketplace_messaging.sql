-- Private, auditable Marketplace messaging scoped to one community and item.
BEGIN;

CREATE TABLE IF NOT EXISTS public.marketplace_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id UUID NOT NULL REFERENCES public.marketplace_items(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketplace_conversations_distinct_participants CHECK (buyer_id <> seller_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS marketplace_conversations_item_buyer_unique
  ON public.marketplace_conversations(item_id, buyer_id);
CREATE INDEX IF NOT EXISTS marketplace_conversations_buyer_recent_idx
  ON public.marketplace_conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_conversations_seller_recent_idx
  ON public.marketplace_conversations(seller_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS marketplace_conversations_community_idx
  ON public.marketplace_conversations(community_id);

CREATE TABLE IF NOT EXISTS public.marketplace_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.marketplace_conversations(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS marketplace_conversation_messages_conversation_recent_idx
  ON public.marketplace_conversation_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS marketplace_conversation_messages_unread_idx
  ON public.marketplace_conversation_messages(conversation_id, sender_id, read_at)
  WHERE read_at IS NULL;

CREATE OR REPLACE FUNCTION public.start_marketplace_conversation(p_item_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_user_community_id UUID;
  v_item_community_id UUID;
  v_seller_id UUID;
  v_conversation_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT community_id
  INTO v_user_community_id
  FROM public.profiles
  WHERE id = v_user_id;

  SELECT community_id, seller_id
  INTO v_item_community_id, v_seller_id
  FROM public.marketplace_items
  WHERE id = p_item_id
    AND status IN ('available', 'reserved');

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Marketplace item is not available' USING ERRCODE = '22023';
  END IF;

  IF v_user_community_id IS NULL OR v_user_community_id <> v_item_community_id THEN
    RAISE EXCEPTION 'Marketplace item belongs to another community' USING ERRCODE = '42501';
  END IF;

  IF v_user_id = v_seller_id THEN
    RAISE EXCEPTION 'Seller cannot start a conversation with themselves' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.marketplace_conversations (
    item_id,
    community_id,
    buyer_id,
    seller_id
  )
  VALUES (
    p_item_id,
    v_item_community_id,
    v_user_id,
    v_seller_id
  )
  ON CONFLICT (item_id, buyer_id)
  DO UPDATE SET updated_at = NOW()
  RETURNING id INTO v_conversation_id;

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_marketplace_message_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_community_id UUID;
  v_buyer_id UUID;
  v_seller_id UUID;
BEGIN
  SELECT community_id, buyer_id, seller_id
  INTO v_community_id, v_buyer_id, v_seller_id
  FROM public.marketplace_conversations
  WHERE id = NEW.conversation_id;

  IF v_community_id IS NULL THEN
    RAISE EXCEPTION 'Conversation not found' USING ERRCODE = '23503';
  END IF;

  IF NEW.sender_id NOT IN (v_buyer_id, v_seller_id) THEN
    RAISE EXCEPTION 'Sender is not a conversation participant' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NOT NULL AND NEW.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Sender identity does not match authenticated user' USING ERRCODE = '42501';
  END IF;

  NEW.community_id := v_community_id;
  NEW.content := btrim(NEW.content);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_message_context ON public.marketplace_conversation_messages;
CREATE TRIGGER trg_marketplace_message_context
BEFORE INSERT ON public.marketplace_conversation_messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_marketplace_message_context();

CREATE OR REPLACE FUNCTION public.touch_marketplace_conversation_from_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.marketplace_conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_marketplace_message_touch_conversation ON public.marketplace_conversation_messages;
CREATE TRIGGER trg_marketplace_message_touch_conversation
AFTER INSERT ON public.marketplace_conversation_messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_marketplace_conversation_from_message();

CREATE OR REPLACE FUNCTION public.mark_marketplace_conversation_read(p_conversation_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_updated INTEGER;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.marketplace_conversations c
    JOIN public.profiles p ON p.id = v_user_id
    WHERE c.id = p_conversation_id
      AND v_user_id IN (c.buyer_id, c.seller_id)
      AND c.community_id = p.community_id
  ) THEN
    RAISE EXCEPTION 'Conversation access denied' USING ERRCODE = '42501';
  END IF;

  UPDATE public.marketplace_conversation_messages
  SET read_at = COALESCE(read_at, NOW())
  WHERE conversation_id = p_conversation_id
    AND sender_id <> v_user_id
    AND read_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_marketplace_inbox()
RETURNS TABLE (
  conversation_id UUID,
  item_id UUID,
  item_title TEXT,
  item_image_url TEXT,
  item_status TEXT,
  buyer_id UUID,
  seller_id UUID,
  peer_id UUID,
  peer_name TEXT,
  peer_avatar_url TEXT,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.item_id,
    i.title,
    i.image_url,
    i.status::TEXT,
    c.buyer_id,
    c.seller_id,
    peer.id,
    COALESCE(peer.name, 'Residente'),
    peer.avatar_url,
    latest.content,
    COALESCE(latest.created_at, c.created_at),
    (
      SELECT COUNT(*)::INTEGER
      FROM public.marketplace_conversation_messages unread
      WHERE unread.conversation_id = c.id
        AND unread.sender_id <> auth.uid()
        AND unread.read_at IS NULL
    )
  FROM public.marketplace_conversations c
  JOIN public.marketplace_items i ON i.id = c.item_id
  JOIN public.profiles current_profile ON current_profile.id = auth.uid()
  JOIN public.profiles peer
    ON peer.id = CASE WHEN c.buyer_id = auth.uid() THEN c.seller_id ELSE c.buyer_id END
  LEFT JOIN LATERAL (
    SELECT m.content, m.created_at
    FROM public.marketplace_conversation_messages m
    WHERE m.conversation_id = c.id
    ORDER BY m.created_at DESC
    LIMIT 1
  ) latest ON TRUE
  WHERE auth.uid() IN (c.buyer_id, c.seller_id)
    AND c.community_id = current_profile.community_id
  ORDER BY COALESCE(latest.created_at, c.last_message_at) DESC;
$$;

ALTER TABLE public.marketplace_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketplace_conversations_participant_select ON public.marketplace_conversations;
CREATE POLICY marketplace_conversations_participant_select
ON public.marketplace_conversations
FOR SELECT
TO authenticated
USING (
  auth.uid() IN (buyer_id, seller_id)
  AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS marketplace_conversation_messages_participant_select ON public.marketplace_conversation_messages;
CREATE POLICY marketplace_conversation_messages_participant_select
ON public.marketplace_conversation_messages
FOR SELECT
TO authenticated
USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_conversations c
    WHERE c.id = conversation_id
      AND auth.uid() IN (c.buyer_id, c.seller_id)
  )
);

DROP POLICY IF EXISTS marketplace_conversation_messages_participant_insert ON public.marketplace_conversation_messages;
CREATE POLICY marketplace_conversation_messages_participant_insert
ON public.marketplace_conversation_messages
FOR INSERT
TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.marketplace_conversations c
    WHERE c.id = conversation_id
      AND auth.uid() IN (c.buyer_id, c.seller_id)
      AND c.community_id = marketplace_conversation_messages.community_id
  )
);

REVOKE ALL ON public.marketplace_conversations FROM anon;
REVOKE ALL ON public.marketplace_conversation_messages FROM anon;
GRANT SELECT ON public.marketplace_conversations TO authenticated;
GRANT SELECT, INSERT ON public.marketplace_conversation_messages TO authenticated;

REVOKE ALL ON FUNCTION public.start_marketplace_conversation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_marketplace_conversation_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_marketplace_inbox() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_marketplace_conversation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_marketplace_conversation_read(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_marketplace_inbox() TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'marketplace_conversation_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.marketplace_conversation_messages;
  END IF;
END $$;

COMMIT;
