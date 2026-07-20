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
  address_latitude NUMERIC(10, 7),
  address_longitude NUMERIC(10, 7),
  address_place_id TEXT,
  address_geocoding_source TEXT,
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
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
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
  community_id UUID REFERENCES public.communities(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  last_slide_index INTEGER NOT NULL DEFAULT 0 CHECK (last_slide_index >= 0),
  score INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
  v_role TEXT;
  v_invite_code TEXT;
  v_department TEXT;
  v_unit_id UUID;
  v_tower TEXT;
  v_floor INTEGER;
  v_numeric_part TEXT;
BEGIN
  -- Never trust role or community_id supplied by the browser. The invitation
  -- code is the only source of truth and is resolved again inside PostgreSQL
  -- for every auth user creation (fixed in migration 035; this master schema
  -- previously reverted to the vulnerable client-trusting version).
  v_invite_code := UPPER(BTRIM(COALESCE(NEW.raw_user_meta_data->>'invite_code', '')));

  SELECT c.id,
         CASE
           WHEN c.resident_code = v_invite_code THEN 'resident'
           WHEN c.concierge_code = v_invite_code THEN 'concierge'
           WHEN c.admin_code = v_invite_code THEN 'admin'
         END
    INTO v_community_id, v_role
  FROM public.communities c
  WHERE c.resident_code = v_invite_code
     OR c.concierge_code = v_invite_code
     OR c.admin_code = v_invite_code
  LIMIT 1;

  IF v_community_id IS NULL OR v_role IS NULL THEN
    RAISE EXCEPTION 'A valid invitation code is required';
  END IF;

  v_name := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'name', ''),
    NEW.email
  );
  v_department := NULLIF(BTRIM(COALESCE(
    NEW.raw_user_meta_data->>'department_number',
    NEW.raw_user_meta_data->>'unit_number',
    ''
  )), '');

  INSERT INTO public.profiles (id, name, full_name, email, role, community_id, department_number)
  VALUES (NEW.id, v_name, v_name, NEW.email, v_role, v_community_id, v_department)
  ON CONFLICT (id) DO UPDATE SET
    name = COALESCE(public.profiles.name, EXCLUDED.name),
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    email = COALESCE(public.profiles.email, EXCLUDED.email),
    role = EXCLUDED.role,
    community_id = EXCLUDED.community_id,
    department_number = COALESCE(public.profiles.department_number, EXCLUDED.department_number);

  IF v_role = 'resident' AND v_department IS NOT NULL THEN
    SELECT id INTO v_unit_id
    FROM public.units
    WHERE community_id = v_community_id
      AND number = v_department
    LIMIT 1;

    IF v_unit_id IS NULL THEN
      v_tower := COALESCE((regexp_match(v_department, '^(?:torre\s*)?([A-Za-z])[-\s]?'))[1], 'A');
      v_numeric_part := (regexp_match(v_department, '\d+'))[1];
      v_floor := CASE
        WHEN v_numeric_part IS NOT NULL AND v_numeric_part::INTEGER >= 100 THEN GREATEST(1, FLOOR(v_numeric_part::INTEGER / 100)::INTEGER)
        ELSE 1
      END;

      INSERT INTO public.units (community_id, tower, number, floor, type, owner_id, resident_profile_id)
      VALUES (v_community_id, UPPER(v_tower), v_department, v_floor, 'apartment', NEW.id, NEW.id)
      RETURNING id INTO v_unit_id;
    ELSE
      UPDATE public.units
      SET owner_id = COALESCE(owner_id, NEW.id),
          resident_profile_id = COALESCE(resident_profile_id, NEW.id)
      WHERE id = v_unit_id;
    END IF;

    UPDATE public.profiles
    SET unit_id = v_unit_id,
        department_number = v_department
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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

-- Funciones SECURITY DEFINER que leen el propio perfil sin re-disparar RLS sobre
-- profiles -- necesarias porque cualquier policy ON profiles que subconsulte
-- profiles directamente entra en recursión infinita (Postgres la detecta y
-- lanza error en cada query que toque profiles/communities/marketplace/etc.).
CREATE OR REPLACE FUNCTION public.get_my_community_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- Políticas de Acceso Básico para Perfiles (Visualizar todos para el Directorio, actualizar propio)
CREATE POLICY "profiles_select_all" ON public.profiles FOR SELECT USING (
  community_id = public.get_my_community_id()
);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- profiles_update_own has no WITH CHECK, so USING(auth.uid() = id) alone would let
-- any resident PATCH their own role/community_id/unit_id to escalate privileges or
-- hop tenants. Column-level REVOKE + a defensive trigger close that gap without
-- touching service_role (used by every legitimate signup/admin-action code path).
REVOKE UPDATE (role, community_id, unit_id) ON public.profiles FROM authenticated;

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'authenticated' THEN
    NEW.role := OLD.role;
    NEW.community_id := OLD.community_id;
    NEW.unit_id := OLD.unit_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Políticas de Multi-Tenant por defecto (Filtro estricto por community_id del perfil del usuario autenticado)
CREATE POLICY "tenant_communities_select" ON public.communities FOR SELECT USING (
  id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_units_select" ON public.units FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_marketplace_select" ON public.marketplace_items FOR SELECT USING (
  community_id = public.get_my_community_id()
);
CREATE POLICY "tenant_marketplace_insert" ON public.marketplace_items FOR INSERT WITH CHECK (
  auth.uid() = seller_id AND community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_marketplace_update" ON public.marketplace_items FOR UPDATE USING (auth.uid() = seller_id);

CREATE POLICY "tenant_amenities_select" ON public.amenities FOR SELECT USING (
  community_id = public.get_my_community_id()
);
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

CREATE POLICY "tenant_announcements_select" ON public.announcements FOR SELECT USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
);
CREATE POLICY "tenant_announcements_insert" ON public.announcements FOR INSERT WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND author_id = auth.uid()
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);
CREATE POLICY "tenant_announcements_update" ON public.announcements FOR UPDATE USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
) WITH CHECK (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);
CREATE POLICY "tenant_announcements_delete" ON public.announcements FOR DELETE USING (
  community_id = (SELECT community_id FROM public.profiles WHERE id = auth.uid())
  AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'concierge'))
);

CREATE POLICY "tenant_polls_select" ON public.polls FOR SELECT USING (
  community_id = public.get_my_community_id()
);
CREATE POLICY "tenant_poll_options_select" ON public.poll_options FOR SELECT USING (
  poll_id IN (SELECT id FROM public.polls WHERE community_id = public.get_my_community_id())
);
CREATE POLICY "tenant_poll_votes_select" ON public.poll_votes FOR SELECT USING (
  community_id = public.get_my_community_id()
);
-- user_id/community_id must match the caller -- otherwise any authenticated
-- client could stuff ballots by inserting votes attributed to other residents
-- or into another tenant's poll (WITH CHECK (true) allowed exactly that).
CREATE POLICY "tenant_poll_votes_insert" ON public.poll_votes FOR INSERT WITH CHECK (
  user_id = auth.uid() AND community_id = public.get_my_community_id()
);

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
CREATE POLICY "tenant_service_providers_select" ON public.service_providers FOR SELECT USING (
  community_id = public.get_my_community_id()
);
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

-- Tablas que quedaban sin RLS habilitado en el maestro (pricing_tiers, reviews,
-- training_*, coco_cases/events) -- en una instalación desde cero esto las deja
-- totalmente abiertas a PostgREST (sin política = sin protección alguna).
ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_training_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coco_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coco_case_events ENABLE ROW LEVEL SECURITY;

-- pricing_tiers: catálogo de planes, no es multi-tenant -- lectura pública
-- (necesaria antes del signup), escritura solo desde el backend.
CREATE POLICY "pricing_tiers_select_all" ON public.pricing_tiers FOR SELECT USING (true);
CREATE POLICY "pricing_tiers_service_role_write" ON public.pricing_tiers FOR ALL TO service_role USING (true) WITH CHECK (true);

-- reviews: visibles para todo autenticado del mismo tenant que el proveedor
-- (necesario para el directorio de proveedores), solo el propio autor escribe.
CREATE POLICY "reviews_select_same_tenant" ON public.reviews FOR SELECT USING (
  provider_id IN (SELECT id FROM public.service_providers WHERE community_id = public.get_my_community_id())
);
CREATE POLICY "reviews_insert_own" ON public.reviews FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "reviews_update_own" ON public.reviews FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "reviews_delete_own" ON public.reviews FOR DELETE USING (auth.uid() = user_id);

-- training_modules: módulos globales (community_id NULL) o del propio tenant.
CREATE POLICY "training_modules_select" ON public.training_modules FOR SELECT TO authenticated USING (
  community_id IS NULL OR community_id = public.get_my_community_id()
);
CREATE POLICY "training_modules_admin_write" ON public.training_modules FOR ALL TO authenticated USING (
  public.get_my_role() = 'admin' AND (community_id IS NULL OR community_id = public.get_my_community_id())
) WITH CHECK (
  public.get_my_role() = 'admin' AND (community_id IS NULL OR community_id = public.get_my_community_id())
);

-- training_lessons: heredan la visibilidad del módulo padre.
CREATE POLICY "training_lessons_select" ON public.training_lessons FOR SELECT TO authenticated USING (
  module_id IN (
    SELECT id FROM public.training_modules
    WHERE community_id IS NULL OR community_id = public.get_my_community_id()
  )
);
CREATE POLICY "training_lessons_admin_write" ON public.training_lessons FOR ALL TO authenticated USING (
  public.get_my_role() = 'admin'
) WITH CHECK (
  public.get_my_role() = 'admin'
);

-- user_training_progress: cada usuario ve/edita solo su propio progreso; el
-- admin del tenant puede ver el progreso de su propia comunidad.
CREATE POLICY "user_training_progress_own" ON public.user_training_progress FOR SELECT USING (
  user_id = auth.uid()
  OR (public.get_my_role() = 'admin' AND community_id = public.get_my_community_id())
);
CREATE POLICY "user_training_progress_insert_own" ON public.user_training_progress FOR INSERT WITH CHECK (
  user_id = auth.uid()
);
CREATE POLICY "user_training_progress_update_own" ON public.user_training_progress FOR UPDATE USING (
  user_id = auth.uid()
);

-- coco_cases / coco_case_events: mismo aislamiento por tenant que la versión
-- ya endurecida en producción (017_coco_cases.sql), adaptado a las columnas
-- de esta tabla base (sin unit_id/urgency/category, que se agregan en 017).
CREATE POLICY "coco_cases_select_community" ON public.coco_cases FOR SELECT USING (
  community_id = public.get_my_community_id()
  AND (user_id = auth.uid() OR public.get_my_role() IN ('admin', 'concierge'))
);
CREATE POLICY "coco_cases_insert_own" ON public.coco_cases FOR INSERT WITH CHECK (
  community_id = public.get_my_community_id()
  AND (user_id = auth.uid() OR public.get_my_role() IN ('admin', 'concierge'))
);
CREATE POLICY "coco_cases_update_staff" ON public.coco_cases FOR UPDATE USING (
  community_id = public.get_my_community_id() AND public.get_my_role() IN ('admin', 'concierge')
);

CREATE POLICY "coco_case_events_select" ON public.coco_case_events FOR SELECT USING (
  case_id IN (
    SELECT id FROM public.coco_cases
    WHERE community_id = public.get_my_community_id()
      AND (user_id = auth.uid() OR public.get_my_role() IN ('admin', 'concierge'))
  )
);
CREATE POLICY "coco_case_events_insert" ON public.coco_case_events FOR INSERT WITH CHECK (
  case_id IN (
    SELECT id FROM public.coco_cases
    WHERE community_id = public.get_my_community_id()
      AND (user_id = auth.uid() OR public.get_my_role() IN ('admin', 'concierge'))
  )
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

-- =====================================================
-- MARKETPLACE MESSAGING (mirrors migration 046)
-- =====================================================
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

-- Commercial lead capture: persistent, server-only and delivery-aware.
BEGIN;

CREATE TABLE IF NOT EXISTS public.commercial_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE,
  admin_name TEXT NOT NULL,
  admin_email TEXT NOT NULL,
  condo_name TEXT NOT NULL,
  message TEXT,
  source TEXT NOT NULL DEFAULT 'landing_contact'
    CHECK (source IN ('landing_contact', 'commercial_tour', 'onboarding_preactivation')),
  status TEXT NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'notified', 'delivery_pending', 'contacted', 'closed')),
  customer_email_sent_at TIMESTAMPTZ,
  team_email_sent_at TIMESTAMPTZ,
  customer_email_id TEXT,
  team_email_id TEXT,
  delivery_error TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commercial_leads_created_at_idx
  ON public.commercial_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_leads_status_idx
  ON public.commercial_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS commercial_leads_email_idx
  ON public.commercial_leads (LOWER(admin_email));

ALTER TABLE public.commercial_leads ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.commercial_leads FROM anon;
REVOKE ALL ON public.commercial_leads FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.commercial_leads TO service_role;

COMMIT;

-- Per-community IoT webhook secret. Nullable/opt-in: communities without one
-- fall back to the legacy global IOT_WEBHOOK_SECRET env var so existing
-- deployed gateways keep working during rollout, but a stolen device secret
-- can no longer be used to spoof sensor events for OTHER communities once a
-- per-community secret is set.
ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS iot_webhook_secret TEXT;

-- Twilio's webhook signature scheme has no timestamp/nonce, so a captured
-- valid request can otherwise be replayed indefinitely. Twilio's own
-- MessageSid is unique per message; recording it lets us reject replays
-- (and duplicate Twilio retries) without needing a time-window heuristic.
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  message_sid TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS whatsapp_processed_messages_processed_at_idx
  ON public.whatsapp_processed_messages (processed_at);

ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.whatsapp_processed_messages FROM anon;
REVOKE ALL ON public.whatsapp_processed_messages FROM authenticated;
GRANT SELECT, INSERT, DELETE ON public.whatsapp_processed_messages TO service_role;

-- Privacy compliance foundation (Ley 21.719).
CREATE TABLE IF NOT EXISTS public.privacy_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms', 'privacy_notice', 'whatsapp', 'ai_processing', 'sensitive_data')),
  action TEXT NOT NULL CHECK (action IN ('granted', 'withdrawn')),
  policy_version TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('signup', 'profile', 'privacy_center', 'admin_onboarding')),
  subject_email TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS privacy_consent_events_user_idx ON public.privacy_consent_events (user_id, consent_type, created_at DESC);
CREATE INDEX IF NOT EXISTS privacy_consent_events_community_idx ON public.privacy_consent_events (community_id, created_at DESC);
ALTER TABLE public.privacy_consent_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "privacy_consent_events_select_own" ON public.privacy_consent_events FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.privacy_consent_events FROM anon, authenticated;
GRANT SELECT ON public.privacy_consent_events TO authenticated;
GRANT SELECT, INSERT ON public.privacy_consent_events TO service_role;

CREATE TABLE IF NOT EXISTS public.data_subject_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('access', 'rectification', 'deletion', 'opposition', 'portability')),
  status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'identity_check', 'in_progress', 'completed', 'rejected', 'cancelled')),
  subject_email TEXT NOT NULL,
  details TEXT,
  response_summary TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS data_subject_requests_user_idx ON public.data_subject_requests (user_id, received_at DESC);
CREATE INDEX IF NOT EXISTS data_subject_requests_status_idx ON public.data_subject_requests (status, due_at);
ALTER TABLE public.data_subject_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "data_subject_requests_select_own" ON public.data_subject_requests FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE INSERT, UPDATE, DELETE ON public.data_subject_requests FROM anon, authenticated;
GRANT SELECT ON public.data_subject_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.data_subject_requests TO service_role;
ALTER TABLE public.profiles ALTER COLUMN whatsapp_enabled SET DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS solidarity_round_up_expense_unique
  ON public.solidarity_contributions (expense_id)
  WHERE type = 'round_up' AND expense_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_verified_solidarity_round_up(
  p_community_id UUID, p_user_id UUID, p_expense_id UUID, p_amount NUMERIC
) RETURNS NUMERIC LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_balance NUMERIC;
BEGIN
  IF p_amount <= 0 OR p_amount > 999 THEN RAISE EXCEPTION 'invalid-round-up-amount'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.expenses e JOIN public.profiles p ON p.unit_id = e.unit_id
    WHERE e.id = p_expense_id AND e.community_id = p_community_id AND e.status = 'paid'
      AND p.id = p_user_id AND p.community_id = p_community_id
  ) THEN RAISE EXCEPTION 'expense-not-paid-or-not-owned'; END IF;
  INSERT INTO public.solidarity_contributions (community_id, user_id, amount, type, expense_id)
    VALUES (p_community_id, p_user_id, p_amount, 'round_up', p_expense_id);
  INSERT INTO public.solidarity_funds (community_id, balance) VALUES (p_community_id, p_amount)
    ON CONFLICT (community_id) DO UPDATE SET balance = public.solidarity_funds.balance + EXCLUDED.balance, updated_at = NOW()
    RETURNING balance INTO v_balance;
  INSERT INTO public.solidarity_ledger (community_id, entry_type, amount, hours, description)
    VALUES (p_community_id, 'contribution', p_amount, 0, 'Redondeo verificado de gasto común pagado');
  RETURN v_balance;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_verified_solidarity_round_up(UUID, UUID, UUID, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_verified_solidarity_round_up(UUID, UUID, UUID, NUMERIC) TO service_role;

CREATE OR REPLACE FUNCTION public.resolve_solidarity_application(
  p_community_id UUID,
  p_application_id UUID,
  p_status TEXT,
  p_amount_approved NUMERIC DEFAULT NULL
)
RETURNS TABLE (user_id UUID, category TEXT, approved_amount NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_application public.solidarity_applications%ROWTYPE;
  v_amount NUMERIC;
BEGIN
  IF p_status NOT IN ('approved', 'rejected') THEN RAISE EXCEPTION 'invalid-status'; END IF;
  SELECT * INTO v_application FROM public.solidarity_applications
    WHERE id = p_application_id AND community_id = p_community_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'application-not-found'; END IF;
  IF v_application.status <> 'pending' THEN RAISE EXCEPTION 'application-already-resolved'; END IF;
  IF p_status = 'approved' THEN
    v_amount := COALESCE(p_amount_approved, v_application.amount_requested);
    IF v_amount <= 0 OR v_amount > v_application.amount_requested THEN RAISE EXCEPTION 'invalid-approved-amount'; END IF;
    UPDATE public.solidarity_funds SET balance = balance - v_amount, updated_at = NOW()
      WHERE community_id = p_community_id AND balance >= v_amount;
    IF NOT FOUND THEN RAISE EXCEPTION 'insufficient-or-missing-fund'; END IF;
    UPDATE public.solidarity_applications SET status = 'approved', amount_approved = v_amount, resolved_at = NOW()
      WHERE id = p_application_id;
    INSERT INTO public.solidarity_ledger (community_id, entry_type, amount, hours, description)
      VALUES (p_community_id, 'subsidize', v_amount, 0, 'Subsidio solidario aprobado para una unidad anonimizada');
  ELSE
    v_amount := 0;
    UPDATE public.solidarity_applications SET status = 'rejected', amount_approved = 0, resolved_at = NOW()
      WHERE id = p_application_id;
  END IF;
  RETURN QUERY SELECT v_application.user_id, v_application.category, v_amount;
END;
$$;
REVOKE ALL ON FUNCTION public.resolve_solidarity_application(UUID, UUID, TEXT, NUMERIC) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_solidarity_application(UUID, UUID, TEXT, NUMERIC) TO service_role;

ALTER TABLE public.solidarity_applications
  ADD COLUMN IF NOT EXISTS sensitive_consent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sensitive_consent_version TEXT,
  ADD COLUMN IF NOT EXISTS sensitive_consent_scope TEXT;

ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS iot_autonomous_actions_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS iot_autonomy_enabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS iot_autonomy_enabled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
