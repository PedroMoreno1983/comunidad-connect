-- =====================================================
-- MIGRATION FIX: Correcciones de Schema para ComunidadConnect
-- Ejecutar en el SQL Editor de Supabase
-- Cubre: profiles.full_name, amenities.is_active,
--        tabla notifications, icons PWA
-- =====================================================

-- -------------------------------------------------------
-- 1. PROFILES: Agregar columna full_name si no existe
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'full_name'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN full_name text;
        UPDATE public.profiles p
        SET full_name = u.email
        FROM auth.users u
        WHERE p.id = u.id AND p.full_name IS NULL;
        RAISE NOTICE 'Columna full_name agregada a profiles';
    ELSE
        RAISE NOTICE 'Columna full_name ya existe en profiles';
    END IF;
END $$;

-- phone_number para WhatsApp
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='phone_number') THEN
        ALTER TABLE public.profiles ADD COLUMN phone_number text;
        RAISE NOTICE 'Columna phone_number agregada a profiles';
    END IF;
END $$;

-- whatsapp_enabled toggle
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name='whatsapp_enabled') THEN
        ALTER TABLE public.profiles ADD COLUMN whatsapp_enabled boolean DEFAULT false;
        RAISE NOTICE 'Columna whatsapp_enabled agregada a profiles';
    END IF;
END $$;

-- -------------------------------------------------------
-- 2. PROFILES: Agregar avatar_url si no existe
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'avatar_url'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN avatar_url text;
        RAISE NOTICE 'Columna avatar_url agregada a profiles';
    ELSE
        RAISE NOTICE 'Columna avatar_url ya existe en profiles';
    END IF;
END $$;

-- -------------------------------------------------------
-- 3. PROFILES: Agregar role si no existe
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'role'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN role text DEFAULT 'resident';
        RAISE NOTICE 'Columna role agregada a profiles';
    ELSE
        RAISE NOTICE 'Columna role ya existe en profiles';
    END IF;
END $$;

-- -------------------------------------------------------
-- 4. PROFILES: Agregar unit_id si no existe
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'unit_id'
    ) THEN
        ALTER TABLE public.profiles ADD COLUMN unit_id text;
        RAISE NOTICE 'Columna unit_id agregada a profiles';
    ELSE
        RAISE NOTICE 'Columna unit_id ya existe en profiles';
    END IF;
END $$;

-- -------------------------------------------------------
-- 5. AMENITIES: Agregar is_active si no existe
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'amenities'
          AND column_name = 'is_active'
    ) THEN
        ALTER TABLE public.amenities ADD COLUMN is_active boolean DEFAULT true;
        UPDATE public.amenities SET is_active = true WHERE is_active IS NULL;
        RAISE NOTICE 'Columna is_active agregada a amenities';
    ELSE
        RAISE NOTICE 'Columna is_active ya existe en amenities';
    END IF;
END $$;

-- -------------------------------------------------------
-- 6. NOTIFICATIONS: Crear tabla si no existe
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    type        text NOT NULL CHECK (type IN ('info', 'success', 'warning', 'alert')),
    category    text NOT NULL DEFAULT 'info',
    title       text NOT NULL,
    body        text NOT NULL,
    link        text,
    read        boolean DEFAULT false,
    created_at  timestamptz DEFAULT now()
);

-- RLS para notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_select'
    ) THEN
        CREATE POLICY "notifications_select" ON public.notifications
            FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_insert'
    ) THEN
        CREATE POLICY "notifications_insert" ON public.notifications
            FOR INSERT WITH CHECK (true);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_update'
    ) THEN
        CREATE POLICY "notifications_update" ON public.notifications
            FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_delete'
    ) THEN
        CREATE POLICY "notifications_delete" ON public.notifications
            FOR DELETE USING (auth.uid() = user_id);
    END IF;
END $$;

-- Habilitar Realtime (solo si no está ya agregada)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'notifications'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
        RAISE NOTICE 'notifications agregada a supabase_realtime';
    ELSE
        RAISE NOTICE 'notifications ya estaba en supabase_realtime';
    END IF;
END $$;

-- -------------------------------------------------------
-- 7. PROFILES RLS: Asegurar que los usuarios pueden
--    leer perfiles de otros (necesario para Directorio)
-- -------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_read_all'
    ) THEN
        CREATE POLICY "profiles_read_all" ON public.profiles
            FOR SELECT USING (true);
        RAISE NOTICE 'Policy profiles_read_all creada';
    ELSE
        RAISE NOTICE 'Policy profiles_read_all ya existe';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'profiles_update_own'
    ) THEN
        CREATE POLICY "profiles_update_own" ON public.profiles
            FOR UPDATE USING (auth.uid() = id);
        RAISE NOTICE 'Policy profiles_update_own creada';
    ELSE
        RAISE NOTICE 'Policy profiles_update_own ya existe';
    END IF;
END $$;

-- -------------------------------------------------------
-- VERIFICACIÓN FINAL
-- -------------------------------------------------------
SELECT
    table_name,
    column_name,
    data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'notifications', 'amenities')
ORDER BY table_name, column_name;
