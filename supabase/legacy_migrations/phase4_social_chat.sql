-- =====================================================
-- Fase 4: Comunicación y Red Social
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================

-- 1. MURO SOCIAL: Posts
CREATE TABLE IF NOT EXISTS public.social_posts (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    author_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content     text NOT NULL,
    image_url   text,
    likes_count integer DEFAULT 0,
    created_at  timestamptz DEFAULT now()
);

-- 2. MURO SOCIAL: Comentarios
CREATE TABLE IF NOT EXISTS public.social_comments (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id     uuid REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
    author_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    content     text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

-- 3. MENSAJERÍA: Chat Global y Directo
CREATE TABLE IF NOT EXISTS public.chat_messages (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id   uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    receiver_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE, -- NULL = mensaje global
    content     text NOT NULL,
    read        boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

-- =====================================================
-- Row Level Security (RLS) Policies
-- =====================================================

-- social_posts: Todos ven, autenticados crean/borran propias
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "posts_select" ON public.social_posts FOR SELECT USING (true);
CREATE POLICY "posts_insert" ON public.social_posts FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "posts_delete" ON public.social_posts FOR DELETE USING (auth.uid() = author_id);

-- social_comments: Todos ven, autenticados crean/borran propias
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comments_select" ON public.social_comments FOR SELECT USING (true);
CREATE POLICY "comments_insert" ON public.social_comments FOR INSERT WITH CHECK (auth.uid() = author_id);
CREATE POLICY "comments_delete" ON public.social_comments FOR DELETE USING (auth.uid() = author_id);

-- chat_messages: Solo ven sus propios mensajes o el canal global
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_global_select" ON public.chat_messages FOR SELECT USING (
    receiver_id IS NULL OR sender_id = auth.uid() OR receiver_id = auth.uid()
);
CREATE POLICY "chat_insert" ON public.chat_messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- =====================================================
-- Función RPC para incrementar likes de forma atómica
-- =====================================================
CREATE OR REPLACE FUNCTION increment_post_likes(post_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
    UPDATE public.social_posts
    SET likes_count = likes_count + 1
    WHERE id = post_id;
$$;

-- =====================================================
-- Habilitar Supabase Realtime en chat_messages
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
