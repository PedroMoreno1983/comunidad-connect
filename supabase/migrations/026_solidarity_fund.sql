-- =====================================================================
-- Migration: 026_solidarity_fund.sql
-- Implementación del Fondo de Solidaridad Vecinal (Real, No Simulado)
-- =====================================================================

-- 1. Tabla de Fondos Solidarios (Uno por comunidad)
CREATE TABLE IF NOT EXISTS public.solidarity_funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE UNIQUE,
  balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Tabla de Contribuciones (Aportes/Redondeos de Residentes)
CREATE TABLE IF NOT EXISTS public.solidarity_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('round_up', 'donation')),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Tabla de Postulaciones (Solicitudes Confidenciales de Apoyo)
CREATE TABLE IF NOT EXISTS public.solidarity_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('unemployment', 'pensioner', 'medical', 'emergency')),
  description TEXT NOT NULL,
  amount_requested NUMERIC(10, 2) NOT NULL CHECK (amount_requested > 0),
  amount_approved NUMERIC(10, 2) DEFAULT 0.00,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- 4. Tabla de Tareas Vecinales para Retribución de Horas
CREATE TABLE IF NOT EXISTS public.solidarity_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('gardening', 'packages', 'recycling', 'digital')),
  hours NUMERIC(4, 1) NOT NULL CHECK (hours > 0),
  status TEXT DEFAULT 'free' CHECK (status IN ('free', 'reserved', 'completed')),
  reserved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reserved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  pin_code TEXT DEFAULT '1234',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Tabla de Libro Diario / Historial de Solidaridad (Ledger)
CREATE TABLE IF NOT EXISTS public.solidarity_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('contribution', 'subsidize', 'work_offset')),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  hours NUMERIC(4, 1) NOT NULL DEFAULT 0.0,
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- HABILITAR ROW LEVEL SECURITY (RLS) MULTI-TENANT
-- =====================================================================

ALTER TABLE public.solidarity_funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solidarity_ledger ENABLE ROW LEVEL SECURITY;

-- 1. POLÍTICAS DE FONDOS (solidarity_funds)
CREATE POLICY "funds_select_community" ON public.solidarity_funds FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
);
CREATE POLICY "funds_admin_all" ON public.solidarity_funds FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 2. POLÍTICAS DE CONTRIBUCIONES (solidarity_contributions)
CREATE POLICY "contributions_select_own" ON public.solidarity_contributions FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (user_id = auth.uid() OR (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin')
);
CREATE POLICY "contributions_insert_own" ON public.solidarity_contributions FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND user_id = auth.uid()
);

-- 3. POLÍTICAS DE POSTULACIONES (solidarity_applications)
CREATE POLICY "applications_select_own_or_admin" ON public.solidarity_applications FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (user_id = auth.uid() OR (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin')
);
CREATE POLICY "applications_insert_own" ON public.solidarity_applications FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND user_id = auth.uid()
);
CREATE POLICY "applications_admin_all" ON public.solidarity_applications FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 4. POLÍTICAS DE TAREAS (solidarity_tasks)
CREATE POLICY "tasks_select_community" ON public.solidarity_tasks FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
);
CREATE POLICY "tasks_update_community_members" ON public.solidarity_tasks FOR UPDATE USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
);
CREATE POLICY "tasks_admin_all" ON public.solidarity_tasks FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- 5. POLÍTICAS DE LIBRO DIARIO (solidarity_ledger)
CREATE POLICY "ledger_select_community" ON public.solidarity_ledger FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
);
CREATE POLICY "ledger_admin_all" ON public.solidarity_ledger FOR ALL USING (
  community_id = (SELECT community_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1) = 'admin'
);

-- =====================================================================
-- HABILITAR REALTIME Y TRIGGERS DE CONTROL
-- =====================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.solidarity_funds;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solidarity_contributions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solidarity_applications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solidarity_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.solidarity_ledger;

-- Trigger para auto-crear un balance de fondo al insertar una comunidad
CREATE OR REPLACE FUNCTION public.handle_new_community_solidarity()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.solidarity_funds (community_id, balance)
  VALUES (NEW.id, 180000.00); -- Fondo inicial semilla de $180.000
  
  -- Insertar entrada inicial en el libro diario de la comunidad
  INSERT INTO public.solidarity_ledger (community_id, entry_type, amount, description)
  VALUES (NEW.id, 'contribution', 180000.00, 'Fondo inicial semilla asignado para apoyo mutuo vecinal');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_community_created_solidarity
  AFTER INSERT ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_community_solidarity();

-- Semillar fondos para las comunidades existentes
INSERT INTO public.solidarity_funds (community_id, balance)
SELECT id, 180000.00 FROM public.communities
ON CONFLICT (community_id) DO NOTHING;

INSERT INTO public.solidarity_ledger (community_id, entry_type, amount, description)
SELECT id, 'contribution', 180000.00, 'Fondo inicial semilla asignado para apoyo mutuo vecinal'
FROM public.communities c
WHERE NOT EXISTS (
  SELECT 1 FROM public.solidarity_ledger l WHERE l.community_id = c.id AND l.description = 'Fondo inicial semilla asignado para apoyo mutuo vecinal'
);

-- Semillar un set inicial de tareas en las comunidades existentes
INSERT INTO public.solidarity_tasks (community_id, title, category, hours, status)
SELECT id, 'Mantenimiento del huerto e invernadero', 'gardening', 2.0, 'free' FROM public.communities
UNION ALL
SELECT id, 'Clasificación de encomiendas (tarde)', 'packages', 1.5, 'free' FROM public.communities
UNION ALL
SELECT id, 'Clasificación y pesaje en punto verde', 'recycling', 3.0, 'free' FROM public.communities
UNION ALL
SELECT id, 'Capacitación digital de la app para tercera edad', 'digital', 1.0, 'free' FROM public.communities;
