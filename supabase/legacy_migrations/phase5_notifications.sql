-- =====================================================
-- Fase 5A: Sistema de Notificaciones In-App
-- Ejecutar en el SQL Editor de Supabase
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type        text NOT NULL CHECK (type IN ('info', 'success', 'warning', 'alert')),
    category    text NOT NULL DEFAULT 'info',  -- 'package', 'visit', 'reservation', 'payment', 'chat_dm', 'social_like'
    title       text NOT NULL,
    body        text NOT NULL,
    link        text,
    read        boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

-- RLS: cada usuario solo ve sus propias notificaciones
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "notifications_insert" ON public.notifications
    FOR INSERT WITH CHECK (true); -- Permitido para servicios del sistema

CREATE POLICY "notifications_update" ON public.notifications
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "notifications_delete" ON public.notifications
    FOR DELETE USING (auth.uid() = user_id);

-- Habilitar Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
