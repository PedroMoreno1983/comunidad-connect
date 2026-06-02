-- =====================================================================
-- ComunidadConnect (CoCo) - Esquema de Base de Datos Maestro
-- Versión: 6.0 (Producción Hardened)
-- =====================================================================
-- Este archivo contiene la estructura completa y unificada del esquema de la base de datos
-- de ComunidadConnect, incluyendo soporte multi-tenant (SaaS), control de acceso por roles (RLS),
-- marketplace vecinal de modalidad múltiple, sistema IoT e historial del agente IA.
--
-- Ejecución: Puedes pegar este script directamente en el SQL Editor de Supabase.
-- =====================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- Limpieza preventiva de tablas duplicadas o conflictivas
DROP TABLE IF EXISTS public.votes CASCADE;
DROP TABLE IF EXISTS public.poll_votes CASCADE;
DROP TABLE IF EXISTS public.poll_options CASCADE;
DROP TABLE IF EXISTS public.polls CASCADE;

-- =====================================================================
-- 1. ESTRUCTURA SAAS MULTI-TENANT & FACTURACIÓN
-- =====================================================================

-- Tabla de Planes / Tiers de Precios
CREATE TABLE IF NOT EXISTS public.pricing_tiers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  price_per_unit NUMERIC(10, 2) NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  features JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabla de Comunidades (El central Tenant)
CREATE TABLE IF NOT EXISTS public.communities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  address TEXT,
  tier_id UUID REFERENCES public.pricing_tiers(id) ON DELETE SET NULL,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'active' CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 2. USUARIOS Y PERFILES (INTEGRACIÓN AUTH SUPABASE)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT, -- Compatibilidad con api.ts y supabaseServices.ts
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('superadmin', 'admin', 'resident', 'concierge')),
  avatar_url TEXT,
  phone TEXT,
  department_number TEXT,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  whatsapp_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 3. UNIDADES / DEPARTAMENTOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tower TEXT NOT NULL,
  number TEXT NOT NULL,
  floor INTEGER NOT NULL,
  type TEXT DEFAULT 'apartment',
  resident_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  owner_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vincular perfil a unidad si es residente
ALTER TABLE public.profiles DROP COLUMN IF EXISTS unit_id;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL;

-- =====================================================================
-- 4. CONTROL HÍDRICO (LECTURAS DE AGUA E IoT)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.water_readings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  reading_value NUMERIC(10, 2) NOT NULL,
  reading_date DATE NOT NULL,
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unit_id, month, year)
);

-- =====================================================================
-- 5. MARKETPLACE VECINAL (MODALIDADES DE INTERCAMBIO Y MULTI-IMAGEN)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.marketplace_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price NUMERIC(10, 2) NOT NULL DEFAULT 0,
  category TEXT NOT NULL CHECK (category IN ('electronics', 'furniture', 'clothing', 'other')),
  image_url TEXT, -- Imagen principal de portada
  images TEXT[] DEFAULT '{}', -- Soporte para múltiples fotos
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'hidden')),
  allow_sale BOOLEAN NOT NULL DEFAULT TRUE, -- Acepta dinero
  allow_swap BOOLEAN NOT NULL DEFAULT FALSE, -- Acepta permuta (swap)
  swap_details TEXT DEFAULT '',
  allow_barter BOOLEAN NOT NULL DEFAULT FALSE, -- Acepta trueque (barter)
  barter_details TEXT DEFAULT '',
  payment_status TEXT NOT NULL DEFAULT 'none' CHECK (payment_status IN ('none', 'pending', 'completed')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  embedding_voyage vector(1024), -- Vector representation for semantic search (Voyage AI 1024-d)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 6. ESPACES COMUNES & RESERVAS (AMENITIES)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.amenities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  max_capacity INTEGER DEFAULT 0,
  hourly_rate NUMERIC(10, 2) DEFAULT 0,
  icon_name TEXT,
  gradient TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  amenity_id UUID REFERENCES public.amenities(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  notes TEXT,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 7. FEED DE COMUNICACIONES Y AVISOS OFICIALES
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.announcements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_name TEXT DEFAULT 'Administración',
  priority TEXT DEFAULT 'info' CHECK (priority IN ('info', 'alert', 'event')),
  is_pinned BOOLEAN DEFAULT FALSE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 8. VOTACIONES COMUNITARIAS (POLLS)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.polls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  category TEXT NOT NULL DEFAULT 'community' CHECK (category IN ('maintenance', 'community', 'rules', 'other')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE NOT NULL,
  text TEXT NOT NULL,
  votes INTEGER DEFAULT 0, -- Caché de votos acumulados
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  poll_id UUID REFERENCES public.polls(id) ON DELETE CASCADE NOT NULL,
  option_id UUID REFERENCES public.poll_options(id) ON DELETE CASCADE NOT NULL,
  user_id UUID NOT NULL, -- Referencia relajada para compatibilidad historica de sesiones
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

-- =====================================================================
-- 9. GASTOS COMUNES Y COBROS (INTEGRACIÓN FACTURA/BOLETA CHILE)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  month TEXT NOT NULL, -- Formato YYYY-MM
  year INTEGER NOT NULL,
  total_amount NUMERIC(10, 2) NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_metadata JSONB DEFAULT '{}'::jsonb, -- Datos tributarios (Haulmer Link, boleta electrónica, etc.)
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unit_id, month, year)
);

CREATE TABLE IF NOT EXISTS public.expense_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES public.expenses(id) ON DELETE CASCADE NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('water', 'electricity', 'salaries', 'maintenance', 'security', 'other')),
  label TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL
);

-- =====================================================================
-- 10. SEGURIDAD Y ACCESOS (CONSERJERÍA, VISITAS, PAQUETES)
-- =====================================================================

-- Invitaciones de Código QR dinámicos
CREATE TABLE IF NOT EXISTS public.qr_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  resident_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
  guest_name TEXT NOT NULL,
  guest_dni TEXT,
  qr_code TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_to TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired', 'cancelled')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bitácora de Visitantes
CREATE TABLE IF NOT EXISTS public.visitor_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  visitor_name TEXT NOT NULL,
  unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE,
  entry_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_time TIMESTAMPTZ,
  purpose TEXT,
  registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Encomiendas y Paquetes
CREATE TABLE IF NOT EXISTS public.packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_unit_id UUID REFERENCES public.units(id) ON DELETE CASCADE NOT NULL,
  description TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  picked_up_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'picked-up')),
  registered_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 11. DIRECTORIO DE PROVEEDORES Y SOLICITUD DE SERVICIOS
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.service_providers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('plumbing', 'electrical', 'locksmith', 'cleaning', 'general')),
  rating NUMERIC(2, 1) NOT NULL DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  contact_phone TEXT NOT NULL,
  email TEXT,
  photo TEXT,
  bio TEXT,
  years_experience INTEGER DEFAULT 0,
  specialties TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  hourly_rate NUMERIC(10, 2),
  availability TEXT DEFAULT 'available' CHECK (availability IN ('available', 'busy', 'unavailable')),
  response_time TEXT DEFAULT '< 24 horas',
  completed_jobs INTEGER DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  review_count INTEGER DEFAULT 0,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID NOT NULL REFERENCES public.service_providers(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  preferred_date DATE NOT NULL,
  preferred_time TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  provider_id UUID REFERENCES public.service_providers(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL,
  service_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provider_id, user_id)
);

-- =====================================================================
-- 12. RED SOCIAL CONDOMINIAL (SOCIAL FEED)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.social_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  image_url TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.social_comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID REFERENCES public.social_posts(id) ON DELETE CASCADE NOT NULL,
  author_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  content TEXT NOT NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 13. CONVIVENCIA ACTIVA, BANCO DE TIEMPO Y ABASTO COMUNITARIO
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.neighbor_mediations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reporter_name TEXT NOT NULL,
  target_unit TEXT NOT NULL,
  observation TEXT NOT NULL,
  feeling TEXT NOT NULL,
  need TEXT NOT NULL,
  request TEXT NOT NULL,
  drafted_message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'drafted' CHECK (status IN ('drafted', 'sent', 'agreement', 'escalated')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.time_bank_offers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  neighbor_name TEXT NOT NULL,
  unit_label TEXT NOT NULL,
  skill TEXT NOT NULL,
  description TEXT NOT NULL,
  availability TEXT NOT NULL,
  credits INTEGER NOT NULL DEFAULT 1,
  requests_count INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('tools', 'care', 'digital', 'home', 'learning', 'other')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.collective_purchase_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  supplier TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other' CHECK (category IN ('water', 'gas', 'cleaning', 'food', 'eco', 'other')),
  unit_price INTEGER NOT NULL DEFAULT 0,
  retail_price INTEGER NOT NULL DEFAULT 0,
  minimum_participants INTEGER NOT NULL DEFAULT 1,
  participants INTEGER NOT NULL DEFAULT 1,
  deadline DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'ready', 'ordered')),
  organizer TEXT NOT NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.community_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'otro' CHECK (area IN ('huerto', 'reciclaje', 'cuidados', 'mascotas', 'cultura', 'otro')),
  description TEXT NOT NULL,
  impact TEXT NOT NULL,
  participants INTEGER NOT NULL DEFAULT 1,
  needed TEXT NOT NULL,
  coco_insight TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'forming' CHECK (status IN ('active', 'forming', 'completed')),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 13. NOTIFICACIONES REALTIME Y ALERTAS PWA
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('info', 'success', 'warning', 'alert')),
  category TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  read BOOLEAN DEFAULT FALSE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 14. AULA INTERACTIVA & CAPACITACIÓN MULTI-AGENTE (TRAINING)
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.training_modules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  target_audience TEXT DEFAULT 'all' CHECK (target_audience IN ('resident', 'concierge', 'admin', 'all')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.training_lessons (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL, -- Pizarra en Markdown
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.user_training_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  module_id UUID REFERENCES public.training_modules(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'started' CHECK (status IN ('started', 'completed')),
  score INTEGER DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, module_id)
);

-- =====================================================================
-- 15. COCO AI AGENT - CASOS E HISTORIAL DE CONVERSACIÓN
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.coco_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'escalated')),
  description TEXT,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.coco_case_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID REFERENCES public.coco_cases(id) ON DELETE CASCADE NOT NULL,
  actor TEXT NOT NULL CHECK (actor IN ('user', 'coco', 'admin')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- 16. VALORES SEMILLA POR DEFECTO
-- =====================================================================

-- Inserción de Tiers de Precios
INSERT INTO public.pricing_tiers (id, name, price_per_unit, base_price, features) VALUES
('11111111-1111-1111-1111-111111111111', 'Essential', 490, 19990, '{"amenities": false, "coco_ai": false, "maintenance": false}'::jsonb),
('22222222-2222-2222-2222-222222222222', 'Pro', 690, 34990, '{"amenities": true, "coco_ai": true, "maintenance": true}'::jsonb),
('33333333-3333-3333-3333-333333333333', 'Enterprise', 890, 0, '{"amenities": true, "coco_ai": true, "maintenance": true, "custom_roles": true}'::jsonb)
ON CONFLICT (name) DO UPDATE 
SET price_per_unit = EXCLUDED.price_per_unit, 
    base_price = EXCLUDED.base_price, 
    features = EXCLUDED.features;

-- Inserción de la Comunidad por Defecto (Demo)
INSERT INTO public.communities (id, name, address, tier_id) VALUES 
('00000000-0000-0000-0000-000000000000', 'Condominio Demo Principal', 'Av. Siempreviva 742', '22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- 17. TRIGGER AUTOMÁTICO DE REGISTRO DE USUARIOS
-- =====================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_community_id UUID;
  v_name TEXT;
BEGIN
  -- Obtener community_id de los metadatos de auth del usuario al registrarse
  IF (NEW.raw_user_meta_data->>'community_id') IS NOT NULL AND (NEW.raw_user_meta_data->>'community_id') <> '' THEN
    v_community_id := (NEW.raw_user_meta_data->>'community_id')::UUID;
  ELSE
    v_community_id := '00000000-0000-0000-0000-000000000000'::UUID;
  END IF;

  v_name := COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', NEW.email);

  INSERT INTO public.profiles (id, name, full_name, email, role, community_id)
  VALUES (
    NEW.id,
    v_name,
    v_name,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'resident'),
    v_community_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Crear trigger de inserción en auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================================
-- 18. SEGURIDAD DE ROW LEVEL SECURITY (RLS) GENERAL
-- =====================================================================

ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.water_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qr_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visitor_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.neighbor_mediations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.time_bank_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collective_purchase_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Políticas de Acceso Básico para Perfiles (Visualizar todos para el Directorio, actualizar propio)
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Políticas de Multi-Tenant por defecto (Filtro estricto por community_id del perfil del usuario autenticado)
CREATE POLICY "tenant_communities_select" ON public.communities FOR SELECT USING (
  id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_units_select" ON public.units FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_marketplace_select" ON public.marketplace_items FOR SELECT USING (true); -- Marketplace es abierto para lectura
CREATE POLICY "tenant_marketplace_insert" ON public.marketplace_items FOR INSERT WITH CHECK (
  auth.uid() = seller_id AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_marketplace_update" ON public.marketplace_items FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "tenant_amenities_select" ON public.amenities FOR SELECT USING (true);
CREATE POLICY "tenant_amenities_insert" ON public.amenities FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "tenant_amenities_update" ON public.amenities FOR UPDATE USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "tenant_bookings_select" ON public.bookings FOR SELECT USING (
  auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);
CREATE POLICY "tenant_bookings_insert" ON public.bookings FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tenant_announcements_select" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "tenant_announcements_insert" ON public.announcements FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);

CREATE POLICY "tenant_polls_select" ON public.polls FOR SELECT USING (true);
CREATE POLICY "tenant_poll_options_select" ON public.poll_options FOR SELECT USING (true);
CREATE POLICY "tenant_poll_votes_select" ON public.poll_votes FOR SELECT USING (true);
CREATE POLICY "tenant_poll_votes_insert" ON public.poll_votes FOR INSERT WITH CHECK (true); -- Habilitado para insercion controlada desde cliente

CREATE POLICY "tenant_neighbor_mediations_select" ON public.neighbor_mediations FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_neighbor_mediations_insert" ON public.neighbor_mediations FOR INSERT WITH CHECK (
  reporter_id = auth.uid() AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_neighbor_mediations_update" ON public.neighbor_mediations FOR UPDATE USING (
  reporter_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);

CREATE POLICY "tenant_time_bank_select" ON public.time_bank_offers FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_time_bank_insert" ON public.time_bank_offers FOR INSERT WITH CHECK (
  profile_id = auth.uid() AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_time_bank_update" ON public.time_bank_offers FOR UPDATE USING (
  profile_id = auth.uid()
  OR community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "tenant_collective_purchases_select" ON public.collective_purchase_campaigns FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_collective_purchases_insert" ON public.collective_purchase_campaigns FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_collective_purchases_update" ON public.collective_purchase_campaigns FOR UPDATE USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

CREATE POLICY "tenant_community_projects_select" ON public.community_projects FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_community_projects_insert" ON public.community_projects FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_community_projects_update" ON public.community_projects FOR UPDATE USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);

-- Políticas de Seguridad para Proveedores de Servicios
CREATE POLICY "tenant_service_providers_select" ON public.service_providers FOR SELECT USING (true);
CREATE POLICY "tenant_service_providers_insert" ON public.service_providers FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant_service_providers_update" ON public.service_providers FOR UPDATE USING (auth.uid() = user_id);

-- Políticas de Seguridad para Solicitudes de Servicios
CREATE POLICY "tenant_service_requests_select" ON public.service_requests FOR SELECT USING (
  auth.uid() = user_id 
  OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
);
CREATE POLICY "tenant_service_requests_insert" ON public.service_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "tenant_service_requests_update" ON public.service_requests FOR UPDATE USING (
  auth.uid() = user_id 
  OR provider_id IN (SELECT id FROM public.service_providers WHERE user_id = auth.uid())
);

-- Crear índices de optimización para búsquedas y RLS
CREATE INDEX IF NOT EXISTS idx_profiles_community ON public.profiles(community_id);
CREATE INDEX IF NOT EXISTS idx_units_community ON public.units(community_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_community ON public.marketplace_items(community_id);
CREATE INDEX IF NOT EXISTS idx_bookings_user ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_expenses_unit ON public.expenses(unit_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_neighbor_mediations_community ON public.neighbor_mediations(community_id, created_at);
CREATE INDEX IF NOT EXISTS idx_time_bank_community ON public.time_bank_offers(community_id, category);
CREATE INDEX IF NOT EXISTS idx_collective_purchases_community ON public.collective_purchase_campaigns(community_id, status);
CREATE INDEX IF NOT EXISTS idx_community_projects_community ON public.community_projects(community_id, status);

-- Índice HNSW y función de búsqueda semántica para Marketplace (Voyage AI)
CREATE INDEX IF NOT EXISTS marketplace_embedding_voyage_idx
  ON public.marketplace_items USING hnsw (embedding_voyage vector_cosine_ops);

CREATE OR REPLACE FUNCTION search_marketplace_semantic(
  query_embedding vector(1024),
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  price numeric,
  category text,
  image_url text,
  images text[],
  seller_id uuid,
  status text,
  allow_sale boolean,
  allow_swap boolean,
  swap_details text,
  allow_barter boolean,
  barter_details text,
  payment_status text,
  created_at timestamptz,
  similarity real
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    id,
    title,
    description,
    price,
    category,
    image_url,
    images,
    seller_id,
    status,
    allow_sale,
    allow_swap,
    swap_details,
    allow_barter,
    barter_details,
    payment_status,
    created_at,
    1 - (embedding_voyage <=> query_embedding) AS similarity
  FROM public.marketplace_items
  WHERE
    status = 'available'
    AND embedding_voyage IS NOT NULL
  ORDER BY embedding_voyage <=> query_embedding
  LIMIT match_count;
$$;
