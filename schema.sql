-- =====================================================================
-- ComunidadConnect (CoCo) - Esquema de Base de Datos Maestro
-- Versión: 6.1 (Producción Hardened · reconciliado 2026-08-25)
-- =====================================================================
-- La fuente de verdad para aplicar cambios es supabase/migrations/.
-- Este archivo es el retrato consolidado del esquema y debe coincidir
-- con producción.
--
-- El 2026-08-25 se eliminaron 11 columnas que este archivo declaraba y
-- que NO existen en la base: announcements.is_pinned, bookings.notes,
-- coco_case_events.actor y .message, expenses.year y .total_amount,
-- packages.registered_by, profiles.phone (la real es phone_number),
-- social_posts.comments_count, user_training_progress.score y
-- .created_at. Ninguna estaba en uso, pero declarar columnas
-- inexistentes es justo lo que induce a escribir la consulta que
-- revienta en runtime: fue el origen del incidente de units.type, que
-- impidió registrarse a los residentes.
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

-- Verificado contra producción el 2026-09-07 leyendo el esquema que expone
-- PostgREST. Este bloque declaraba unit_id como UUID con FK a units y omitía
-- amount y billing_run_id; las tres cosas eran falsas o faltaban:
--
--   - amount existe y es la que escribe `issueBilling`. No estaba declarada ni
--     aquí ni en ninguna migración: venía de antes del historial.
--   - billing_run_id la agrega 20260728140000_community_expenses_and_billing,
--     pero este retrato no la mostraba.
--   - unit_id es TEXT y NO tiene foreign key. Declararla como UUID REFERENCES
--     units(id) ON DELETE CASCADE prometía una integridad que la base no
--     aplica: borrar una unidad no borra sus cobros, y nada impide un cobro
--     apuntando a una unidad inexistente. Corregirlo en la base es una
--     migración con datos de por medio, así que aquí se declara lo que hay.
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unit_id TEXT NOT NULL,
  month TEXT NOT NULL, -- Formato YYYY-MM
  amount NUMERIC,
  status TEXT DEFAULT 'pending' CHECK (status IN ('paid', 'pending', 'overdue')),
  due_date DATE NOT NULL,
  paid_at TIMESTAMPTZ,
  payment_metadata JSONB DEFAULT '{}'::jsonb, -- Datos tributarios (Haulmer Link, boleta electrónica, etc.)
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  billing_run_id UUID REFERENCES public.billing_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(unit_id, month)
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
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
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
           WHEN UPPER(c.resident_code) = v_invite_code THEN 'resident'
           WHEN UPPER(c.concierge_code) = v_invite_code THEN 'concierge'
           WHEN UPPER(c.admin_code) = v_invite_code THEN 'admin'
         END
    INTO v_community_id, v_role
  FROM public.communities c
  WHERE UPPER(c.resident_code) = v_invite_code
     OR UPPER(c.concierge_code) = v_invite_code
     OR UPPER(c.admin_code) = v_invite_code
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

-- Autocompletado y correccion de la lista de compras.
--
-- El vocabulario son los terminos que el catalogo puede responder de verdad.
-- Se guarda en tabla porque calcularlo recorre las ~92.000 filas del catalogo
-- (medido el 2026-09-08: entre 1,5 y 5,5 s) y la pregunta llega mientras
-- alguien escribe. Se rehace al terminar la carga nocturna, que es lo unico
-- que puede cambiar el resultado.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS supermarket_products_name_trgm_idx
  ON public.supermarket_products USING gin (name gin_trgm_ops);

CREATE TABLE IF NOT EXISTS public.supermarket_search_terms (
  term TEXT PRIMARY KEY,
  products INTEGER NOT NULL CHECK (products > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS supermarket_search_terms_products_idx
  ON public.supermarket_search_terms (products DESC);

ALTER TABLE public.supermarket_search_terms ENABLE ROW LEVEL SECURITY;

-- Son nombres de productos de gondola: no dicen nada de nadie. Escribir es
-- cosa del proceso de carga, que corre con service_role y no pasa por RLS.
DROP POLICY IF EXISTS "supermarket_search_terms_read" ON public.supermarket_search_terms;
CREATE POLICY "supermarket_search_terms_read"
  ON public.supermarket_search_terms
  FOR SELECT
  TO authenticated
  USING (true);

-- Reconcile stock only after a complete, safely covered supermarket crawl.
BEGIN;

CREATE INDEX IF NOT EXISTS supermarket_products_stock_freshness_idx
  ON public.supermarket_products (store, last_seen_at)
  WHERE in_stock = TRUE;

CREATE OR REPLACE FUNCTION public.finalize_supermarket_catalog_refresh(
  p_store TEXT,
  p_started_at TIMESTAMPTZ,
  p_finished_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current_in_stock INTEGER;
  v_observed INTEGER;
  v_minimum_observed INTEGER;
  v_marked_out INTEGER := 0;
  v_run_id UUID;
BEGIN
  IF p_store NOT IN (
    'Jumbo',
    'Santa Isabel',
    'Lider',
    'Unimarc',
    'Tottus',
    'aCuenta',
    'Irurzun'
  ) THEN
    RAISE EXCEPTION 'Unsupported supermarket: %', p_store
      USING ERRCODE = '22023';
  END IF;

  IF p_started_at IS NULL
    OR p_finished_at IS NULL
    OR p_finished_at < p_started_at
    OR p_finished_at > NOW() + INTERVAL '5 minutes'
  THEN
    RAISE EXCEPTION 'Invalid catalog refresh window'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    count(*) FILTER (WHERE in_stock),
    count(*) FILTER (
      WHERE last_seen_at >= p_started_at
        AND last_seen_at <= p_finished_at
    )
  INTO v_current_in_stock, v_observed
  FROM public.supermarket_products
  WHERE store = p_store;

  IF v_observed = 0 THEN
    RAISE EXCEPTION 'Refusing to reconcile % with an empty catalog', p_store
      USING ERRCODE = '22023';
  END IF;

  v_minimum_observed := CEIL(v_current_in_stock * 0.50)::INTEGER;
  IF v_current_in_stock > 0 AND v_observed < v_minimum_observed THEN
    RAISE EXCEPTION
      'Refusing to reconcile %: observed % of % in-stock products; minimum safe coverage is %',
      p_store,
      v_observed,
      v_current_in_stock,
      v_minimum_observed
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.supermarket_scrape_runs (
    requested_terms,
    source_status,
    product_count,
    status,
    fetched_at
  )
  VALUES (
    ARRAY['catalogo', p_store, 'stock-finalize'],
    jsonb_build_array(
      jsonb_build_object(
        'store', p_store,
        'query', 'catalogo-stock',
        'status', 'ok',
        'observed', v_observed,
        'previously_in_stock', v_current_in_stock
      )
    ),
    0,
    'completed',
    p_finished_at
  )
  RETURNING id INTO v_run_id;

  WITH changed AS (
    UPDATE public.supermarket_products
    SET
      in_stock = FALSE,
      last_run_id = v_run_id,
      updated_at = p_finished_at
    WHERE store = p_store
      AND in_stock = TRUE
      AND last_seen_at < p_started_at
    RETURNING id, price, list_price
  ),
  recorded AS (
    INSERT INTO public.supermarket_price_history (
      product_id,
      run_id,
      query,
      price,
      list_price,
      in_stock,
      observed_at
    )
    SELECT
      id,
      v_run_id,
      'catalogo-stock',
      price,
      list_price,
      FALSE,
      p_finished_at
    FROM changed
    RETURNING 1
  )
  SELECT count(*) INTO v_marked_out
  FROM recorded;

  UPDATE public.supermarket_scrape_runs
  SET
    product_count = v_marked_out,
    source_status = jsonb_build_array(
      jsonb_build_object(
        'store', p_store,
        'query', 'catalogo-stock',
        'status', 'ok',
        'observed', v_observed,
        'previously_in_stock', v_current_in_stock,
        'marked_out_of_stock', v_marked_out
      )
    )
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'run_id', v_run_id,
    'store', p_store,
    'observed', v_observed,
    'previously_in_stock', v_current_in_stock,
    'marked_out_of_stock', v_marked_out,
    'started_at', p_started_at,
    'finished_at', p_finished_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_supermarket_catalog_refresh(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_supermarket_catalog_refresh(TEXT, TIMESTAMPTZ, TIMESTAMPTZ)
  TO service_role;

-- Memoria de compras del hogar. Ver 20260905120000_supermarket_purchase_history.sql
-- para el razonamiento: se guarda el termino pedido y no el sku ganador, porque
-- el catalogo se mueve todos los dias y lo que la persona quiere no.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supermarket_history_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.supermarket_purchase_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term TEXT NOT NULL CHECK (char_length(term) BETWEEN 1 AND 120),
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit TEXT CHECK (unit IS NULL OR char_length(unit) <= 16),
  store TEXT CHECK (store IS NULL OR char_length(store) <= 40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supermarket_purchase_history_user_term_idx
  ON public.supermarket_purchase_history (user_id, term, created_at DESC);
CREATE INDEX IF NOT EXISTS supermarket_purchase_history_user_recent_idx
  ON public.supermarket_purchase_history (user_id, created_at DESC);

ALTER TABLE public.supermarket_purchase_history ENABLE ROW LEVEL SECURITY;


-- ############################################################################
-- Esquema completado desde la base, 2026-09-06
-- ############################################################################
--
-- Hasta esta fecha schema.sql declaraba 39 de las 94 tablas de produccion. El
-- resto -parking, solidaridad, agentes, cobranzas, supermercado- solo existia
-- en supabase/migrations/, asi que quien buscaba una tabla aca y no la
-- encontraba no podia saber si faltaba del archivo o de la base.
--
-- Nada de lo que sigue esta escrito a mano: sale de `supabase db dump` contra
-- produccion, con sus constraints, defaults, indices y politicas RLS reales.
-- Por eso usa el estilo de pg_dump ("public"."tabla") en vez del estilo escrito
-- a mano del resto del archivo; el guard reconoce las dos formas.
--
-- Al completarlo aparecio un fallo del propio guard: una tabla que solo tenia
-- un ALTER TABLE contaba como declarada aunque su CREATE TABLE no existiera, y
-- entonces el chequeo de columnas validaba unicamente las alteradas. Le pasaba
-- a solidarity_applications. Ahora solo cuenta como declarada la que tiene su
-- CREATE TABLE.
--
-- Para regenerar despues de un cambio grande:
--   npx supabase db dump --schema public -f dump.sql
--
-- ############################################################################

-- ============================================================
-- Tablas
-- ============================================================

CREATE TABLE IF NOT EXISTS "public"."agent_action_approvals" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "run_id" "uuid",
    "tool_call_id" "uuid",
    "user_id" "uuid",
    "community_id" "uuid",
    "decision" "text" NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_action_approvals_decision_check" CHECK (("decision" = ANY (ARRAY['approved'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_activity_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "community_id" "uuid",
    "user_id" "uuid",
    "agent_key" "text" NOT NULL,
    "action" "text" NOT NULL,
    "entity_type" "text",
    "entity_id" "uuid",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_activity_log_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_memories" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "condominio_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" character varying(50) NOT NULL,
    "content" "text" NOT NULL,
    "embedding" "public"."vector"(1024),
    "importance" double precision NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb",
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."agent_policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "agent_key" "text" NOT NULL,
    "autonomy_level" "text" DEFAULT 'manual'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "max_daily_actions" integer DEFAULT 100 NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_policies_agent_key_check" CHECK (("agent_key" = ANY (ARRAY['finance'::"text", 'maintenance'::"text", 'concierge'::"text", 'community'::"text"]))),
    CONSTRAINT "agent_policies_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['manual'::"text", 'semi_autonomous'::"text", 'autonomous'::"text"]))),
    CONSTRAINT "agent_policies_max_daily_actions_check" CHECK (("max_daily_actions" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."agent_runs" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "user_id" "uuid",
    "community_id" "uuid",
    "agent_key" "text" NOT NULL,
    "intent" "text" NOT NULL,
    "user_message" "text" NOT NULL,
    "autonomy_level" "text" DEFAULT 'manual'::"text" NOT NULL,
    "status" "text" DEFAULT 'preview'::"text" NOT NULL,
    "summary" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "agent_runs_autonomy_level_check" CHECK (("autonomy_level" = ANY (ARRAY['manual'::"text", 'semi_autonomous'::"text", 'autonomous'::"text"]))),
    CONSTRAINT "agent_runs_status_check" CHECK (("status" = ANY (ARRAY['preview'::"text", 'awaiting_confirmation'::"text", 'executed'::"text", 'rejected'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_task_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "position" integer NOT NULL,
    "step_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "attempts" integer DEFAULT 0 NOT NULL,
    "input" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "output" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "error" "text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    CONSTRAINT "agent_task_steps_attempts_check" CHECK (("attempts" >= 0)),
    CONSTRAINT "agent_task_steps_position_check" CHECK (("position" >= 0)),
    CONSTRAINT "agent_task_steps_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'running'::"text", 'completed'::"text", 'failed'::"text", 'waiting_human'::"text", 'skipped'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "agent_key" "text" NOT NULL,
    "playbook_key" "text",
    "goal" "text" NOT NULL,
    "status" "text" DEFAULT 'planned'::"text" NOT NULL,
    "current_step" integer DEFAULT 0 NOT NULL,
    "retry_count" integer DEFAULT 0 NOT NULL,
    "max_retries" integer DEFAULT 1 NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_error" "text",
    "next_run_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    CONSTRAINT "agent_tasks_agent_key_check" CHECK (("agent_key" = ANY (ARRAY['finance'::"text", 'maintenance'::"text", 'concierge'::"text", 'community'::"text"]))),
    CONSTRAINT "agent_tasks_current_step_check" CHECK (("current_step" >= 0)),
    CONSTRAINT "agent_tasks_max_retries_check" CHECK ((("max_retries" >= 0) AND ("max_retries" <= 5))),
    CONSTRAINT "agent_tasks_retry_count_check" CHECK (("retry_count" >= 0)),
    CONSTRAINT "agent_tasks_status_check" CHECK (("status" = ANY (ARRAY['planned'::"text", 'running'::"text", 'waiting_human'::"text", 'completed'::"text", 'failed'::"text", 'escalated'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_tool_calls" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "run_id" "uuid",
    "user_id" "uuid",
    "community_id" "uuid",
    "tool_name" "text" NOT NULL,
    "args" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "result" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "requires_confirmation" boolean DEFAULT true NOT NULL,
    "status" "text" DEFAULT 'proposed'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "executed_at" timestamp with time zone,
    CONSTRAINT "agent_tool_calls_status_check" CHECK (("status" = ANY (ARRAY['proposed'::"text", 'executed'::"text", 'failed'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_trigger_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rule_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "signal_key" "text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "metric" numeric DEFAULT 0 NOT NULL,
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'detected'::"text" NOT NULL,
    "run_id" "uuid",
    "tool_call_id" "uuid",
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "processed_at" timestamp with time zone,
    CONSTRAINT "agent_trigger_events_status_check" CHECK (("status" = ANY (ARRAY['detected'::"text", 'proposal_created'::"text", 'skipped'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."agent_trigger_rules" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "agent_key" "text" NOT NULL,
    "playbook_key" "text" NOT NULL,
    "name" "text" NOT NULL,
    "signal_key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "interval_minutes" integer DEFAULT 1440 NOT NULL,
    "cooldown_minutes" integer DEFAULT 720 NOT NULL,
    "threshold" "jsonb" DEFAULT '{"minimum": 1}'::"jsonb" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "last_evaluated_at" timestamp with time zone,
    "last_triggered_at" timestamp with time zone,
    "next_run_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "agent_trigger_rules_agent_key_check" CHECK (("agent_key" = ANY (ARRAY['finance'::"text", 'maintenance'::"text", 'concierge'::"text", 'community'::"text"]))),
    CONSTRAINT "agent_trigger_rules_cooldown_minutes_check" CHECK ((("cooldown_minutes" >= 15) AND ("cooldown_minutes" <= 43200))),
    CONSTRAINT "agent_trigger_rules_interval_minutes_check" CHECK ((("interval_minutes" >= 15) AND ("interval_minutes" <= 43200))),
    CONSTRAINT "agent_trigger_rules_signal_key_check" CHECK (("signal_key" = ANY (ARRAY['overdue_expenses'::"text", 'maintenance_backlog'::"text", 'onboarding_gap'::"text", 'emergency_readiness'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."ai_budgets" (
    "community_id" "uuid" NOT NULL,
    "plan" "text" DEFAULT 'pro'::"text" NOT NULL,
    "is_enabled" boolean DEFAULT true NOT NULL,
    "monthly_token_limit" integer DEFAULT 10000000 NOT NULL,
    "monthly_image_limit" integer DEFAULT 30 NOT NULL,
    "monthly_cost_limit_cents" integer DEFAULT 10000 NOT NULL,
    "resident_daily_token_limit" integer DEFAULT 100000 NOT NULL,
    "staff_daily_token_limit" integer DEFAULT 300000 NOT NULL,
    "heavy_action_daily_limit" integer DEFAULT 20 NOT NULL,
    "reset_day" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_budgets_heavy_action_daily_limit_check" CHECK (("heavy_action_daily_limit" >= 0)),
    CONSTRAINT "ai_budgets_monthly_cost_limit_cents_check" CHECK (("monthly_cost_limit_cents" >= 0)),
    CONSTRAINT "ai_budgets_monthly_image_limit_check" CHECK (("monthly_image_limit" >= 0)),
    CONSTRAINT "ai_budgets_monthly_token_limit_check" CHECK (("monthly_token_limit" >= 0)),
    CONSTRAINT "ai_budgets_plan_check" CHECK (("plan" = ANY (ARRAY['demo'::"text", 'essential'::"text", 'pro'::"text", 'enterprise'::"text"]))),
    CONSTRAINT "ai_budgets_reset_day_check" CHECK ((("reset_day" >= 1) AND ("reset_day" <= 28))),
    CONSTRAINT "ai_budgets_resident_daily_token_limit_check" CHECK (("resident_daily_token_limit" >= 0)),
    CONSTRAINT "ai_budgets_staff_daily_token_limit_check" CHECK (("staff_daily_token_limit" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."ai_usage_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid",
    "user_id" "uuid",
    "role" "text",
    "module" "text" NOT NULL,
    "provider" "text" NOT NULL,
    "model" "text",
    "action_type" "text" DEFAULT 'chat'::"text" NOT NULL,
    "prompt_tokens" integer DEFAULT 0 NOT NULL,
    "completion_tokens" integer DEFAULT 0 NOT NULL,
    "total_tokens" integer DEFAULT 0 NOT NULL,
    "image_count" integer DEFAULT 0 NOT NULL,
    "estimated_cost_cents" numeric(12,4) DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "blocked_reason" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ai_usage_events_action_type_check" CHECK (("action_type" = ANY (ARRAY['chat'::"text", 'image'::"text", 'embedding'::"text", 'extraction'::"text", 'course'::"text", 'fallback'::"text", 'other'::"text"]))),
    CONSTRAINT "ai_usage_events_completion_tokens_check" CHECK (("completion_tokens" >= 0)),
    CONSTRAINT "ai_usage_events_estimated_cost_cents_check" CHECK (("estimated_cost_cents" >= (0)::numeric)),
    CONSTRAINT "ai_usage_events_image_count_check" CHECK (("image_count" >= 0)),
    CONSTRAINT "ai_usage_events_prompt_tokens_check" CHECK (("prompt_tokens" >= 0)),
    CONSTRAINT "ai_usage_events_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'blocked'::"text", 'skipped'::"text", 'fallback'::"text"]))),
    CONSTRAINT "ai_usage_events_total_tokens_check" CHECK (("total_tokens" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."annual_budgets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "year" integer NOT NULL,
    "category" "text" NOT NULL,
    "annual_amount" numeric(14,2) NOT NULL,
    "notes" "text",
    "created_by" "uuid",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "annual_budgets_annual_amount_check" CHECK (("annual_amount" >= (0)::numeric)),
    CONSTRAINT "annual_budgets_category_check" CHECK (("category" = ANY (ARRAY['water'::"text", 'electricity'::"text", 'salaries'::"text", 'maintenance'::"text", 'security'::"text", 'other'::"text"]))),
    CONSTRAINT "annual_budgets_year_check" CHECK ((("year" >= 2020) AND ("year" <= 2100)))
);

CREATE TABLE IF NOT EXISTS "public"."api_rate_limits" (
    "scope" "text" NOT NULL,
    "subject_hash" "text" NOT NULL,
    "window_started_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "request_count" integer DEFAULT 0 NOT NULL,
    CONSTRAINT "api_rate_limits_request_count_check" CHECK (("request_count" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."bank_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "txn_date" "date" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "reference" "text",
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "matched_payment_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "bank_transactions_amount_check" CHECK (("amount" <> (0)::numeric)),
    CONSTRAINT "bank_transactions_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'matched'::"text", 'ignored'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."billing_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "status" "text" DEFAULT 'issued'::"text" NOT NULL,
    "total_amount" numeric(14,2) DEFAULT 0 NOT NULL,
    "units_count" integer DEFAULT 0 NOT NULL,
    "due_date" "date" NOT NULL,
    "fallback_equal_split" boolean DEFAULT false NOT NULL,
    "issued_by" "uuid",
    "issued_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "billing_runs_status_check" CHECK (("status" = ANY (ARRAY['issued'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."building_assets" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid",
    "name" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "brand" "text",
    "model" "text",
    "installation_date" "date",
    "location" "text",
    "health_status" "text" DEFAULT 'optimal'::"text" NOT NULL,
    "last_maintenance" "date",
    "next_maintenance" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "building_assets_health_status_check" CHECK (("health_status" = ANY (ARRAY['optimal'::"text", 'warning'::"text", 'critical'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."chat_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "receiver_id" "uuid",
    "content" "text" NOT NULL,
    "read" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);

CREATE TABLE IF NOT EXISTS "public"."coco_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_key" "text" NOT NULL,
    "conversation" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "user_context" "jsonb",
    "auth_state" "text",
    "auth_attempts" integer DEFAULT 0,
    "last_activity" timestamp with time zone DEFAULT "now"(),
    "expires_at" timestamp with time zone DEFAULT ("now"() + '24:00:00'::interval)
);

CREATE TABLE IF NOT EXISTS "public"."coco_user_memory" (
    "user_id" "uuid" NOT NULL,
    "community_id" "uuid",
    "facts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."community_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "category" "text" DEFAULT 'other'::"text" NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "provider" "text",
    "document_url" "text",
    "notes" "text",
    "prorate_method" "text" DEFAULT 'share'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "community_expenses_amount_check" CHECK (("amount" >= (0)::numeric)),
    CONSTRAINT "community_expenses_category_check" CHECK (("category" = ANY (ARRAY['water'::"text", 'electricity'::"text", 'salaries'::"text", 'maintenance'::"text", 'security'::"text", 'other'::"text"]))),
    CONSTRAINT "community_expenses_prorate_method_check" CHECK (("prorate_method" = ANY (ARRAY['share'::"text", 'equal'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."instagram_connections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "connected_by" "uuid",
    "instagram_user_id" "text",
    "username" "text",
    "page_id" "text",
    "encrypted_access_token" "text",
    "token_expires_at" timestamp with time zone,
    "status" "text" DEFAULT 'not_connected'::"text" NOT NULL,
    "last_error" "text",
    "connected_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "instagram_connections_status_check" CHECK (("status" = ANY (ARRAY['not_connected'::"text", 'connected'::"text", 'needs_reauth'::"text", 'disabled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."maintenance_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid",
    "asset_id" "uuid",
    "task_id" "uuid",
    "performed_by" "text" DEFAULT 'Administracion'::"text" NOT NULL,
    "description" "text" NOT NULL,
    "cost" numeric(12,0) DEFAULT 0 NOT NULL,
    "date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "attachments" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."maintenance_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid",
    "asset_id" "uuid",
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "frequency" "text" DEFAULT 'monthly'::"text" NOT NULL,
    "due_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "priority" "text" DEFAULT 'medium'::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "maintenance_tasks_priority_check" CHECK (("priority" = ANY (ARRAY['low'::"text", 'medium'::"text", 'high'::"text"]))),
    CONSTRAINT "maintenance_tasks_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'overdue'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."marketing_reel_campaigns" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "objective" "text" NOT NULL,
    "audience" "text" DEFAULT 'administrators'::"text" NOT NULL,
    "tone" "text" DEFAULT 'premium'::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_reel_campaigns_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'active'::"text", 'paused'::"text", 'completed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."marketing_reels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "campaign_id" "uuid",
    "created_by" "uuid",
    "title" "text" NOT NULL,
    "objective" "text" NOT NULL,
    "audience" "text" DEFAULT 'administrators'::"text" NOT NULL,
    "tone" "text" DEFAULT 'premium'::"text" NOT NULL,
    "duration_seconds" integer DEFAULT 35 NOT NULL,
    "feature_focus" "text" DEFAULT 'Agent Center'::"text" NOT NULL,
    "proof_point" "text",
    "offer" "text",
    "call_to_action" "text",
    "creative_package" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "render_spec" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "video_url" "text",
    "thumbnail_url" "text",
    "caption" "text" DEFAULT ''::"text" NOT NULL,
    "hashtags" "text"[] DEFAULT ARRAY[]::"text"[] NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "scheduled_at" timestamp with time zone,
    "published_at" timestamp with time zone,
    "instagram_media_id" "text",
    "failure_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "marketing_reels_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'generated'::"text", 'rendering'::"text", 'rendered'::"text", 'approved'::"text", 'scheduled'::"text", 'publishing'::"text", 'published'::"text", 'blocked'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."marketplace_chats" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "item_id" "uuid" NOT NULL,
    "buyer_id" "uuid" NOT NULL,
    "seller_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."marketplace_messages" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "chat_id" "uuid" NOT NULL,
    "sender_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "timezone"('utc'::"text", "now"()) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."onboarding_import_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "source" "text" DEFAULT 'admin_onboarding'::"text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "document_count" integer DEFAULT 0 NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "valid_row_count" integer DEFAULT 0 NOT NULL,
    "warning_count" integer DEFAULT 0 NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_import_batches_source_check" CHECK (("source" = ANY (ARRAY['admin_onboarding'::"text", 'agent_center'::"text"]))),
    CONSTRAINT "onboarding_import_batches_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'review'::"text", 'syncing'::"text", 'synced'::"text", 'partial'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."onboarding_import_documents" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "mime_type" "text",
    "size_bytes" bigint DEFAULT 0 NOT NULL,
    "checksum" "text",
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "extracted_rows" integer DEFAULT 0 NOT NULL,
    "error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "document_kind" "text" DEFAULT 'resident_roster'::"text" NOT NULL,
    "summary" "text" DEFAULT ''::"text" NOT NULL,
    "search_text" "text" DEFAULT ''::"text" NOT NULL,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"simple"'::"regconfig", ((((COALESCE("file_name", ''::"text") || ' '::"text") || COALESCE("summary", ''::"text")) || ' '::"text") || COALESCE("search_text", ''::"text")))) STORED,
    CONSTRAINT "onboarding_import_documents_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'extracted'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."onboarding_import_rows" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "document_id" "uuid",
    "community_id" "uuid" NOT NULL,
    "row_index" integer NOT NULL,
    "name" "text" DEFAULT ''::"text" NOT NULL,
    "unit_number" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "dedupe_key" "text" NOT NULL,
    "status" "text" DEFAULT 'staged'::"text" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "error" "text",
    "raw_data" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "onboarding_import_rows_status_check" CHECK (("status" = ANY (ARRAY['staged'::"text", 'synced'::"text", 'unit_only'::"text", 'failed'::"text", 'skipped'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."operation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "actor_role" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "severity" "text" DEFAULT 'info'::"text" NOT NULL,
    "status" "text" DEFAULT 'success'::"text" NOT NULL,
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "request_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "operation_events_severity_check" CHECK (("severity" = ANY (ARRAY['info'::"text", 'success'::"text", 'warning'::"text", 'error'::"text"]))),
    CONSTRAINT "operation_events_status_check" CHECK (("status" = ANY (ARRAY['success'::"text", 'error'::"text", 'blocked'::"text", 'pending'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."parking_access_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "booking_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "recorded_by" "uuid",
    "notes" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_access_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['entry'::"text", 'exit'::"text", 'denied'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."parking_bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "spot_id" "uuid" NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "driver_is_resident" boolean DEFAULT false NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "ends_at" timestamp with time zone NOT NULL,
    "total_amount" integer DEFAULT 0 NOT NULL,
    "community_fee_amount" integer DEFAULT 0 NOT NULL,
    "owner_payout_amount" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'confirmed'::"text" NOT NULL,
    "payment_status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "access_code" "text" NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancelled_by" "uuid",
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_bookings_community_fee_amount_check" CHECK (("community_fee_amount" >= 0)),
    CONSTRAINT "parking_bookings_owner_payout_amount_check" CHECK (("owner_payout_amount" >= 0)),
    CONSTRAINT "parking_bookings_payment_status_check" CHECK (("payment_status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'refunded'::"text", 'failed'::"text"]))),
    CONSTRAINT "parking_bookings_range_valid" CHECK (("ends_at" > "starts_at")),
    CONSTRAINT "parking_bookings_status_check" CHECK (("status" = ANY (ARRAY['confirmed'::"text", 'active'::"text", 'completed'::"text", 'cancelled'::"text", 'no_show'::"text"]))),
    CONSTRAINT "parking_bookings_total_amount_check" CHECK (("total_amount" >= 0))
);

CREATE TABLE IF NOT EXISTS "public"."parking_community_access" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "driver_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text" DEFAULT ''::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_community_access_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."parking_drivers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "profile_id" "uuid",
    "full_name" "text" NOT NULL,
    "phone" "text" NOT NULL,
    "national_id" "text",
    "plate" "text" NOT NULL,
    "vehicle_description" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "parking_drivers_full_name_check" CHECK ((("char_length"("btrim"("full_name")) >= 2) AND ("char_length"("btrim"("full_name")) <= 120))),
    CONSTRAINT "parking_drivers_national_id_check" CHECK ((("national_id" IS NULL) OR (("char_length"("btrim"("national_id")) >= 7) AND ("char_length"("btrim"("national_id")) <= 15)))),
    CONSTRAINT "parking_drivers_phone_check" CHECK ((("char_length"("btrim"("phone")) >= 8) AND ("char_length"("btrim"("phone")) <= 20))),
    CONSTRAINT "parking_drivers_plate_check" CHECK ((("char_length"("btrim"("plate")) >= 4) AND ("char_length"("btrim"("plate")) <= 10)))
);

CREATE TABLE IF NOT EXISTS "public"."parking_spot_availability" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "spot_id" "uuid" NOT NULL,
    "weekday" smallint NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    CONSTRAINT "parking_availability_window_valid" CHECK (("end_time" > "start_time")),
    CONSTRAINT "parking_spot_availability_weekday_check" CHECK ((("weekday" >= 0) AND ("weekday" <= 6)))
);

CREATE TABLE IF NOT EXISTS "public"."parking_spots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "owner_id" "uuid" NOT NULL,
    "unit_label" "text" DEFAULT ''::"text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "access_notes" "text" DEFAULT ''::"text" NOT NULL,
    "vehicle_size" "text" DEFAULT 'auto'::"text" NOT NULL,
    "is_covered" boolean DEFAULT false NOT NULL,
    "has_ev_charger" boolean DEFAULT false NOT NULL,
    "hourly_rate" integer DEFAULT 0 NOT NULL,
    "daily_rate" integer,
    "monthly_rate" integer,
    "min_hours" integer DEFAULT 1 NOT NULL,
    "allows_external" boolean DEFAULT false NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "approved_by" "uuid",
    "approved_at" timestamp with time zone,
    "rejection_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "floor_level" "text" DEFAULT 'S1'::"text" NOT NULL,
    CONSTRAINT "parking_spots_daily_rate_check" CHECK ((("daily_rate" IS NULL) OR ("daily_rate" >= 0))),
    CONSTRAINT "parking_spots_floor_level_valid" CHECK (("floor_level" = ANY (ARRAY['S1'::"text", 'S2'::"text", 'S3'::"text", 'PB'::"text", 'EXT'::"text"]))),
    CONSTRAINT "parking_spots_hourly_rate_check" CHECK (("hourly_rate" >= 0)),
    CONSTRAINT "parking_spots_label_check" CHECK ((("char_length"("btrim"("label")) >= 1) AND ("char_length"("btrim"("label")) <= 40))),
    CONSTRAINT "parking_spots_min_hours_check" CHECK ((("min_hours" >= 1) AND ("min_hours" <= 24))),
    CONSTRAINT "parking_spots_monthly_rate_check" CHECK ((("monthly_rate" IS NULL) OR ("monthly_rate" >= 0))),
    CONSTRAINT "parking_spots_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'pending_approval'::"text", 'published'::"text", 'paused'::"text", 'rejected'::"text"]))),
    CONSTRAINT "parking_spots_vehicle_size_check" CHECK (("vehicle_size" = ANY (ARRAY['moto'::"text", 'auto'::"text", 'suv'::"text", 'camioneta'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."platform_operation_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "actor_id" "uuid",
    "actor_email" "text",
    "action" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "summary" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."reserve_fund_movements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "kind" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "month" "text" NOT NULL,
    "label" "text" NOT NULL,
    "notes" "text",
    "billing_run_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "reserve_fund_movements_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "reserve_fund_movements_kind_check" CHECK (("kind" = ANY (ARRAY['contribution'::"text", 'withdrawal'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."solidarity_applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "category" "text" NOT NULL,
    "description" "text" NOT NULL,
    "amount_requested" numeric(10,2) NOT NULL,
    "amount_approved" numeric(10,2) DEFAULT 0.00,
    "status" "text" DEFAULT 'pending'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "resolved_at" timestamp with time zone,
    "sensitive_consent_at" timestamp with time zone,
    "sensitive_consent_version" "text",
    "sensitive_consent_scope" "text",
    CONSTRAINT "solidarity_applications_amount_requested_check" CHECK (("amount_requested" > (0)::numeric)),
    CONSTRAINT "solidarity_applications_category_check" CHECK (("category" = ANY (ARRAY['unemployment'::"text", 'pensioner'::"text", 'medical'::"text", 'emergency'::"text"]))),
    CONSTRAINT "solidarity_applications_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."solidarity_contributions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "amount" numeric(10,2) NOT NULL,
    "type" "text" NOT NULL,
    "expense_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solidarity_contributions_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "solidarity_contributions_type_check" CHECK (("type" = ANY (ARRAY['round_up'::"text", 'donation'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."solidarity_funds" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "balance" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."solidarity_ledger" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "entry_type" "text" NOT NULL,
    "amount" numeric(12,2) DEFAULT 0.00 NOT NULL,
    "hours" numeric(4,1) DEFAULT 0.0 NOT NULL,
    "description" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solidarity_ledger_entry_type_check" CHECK (("entry_type" = ANY (ARRAY['contribution'::"text", 'subsidize'::"text", 'work_offset'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."solidarity_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "category" "text" NOT NULL,
    "hours" numeric(4,1) NOT NULL,
    "status" "text" DEFAULT 'free'::"text",
    "reserved_by" "uuid",
    "reserved_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "verified_by" "uuid",
    "pin_code" "text" DEFAULT '1234'::"text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "solidarity_tasks_category_check" CHECK (("category" = ANY (ARRAY['gardening'::"text", 'packages'::"text", 'recycling'::"text", 'digital'::"text"]))),
    CONSTRAINT "solidarity_tasks_hours_check" CHECK (("hours" > (0)::numeric)),
    CONSTRAINT "solidarity_tasks_status_check" CHECK (("status" = ANY (ARRAY['free'::"text", 'reserved'::"text", 'completed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_cart_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "user_id" "uuid",
    "community_id" "uuid",
    "store" "text" NOT NULL,
    "items" "jsonb" NOT NULL,
    "item_count" integer DEFAULT 0 NOT NULL,
    "fetch_count" integer DEFAULT 0 NOT NULL,
    "max_fetches" integer DEFAULT 5 NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_group_order_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "requested_term" "text" NOT NULL,
    "quantity" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supermarket_group_order_items_quantity_check" CHECK ((("quantity" >= 1) AND ("quantity" <= 500))),
    CONSTRAINT "supermarket_group_order_items_requested_term_check" CHECK ((("char_length"("requested_term") >= 2) AND ("char_length"("requested_term") <= 80)))
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_group_order_members" (
    "order_id" "uuid" NOT NULL,
    "community_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "joined_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "paid_at" timestamp with time zone,
    "paid_marked_by" "uuid"
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_group_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "closes_at" "date" NOT NULL,
    "selected_store" "text",
    "selected_total" integer,
    "selected_channel_type" "text",
    "retailer_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "selected_items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "client_request_id" "uuid",
    CONSTRAINT "supermarket_group_orders_selected_channel_type_check" CHECK ((("selected_channel_type" IS NULL) OR ("selected_channel_type" = ANY (ARRAY['retail'::"text", 'wholesale'::"text"])))),
    CONSTRAINT "supermarket_group_orders_selected_items_check" CHECK (("jsonb_typeof"("selected_items") = 'array'::"text")),
    CONSTRAINT "supermarket_group_orders_selected_store_check" CHECK ((("selected_store" IS NULL) OR ("selected_store" = ANY (ARRAY['Jumbo'::"text", 'Santa Isabel'::"text", 'Lider'::"text", 'Unimarc'::"text", 'Tottus'::"text", 'aCuenta'::"text", 'Irurzun'::"text"])))),
    CONSTRAINT "supermarket_group_orders_selected_total_check" CHECK ((("selected_total" IS NULL) OR ("selected_total" > 0))),
    CONSTRAINT "supermarket_group_orders_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'ready'::"text", 'locked'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "supermarket_group_orders_title_check" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 120)))
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_price_history" (
    "id" bigint NOT NULL,
    "product_id" "uuid" NOT NULL,
    "run_id" "uuid" NOT NULL,
    "query" "text" NOT NULL,
    "price" integer NOT NULL,
    "list_price" integer,
    "in_stock" boolean NOT NULL,
    "observed_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supermarket_price_history_check" CHECK ((("list_price" IS NULL) OR ("list_price" >= "price"))),
    CONSTRAINT "supermarket_price_history_price_check" CHECK (("price" > 0))
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_products" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "store" "text" NOT NULL,
    "source_product_key" "text" NOT NULL,
    "last_query" "text" NOT NULL,
    "name" "text" NOT NULL,
    "brand" "text",
    "sku" "text",
    "ean" "text",
    "product_url" "text",
    "image_url" "text",
    "price" integer NOT NULL,
    "list_price" integer,
    "currency" "text" DEFAULT 'CLP'::"text" NOT NULL,
    "in_stock" boolean DEFAULT true NOT NULL,
    "first_seen_at" timestamp with time zone NOT NULL,
    "last_seen_at" timestamp with time zone NOT NULL,
    "last_run_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "channel_type" "text" DEFAULT 'retail'::"text" NOT NULL,
    "pack_units" integer DEFAULT 1 NOT NULL,
    "minimum_packs" integer DEFAULT 1 NOT NULL,
    "offer_id" "text",
    "sales_unit" "text",
    CONSTRAINT "supermarket_products_channel_type_check" CHECK (("channel_type" = ANY (ARRAY['retail'::"text", 'wholesale'::"text"]))),
    CONSTRAINT "supermarket_products_check" CHECK ((("list_price" IS NULL) OR ("list_price" >= "price"))),
    CONSTRAINT "supermarket_products_currency_check" CHECK (("currency" = 'CLP'::"text")),
    CONSTRAINT "supermarket_products_minimum_packs_check" CHECK ((("minimum_packs" > 0) AND ("minimum_packs" <= 1000))),
    CONSTRAINT "supermarket_products_pack_units_check" CHECK ((("pack_units" > 0) AND ("pack_units" <= 10000))),
    CONSTRAINT "supermarket_products_price_check" CHECK (("price" > 0)),
    CONSTRAINT "supermarket_products_store_check" CHECK (("store" = ANY (ARRAY['Jumbo'::"text", 'Santa Isabel'::"text", 'Lider'::"text", 'Unimarc'::"text", 'Tottus'::"text", 'aCuenta'::"text", 'Irurzun'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."supermarket_scrape_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "requested_terms" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "source_status" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "product_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'completed'::"text" NOT NULL,
    "fetched_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "supermarket_scrape_runs_product_count_check" CHECK (("product_count" >= 0)),
    CONSTRAINT "supermarket_scrape_runs_status_check" CHECK (("status" = ANY (ARRAY['completed'::"text", 'partial'::"text", 'failed'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."unit_charges" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "month" "text" NOT NULL,
    "kind" "text" DEFAULT 'other'::"text" NOT NULL,
    "label" "text" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "due_date" "date",
    "notes" "text",
    "source_expense_id" "uuid",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "unit_charges_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "unit_charges_kind_check" CHECK (("kind" = ANY (ARRAY['fine'::"text", 'interest'::"text", 'extraordinary'::"text", 'service'::"text", 'other'::"text"]))),
    CONSTRAINT "unit_charges_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'cancelled'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."unit_payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "community_id" "uuid" NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "amount" numeric(12,2) NOT NULL,
    "paid_at" "date" DEFAULT CURRENT_DATE NOT NULL,
    "method" "text" DEFAULT 'transfer'::"text" NOT NULL,
    "reference" "text",
    "notes" "text",
    "expense_id" "uuid",
    "charge_id" "uuid",
    "recorded_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "unit_payments_amount_check" CHECK (("amount" > (0)::numeric)),
    CONSTRAINT "unit_payments_method_check" CHECK (("method" = ANY (ARRAY['transfer'::"text", 'cash'::"text", 'check'::"text", 'card'::"text", 'online'::"text", 'other'::"text"])))
);

CREATE TABLE IF NOT EXISTS "public"."visitors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "visitor_name" "text" NOT NULL,
    "unit_id" "text" NOT NULL,
    "entry_time" timestamp with time zone DEFAULT "now"() NOT NULL,
    "exit_time" timestamp with time zone,
    "purpose" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "community_id" "uuid" DEFAULT '00000000-0000-0000-0000-000000000000'::"uuid"
);

-- ============================================================
-- Claves primarias, foraneas y validaciones
-- ============================================================

ALTER TABLE "public"."agent_action_approvals" OWNER TO "postgres";

ALTER TABLE "public"."agent_activity_log" OWNER TO "postgres";

ALTER TABLE "public"."agent_memories" OWNER TO "postgres";

ALTER TABLE "public"."agent_policies" OWNER TO "postgres";

ALTER TABLE "public"."agent_runs" OWNER TO "postgres";

ALTER TABLE "public"."agent_task_steps" OWNER TO "postgres";

ALTER TABLE "public"."agent_tasks" OWNER TO "postgres";

ALTER TABLE "public"."agent_tool_calls" OWNER TO "postgres";

ALTER TABLE "public"."agent_trigger_events" OWNER TO "postgres";

ALTER TABLE "public"."agent_trigger_rules" OWNER TO "postgres";

ALTER TABLE "public"."ai_budgets" OWNER TO "postgres";

ALTER TABLE "public"."ai_usage_events" OWNER TO "postgres";

ALTER TABLE "public"."annual_budgets" OWNER TO "postgres";

ALTER TABLE "public"."api_rate_limits" OWNER TO "postgres";

ALTER TABLE "public"."bank_transactions" OWNER TO "postgres";

ALTER TABLE "public"."billing_runs" OWNER TO "postgres";

ALTER TABLE "public"."building_assets" OWNER TO "postgres";

ALTER TABLE "public"."chat_messages" OWNER TO "postgres";

ALTER TABLE "public"."coco_sessions" OWNER TO "postgres";

ALTER TABLE "public"."coco_user_memory" OWNER TO "postgres";

ALTER TABLE "public"."community_expenses" OWNER TO "postgres";

ALTER TABLE "public"."instagram_connections" OWNER TO "postgres";

ALTER TABLE "public"."maintenance_logs" OWNER TO "postgres";

ALTER TABLE "public"."maintenance_tasks" OWNER TO "postgres";

ALTER TABLE "public"."marketing_reel_campaigns" OWNER TO "postgres";

ALTER TABLE "public"."marketing_reels" OWNER TO "postgres";

ALTER TABLE "public"."marketplace_chats" OWNER TO "postgres";

ALTER TABLE "public"."marketplace_messages" OWNER TO "postgres";

ALTER TABLE "public"."onboarding_import_batches" OWNER TO "postgres";

ALTER TABLE "public"."onboarding_import_documents" OWNER TO "postgres";

ALTER TABLE "public"."onboarding_import_rows" OWNER TO "postgres";

ALTER TABLE "public"."operation_events" OWNER TO "postgres";

ALTER TABLE "public"."parking_access_events" OWNER TO "postgres";

ALTER TABLE "public"."parking_bookings" OWNER TO "postgres";

ALTER TABLE "public"."parking_community_access" OWNER TO "postgres";

ALTER TABLE "public"."parking_drivers" OWNER TO "postgres";

ALTER TABLE "public"."parking_spot_availability" OWNER TO "postgres";

ALTER TABLE "public"."parking_spots" OWNER TO "postgres";

ALTER TABLE "public"."platform_operation_events" OWNER TO "postgres";

ALTER TABLE "public"."reserve_fund_movements" OWNER TO "postgres";

ALTER TABLE "public"."solidarity_applications" OWNER TO "postgres";

ALTER TABLE "public"."solidarity_contributions" OWNER TO "postgres";

ALTER TABLE "public"."solidarity_funds" OWNER TO "postgres";

ALTER TABLE "public"."solidarity_ledger" OWNER TO "postgres";

ALTER TABLE "public"."solidarity_tasks" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_cart_plans" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_group_order_items" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_group_order_members" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_group_orders" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_price_history" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_price_history" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."supermarket_price_history_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE "public"."supermarket_products" OWNER TO "postgres";

ALTER TABLE "public"."supermarket_scrape_runs" OWNER TO "postgres";

ALTER TABLE "public"."unit_charges" OWNER TO "postgres";

ALTER TABLE "public"."unit_payments" OWNER TO "postgres";

ALTER TABLE "public"."visitors" OWNER TO "postgres";

ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_activity_log"
    ADD CONSTRAINT "agent_activity_log_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_memories"
    ADD CONSTRAINT "agent_memories_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_policies"
    ADD CONSTRAINT "agent_policies_community_id_agent_key_key" UNIQUE ("community_id", "agent_key");

ALTER TABLE ONLY "public"."agent_policies"
    ADD CONSTRAINT "agent_policies_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_task_steps"
    ADD CONSTRAINT "agent_task_steps_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_task_steps"
    ADD CONSTRAINT "agent_task_steps_task_id_position_key" UNIQUE ("task_id", "position");

ALTER TABLE ONLY "public"."agent_task_steps"
    ADD CONSTRAINT "agent_task_steps_task_id_step_key_key" UNIQUE ("task_id", "step_key");

ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_tool_calls"
    ADD CONSTRAINT "agent_tool_calls_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_dedupe_key_key" UNIQUE ("dedupe_key");

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."agent_trigger_rules"
    ADD CONSTRAINT "agent_trigger_rules_community_id_signal_key_key" UNIQUE ("community_id", "signal_key");

ALTER TABLE ONLY "public"."agent_trigger_rules"
    ADD CONSTRAINT "agent_trigger_rules_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."ai_budgets"
    ADD CONSTRAINT "ai_budgets_pkey" PRIMARY KEY ("community_id");

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."annual_budgets"
    ADD CONSTRAINT "annual_budgets_community_id_year_category_key" UNIQUE ("community_id", "year", "category");

ALTER TABLE ONLY "public"."annual_budgets"
    ADD CONSTRAINT "annual_budgets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."api_rate_limits"
    ADD CONSTRAINT "api_rate_limits_pkey" PRIMARY KEY ("scope", "subject_hash");

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."billing_runs"
    ADD CONSTRAINT "billing_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."building_assets"
    ADD CONSTRAINT "building_assets_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."coco_sessions"
    ADD CONSTRAINT "coco_sessions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."coco_sessions"
    ADD CONSTRAINT "coco_sessions_user_key_key" UNIQUE ("user_key");

ALTER TABLE ONLY "public"."coco_user_memory"
    ADD CONSTRAINT "coco_user_memory_pkey" PRIMARY KEY ("user_id");

ALTER TABLE ONLY "public"."community_expenses"
    ADD CONSTRAINT "community_expenses_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."instagram_connections"
    ADD CONSTRAINT "instagram_connections_community_id_key" UNIQUE ("community_id");

ALTER TABLE ONLY "public"."instagram_connections"
    ADD CONSTRAINT "instagram_connections_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."marketing_reel_campaigns"
    ADD CONSTRAINT "marketing_reel_campaigns_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."marketing_reels"
    ADD CONSTRAINT "marketing_reels_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."marketplace_chats"
    ADD CONSTRAINT "marketplace_chats_item_id_buyer_id_key" UNIQUE ("item_id", "buyer_id");

ALTER TABLE ONLY "public"."marketplace_chats"
    ADD CONSTRAINT "marketplace_chats_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."onboarding_import_batches"
    ADD CONSTRAINT "onboarding_import_batches_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."onboarding_import_documents"
    ADD CONSTRAINT "onboarding_import_documents_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."onboarding_import_rows"
    ADD CONSTRAINT "onboarding_import_rows_batch_id_dedupe_key_key" UNIQUE ("batch_id", "dedupe_key");

ALTER TABLE ONLY "public"."onboarding_import_rows"
    ADD CONSTRAINT "onboarding_import_rows_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."operation_events"
    ADD CONSTRAINT "operation_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_access_events"
    ADD CONSTRAINT "parking_access_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_spot_availability"
    ADD CONSTRAINT "parking_availability_unique" UNIQUE ("spot_id", "weekday", "start_time", "end_time");

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_access_code_unique" UNIQUE ("community_id", "access_code");

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_no_overlap" EXCLUDE USING "gist" ("spot_id" WITH =, "tstzrange"("starts_at", "ends_at", '[)'::"text") WITH &&) WHERE (("status" = ANY (ARRAY['confirmed'::"text", 'active'::"text"])));

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_community_access"
    ADD CONSTRAINT "parking_community_access_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_community_access"
    ADD CONSTRAINT "parking_community_access_unique" UNIQUE ("driver_id", "community_id");

ALTER TABLE ONLY "public"."parking_drivers"
    ADD CONSTRAINT "parking_drivers_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_drivers"
    ADD CONSTRAINT "parking_drivers_profile_id_key" UNIQUE ("profile_id");

ALTER TABLE ONLY "public"."parking_drivers"
    ADD CONSTRAINT "parking_drivers_user_id_key" UNIQUE ("user_id");

ALTER TABLE ONLY "public"."parking_spot_availability"
    ADD CONSTRAINT "parking_spot_availability_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."parking_spots"
    ADD CONSTRAINT "parking_spots_label_unique_per_community" UNIQUE ("community_id", "label");

ALTER TABLE ONLY "public"."parking_spots"
    ADD CONSTRAINT "parking_spots_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."platform_operation_events"
    ADD CONSTRAINT "platform_operation_events_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."reserve_fund_movements"
    ADD CONSTRAINT "reserve_fund_movements_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."solidarity_applications"
    ADD CONSTRAINT "solidarity_applications_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."solidarity_contributions"
    ADD CONSTRAINT "solidarity_contributions_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."solidarity_funds"
    ADD CONSTRAINT "solidarity_funds_community_id_key" UNIQUE ("community_id");

ALTER TABLE ONLY "public"."solidarity_funds"
    ADD CONSTRAINT "solidarity_funds_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."solidarity_ledger"
    ADD CONSTRAINT "solidarity_ledger_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."solidarity_tasks"
    ADD CONSTRAINT "solidarity_tasks_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_cart_plans"
    ADD CONSTRAINT "supermarket_cart_plans_code_key" UNIQUE ("code");

ALTER TABLE ONLY "public"."supermarket_cart_plans"
    ADD CONSTRAINT "supermarket_cart_plans_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_group_order_items"
    ADD CONSTRAINT "supermarket_group_order_items_order_id_user_id_requested_te_key" UNIQUE ("order_id", "user_id", "requested_term");

ALTER TABLE ONLY "public"."supermarket_group_order_items"
    ADD CONSTRAINT "supermarket_group_order_items_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_group_order_members"
    ADD CONSTRAINT "supermarket_group_order_members_pkey" PRIMARY KEY ("order_id", "user_id");

ALTER TABLE ONLY "public"."supermarket_group_orders"
    ADD CONSTRAINT "supermarket_group_orders_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_price_history"
    ADD CONSTRAINT "supermarket_price_history_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_price_history"
    ADD CONSTRAINT "supermarket_price_history_run_id_product_id_query_key" UNIQUE ("run_id", "product_id", "query");

ALTER TABLE ONLY "public"."supermarket_products"
    ADD CONSTRAINT "supermarket_products_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."supermarket_products"
    ADD CONSTRAINT "supermarket_products_store_source_product_key_key" UNIQUE ("store", "source_product_key");

ALTER TABLE ONLY "public"."supermarket_scrape_runs"
    ADD CONSTRAINT "supermarket_scrape_runs_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."unit_charges"
    ADD CONSTRAINT "unit_charges_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_pkey" PRIMARY KEY ("id");

ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_pkey" PRIMARY KEY ("id");

CREATE OR REPLACE TRIGGER "touch_ai_budget_updated_at_trigger" BEFORE UPDATE ON "public"."ai_budgets" FOR EACH ROW EXECUTE FUNCTION "public"."touch_ai_budget_updated_at"();

CREATE OR REPLACE TRIGGER "trg_parking_bookings_touch" BEFORE UPDATE ON "public"."parking_bookings" FOR EACH ROW EXECUTE FUNCTION "public"."touch_parking_updated_at"();

CREATE OR REPLACE TRIGGER "trg_parking_drivers_normalize" BEFORE INSERT OR UPDATE ON "public"."parking_drivers" FOR EACH ROW EXECUTE FUNCTION "public"."normalize_parking_driver"();

CREATE OR REPLACE TRIGGER "trg_parking_drivers_touch" BEFORE UPDATE ON "public"."parking_drivers" FOR EACH ROW EXECUTE FUNCTION "public"."touch_parking_updated_at"();

CREATE OR REPLACE TRIGGER "trg_parking_spots_rules" BEFORE INSERT OR UPDATE ON "public"."parking_spots" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_parking_spot_rules"();

CREATE OR REPLACE TRIGGER "trg_parking_spots_touch" BEFORE UPDATE ON "public"."parking_spots" FOR EACH ROW EXECUTE FUNCTION "public"."touch_parking_updated_at"();

ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_tool_call_id_fkey" FOREIGN KEY ("tool_call_id") REFERENCES "public"."agent_tool_calls"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_action_approvals"
    ADD CONSTRAINT "agent_action_approvals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_activity_log"
    ADD CONSTRAINT "agent_activity_log_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_activity_log"
    ADD CONSTRAINT "agent_activity_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_policies"
    ADD CONSTRAINT "agent_policies_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_policies"
    ADD CONSTRAINT "agent_policies_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_runs"
    ADD CONSTRAINT "agent_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_task_steps"
    ADD CONSTRAINT "agent_task_steps_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."agent_tasks"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_tasks"
    ADD CONSTRAINT "agent_tasks_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_tool_calls"
    ADD CONSTRAINT "agent_tool_calls_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_tool_calls"
    ADD CONSTRAINT "agent_tool_calls_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_tool_calls"
    ADD CONSTRAINT "agent_tool_calls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "public"."agent_trigger_rules"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_trigger_events"
    ADD CONSTRAINT "agent_trigger_events_tool_call_id_fkey" FOREIGN KEY ("tool_call_id") REFERENCES "public"."agent_tool_calls"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."agent_trigger_rules"
    ADD CONSTRAINT "agent_trigger_rules_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."agent_trigger_rules"
    ADD CONSTRAINT "agent_trigger_rules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ai_budgets"
    ADD CONSTRAINT "ai_budgets_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."ai_usage_events"
    ADD CONSTRAINT "ai_usage_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."annual_budgets"
    ADD CONSTRAINT "annual_budgets_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."annual_budgets"
    ADD CONSTRAINT "annual_budgets_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."bank_transactions"
    ADD CONSTRAINT "bank_transactions_matched_payment_id_fkey" FOREIGN KEY ("matched_payment_id") REFERENCES "public"."unit_payments"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."billing_runs"
    ADD CONSTRAINT "billing_runs_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."billing_runs"
    ADD CONSTRAINT "billing_runs_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."building_assets"
    ADD CONSTRAINT "building_assets_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."chat_messages"
    ADD CONSTRAINT "chat_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."coco_user_memory"
    ADD CONSTRAINT "coco_user_memory_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."coco_user_memory"
    ADD CONSTRAINT "coco_user_memory_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."community_expenses"
    ADD CONSTRAINT "community_expenses_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."community_expenses"
    ADD CONSTRAINT "community_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."building_assets"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."maintenance_logs"
    ADD CONSTRAINT "maintenance_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."maintenance_tasks"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "public"."building_assets"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."maintenance_tasks"
    ADD CONSTRAINT "maintenance_tasks_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."marketing_reels"
    ADD CONSTRAINT "marketing_reels_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_reel_campaigns"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."marketplace_chats"
    ADD CONSTRAINT "marketplace_chats_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."marketplace_chats"
    ADD CONSTRAINT "marketplace_chats_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."marketplace_items"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."marketplace_chats"
    ADD CONSTRAINT "marketplace_chats_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "public"."marketplace_chats"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."marketplace_messages"
    ADD CONSTRAINT "marketplace_messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id");

ALTER TABLE ONLY "public"."onboarding_import_batches"
    ADD CONSTRAINT "onboarding_import_batches_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_import_documents"
    ADD CONSTRAINT "onboarding_import_documents_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."onboarding_import_batches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_import_documents"
    ADD CONSTRAINT "onboarding_import_documents_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_import_rows"
    ADD CONSTRAINT "onboarding_import_rows_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."onboarding_import_batches"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_import_rows"
    ADD CONSTRAINT "onboarding_import_rows_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."onboarding_import_rows"
    ADD CONSTRAINT "onboarding_import_rows_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."onboarding_import_documents"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."operation_events"
    ADD CONSTRAINT "operation_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."operation_events"
    ADD CONSTRAINT "operation_events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_access_events"
    ADD CONSTRAINT "parking_access_events_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "public"."parking_bookings"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_access_events"
    ADD CONSTRAINT "parking_access_events_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_access_events"
    ADD CONSTRAINT "parking_access_events_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_cancelled_by_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."parking_drivers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_bookings"
    ADD CONSTRAINT "parking_bookings_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_community_access"
    ADD CONSTRAINT "parking_community_access_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_community_access"
    ADD CONSTRAINT "parking_community_access_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "public"."parking_drivers"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_community_access"
    ADD CONSTRAINT "parking_community_access_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parking_drivers"
    ADD CONSTRAINT "parking_drivers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parking_drivers"
    ADD CONSTRAINT "parking_drivers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_spot_availability"
    ADD CONSTRAINT "parking_spot_availability_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "public"."parking_spots"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_spots"
    ADD CONSTRAINT "parking_spots_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."parking_spots"
    ADD CONSTRAINT "parking_spots_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."parking_spots"
    ADD CONSTRAINT "parking_spots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."reserve_fund_movements"
    ADD CONSTRAINT "reserve_fund_movements_billing_run_id_fkey" FOREIGN KEY ("billing_run_id") REFERENCES "public"."billing_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."reserve_fund_movements"
    ADD CONSTRAINT "reserve_fund_movements_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."reserve_fund_movements"
    ADD CONSTRAINT "reserve_fund_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."solidarity_applications"
    ADD CONSTRAINT "solidarity_applications_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_applications"
    ADD CONSTRAINT "solidarity_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_contributions"
    ADD CONSTRAINT "solidarity_contributions_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_contributions"
    ADD CONSTRAINT "solidarity_contributions_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."solidarity_contributions"
    ADD CONSTRAINT "solidarity_contributions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."solidarity_funds"
    ADD CONSTRAINT "solidarity_funds_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_ledger"
    ADD CONSTRAINT "solidarity_ledger_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_tasks"
    ADD CONSTRAINT "solidarity_tasks_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."solidarity_tasks"
    ADD CONSTRAINT "solidarity_tasks_reserved_by_fkey" FOREIGN KEY ("reserved_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."solidarity_tasks"
    ADD CONSTRAINT "solidarity_tasks_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."supermarket_cart_plans"
    ADD CONSTRAINT "supermarket_cart_plans_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_cart_plans"
    ADD CONSTRAINT "supermarket_cart_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_items"
    ADD CONSTRAINT "supermarket_group_order_items_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_items"
    ADD CONSTRAINT "supermarket_group_order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."supermarket_group_orders"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_items"
    ADD CONSTRAINT "supermarket_group_order_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_members"
    ADD CONSTRAINT "supermarket_group_order_members_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_members"
    ADD CONSTRAINT "supermarket_group_order_members_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."supermarket_group_orders"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_order_members"
    ADD CONSTRAINT "supermarket_group_order_members_paid_marked_by_fkey" FOREIGN KEY ("paid_marked_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."supermarket_group_order_members"
    ADD CONSTRAINT "supermarket_group_order_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_orders"
    ADD CONSTRAINT "supermarket_group_orders_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_group_orders"
    ADD CONSTRAINT "supermarket_group_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE RESTRICT;

ALTER TABLE ONLY "public"."supermarket_price_history"
    ADD CONSTRAINT "supermarket_price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "public"."supermarket_products"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_price_history"
    ADD CONSTRAINT "supermarket_price_history_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."supermarket_scrape_runs"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."supermarket_products"
    ADD CONSTRAINT "supermarket_products_last_run_id_fkey" FOREIGN KEY ("last_run_id") REFERENCES "public"."supermarket_scrape_runs"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_charges"
    ADD CONSTRAINT "unit_charges_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."unit_charges"
    ADD CONSTRAINT "unit_charges_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_charges"
    ADD CONSTRAINT "unit_charges_source_expense_id_fkey" FOREIGN KEY ("source_expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_charges"
    ADD CONSTRAINT "unit_charges_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "public"."unit_charges"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE ONLY "public"."unit_payments"
    ADD CONSTRAINT "unit_payments_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."units"("id") ON DELETE CASCADE;

ALTER TABLE ONLY "public"."visitors"
    ADD CONSTRAINT "visitors_community_id_fkey" FOREIGN KEY ("community_id") REFERENCES "public"."communities"("id") ON DELETE CASCADE;

-- ============================================================
-- Indices
-- ============================================================

CREATE INDEX "coco_sessions_user_key_idx" ON "public"."coco_sessions" USING "btree" ("user_key");

CREATE INDEX "idx_agent_activity_log_community_created" ON "public"."agent_activity_log" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_agent_policies_community" ON "public"."agent_policies" USING "btree" ("community_id", "agent_key");

CREATE INDEX "idx_agent_runs_community_created" ON "public"."agent_runs" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_agent_runs_user_created" ON "public"."agent_runs" USING "btree" ("user_id", "created_at" DESC);

CREATE INDEX "idx_agent_task_steps_task_position" ON "public"."agent_task_steps" USING "btree" ("task_id", "position");

CREATE INDEX "idx_agent_tasks_community_status_updated" ON "public"."agent_tasks" USING "btree" ("community_id", "status", "updated_at" DESC);

CREATE INDEX "idx_agent_tasks_next_run" ON "public"."agent_tasks" USING "btree" ("next_run_at") WHERE ("status" = ANY (ARRAY['planned'::"text", 'failed'::"text"]));

CREATE INDEX "idx_agent_tool_calls_run" ON "public"."agent_tool_calls" USING "btree" ("run_id");

CREATE INDEX "idx_agent_trigger_events_community_created" ON "public"."agent_trigger_events" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_agent_trigger_rules_due" ON "public"."agent_trigger_rules" USING "btree" ("enabled", "next_run_at");

CREATE INDEX "idx_ai_usage_events_community_created" ON "public"."ai_usage_events" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_ai_usage_events_module_created" ON "public"."ai_usage_events" USING "btree" ("module", "created_at" DESC);

CREATE INDEX "idx_ai_usage_events_user_created" ON "public"."ai_usage_events" USING "btree" ("user_id", "created_at" DESC);

CREATE INDEX "idx_annual_budgets_community_year" ON "public"."annual_budgets" USING "btree" ("community_id", "year");

CREATE INDEX "idx_bank_transactions_community" ON "public"."bank_transactions" USING "btree" ("community_id", "txn_date" DESC);

CREATE UNIQUE INDEX "idx_bank_transactions_dedup" ON "public"."bank_transactions" USING "btree" ("community_id", "txn_date", "amount", "reference") WHERE (("reference" IS NOT NULL) AND ("reference" <> ''::"text"));

CREATE UNIQUE INDEX "idx_bank_transactions_payment_once" ON "public"."bank_transactions" USING "btree" ("matched_payment_id") WHERE ("matched_payment_id" IS NOT NULL);

CREATE INDEX "idx_bank_transactions_status" ON "public"."bank_transactions" USING "btree" ("community_id", "status");

CREATE UNIQUE INDEX "idx_billing_runs_active_month" ON "public"."billing_runs" USING "btree" ("community_id", "month") WHERE ("status" = 'issued'::"text");

CREATE INDEX "idx_building_assets_community" ON "public"."building_assets" USING "btree" ("community_id");

CREATE INDEX "idx_community_expenses_month" ON "public"."community_expenses" USING "btree" ("community_id", "month");

CREATE INDEX "idx_instagram_connections_community" ON "public"."instagram_connections" USING "btree" ("community_id");

CREATE INDEX "idx_maintenance_logs_community_date" ON "public"."maintenance_logs" USING "btree" ("community_id", "date" DESC);

CREATE INDEX "idx_maintenance_tasks_community_status" ON "public"."maintenance_tasks" USING "btree" ("community_id", "status");

CREATE INDEX "idx_marketing_reel_campaigns_community" ON "public"."marketing_reel_campaigns" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_marketing_reels_community_created" ON "public"."marketing_reels" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_marketing_reels_schedule" ON "public"."marketing_reels" USING "btree" ("status", "scheduled_at") WHERE ("scheduled_at" IS NOT NULL);

CREATE INDEX "idx_memories_embedding" ON "public"."agent_memories" USING "hnsw" ("embedding" "public"."vector_cosine_ops");

CREATE INDEX "idx_memories_user" ON "public"."agent_memories" USING "btree" ("condominio_id", "user_id");

CREATE INDEX "idx_operation_events_action" ON "public"."operation_events" USING "btree" ("action");

CREATE INDEX "idx_operation_events_community_created" ON "public"."operation_events" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "idx_operation_events_severity_status" ON "public"."operation_events" USING "btree" ("severity", "status", "created_at" DESC);

CREATE INDEX "idx_platform_operation_events_created" ON "public"."platform_operation_events" USING "btree" ("created_at" DESC);

CREATE INDEX "idx_reserve_fund_community" ON "public"."reserve_fund_movements" USING "btree" ("community_id", "month");

CREATE UNIQUE INDEX "idx_reserve_fund_run_once" ON "public"."reserve_fund_movements" USING "btree" ("billing_run_id") WHERE (("billing_run_id" IS NOT NULL) AND ("kind" = 'contribution'::"text"));

CREATE INDEX "idx_supermarket_cart_plans_code" ON "public"."supermarket_cart_plans" USING "btree" ("code");

CREATE INDEX "idx_supermarket_cart_plans_expiry" ON "public"."supermarket_cart_plans" USING "btree" ("expires_at");

CREATE INDEX "idx_supermarket_group_items_community" ON "public"."supermarket_group_order_items" USING "btree" ("community_id", "order_id");

CREATE INDEX "idx_supermarket_group_members_community" ON "public"."supermarket_group_order_members" USING "btree" ("community_id", "order_id");

CREATE INDEX "idx_supermarket_group_orders_community" ON "public"."supermarket_group_orders" USING "btree" ("community_id", "status", "created_at" DESC);

CREATE INDEX "idx_supermarket_history_product_observed" ON "public"."supermarket_price_history" USING "btree" ("product_id", "observed_at" DESC);

CREATE INDEX "idx_supermarket_products_freshness" ON "public"."supermarket_products" USING "btree" ("last_seen_at" DESC) WHERE "in_stock";

CREATE INDEX "idx_supermarket_products_name" ON "public"."supermarket_products" USING "gin" ("to_tsvector"('"spanish"'::"regconfig", "name"));

CREATE INDEX "idx_supermarket_products_store_price" ON "public"."supermarket_products" USING "btree" ("store", "price") WHERE "in_stock";

CREATE INDEX "idx_unit_charges_community_status" ON "public"."unit_charges" USING "btree" ("community_id", "status");

CREATE UNIQUE INDEX "idx_unit_charges_interest_once" ON "public"."unit_charges" USING "btree" ("source_expense_id", "month") WHERE (("kind" = 'interest'::"text") AND ("status" <> 'cancelled'::"text"));

CREATE INDEX "idx_unit_charges_unit" ON "public"."unit_charges" USING "btree" ("unit_id", "month");

CREATE INDEX "idx_unit_payments_community" ON "public"."unit_payments" USING "btree" ("community_id", "paid_at" DESC);

CREATE UNIQUE INDEX "idx_unit_payments_reference_once" ON "public"."unit_payments" USING "btree" ("community_id", "unit_id", "reference") WHERE (("reference" IS NOT NULL) AND ("reference" <> ''::"text"));

CREATE INDEX "idx_unit_payments_unit" ON "public"."unit_payments" USING "btree" ("unit_id", "paid_at" DESC);

CREATE INDEX "idx_visitors_entry_time" ON "public"."visitors" USING "btree" ("entry_time" DESC);

CREATE INDEX "idx_visitors_unit" ON "public"."visitors" USING "btree" ("unit_id");

CREATE INDEX "onboarding_batches_community_created_idx" ON "public"."onboarding_import_batches" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "onboarding_documents_batch_idx" ON "public"."onboarding_import_documents" USING "btree" ("batch_id", "created_at");

CREATE INDEX "onboarding_documents_search_idx" ON "public"."onboarding_import_documents" USING "gin" ("search_vector");

CREATE INDEX "onboarding_rows_batch_status_idx" ON "public"."onboarding_import_rows" USING "btree" ("batch_id", "status");

CREATE INDEX "parking_access_events_booking_idx" ON "public"."parking_access_events" USING "btree" ("booking_id", "created_at" DESC);

CREATE INDEX "parking_access_events_community_idx" ON "public"."parking_access_events" USING "btree" ("community_id", "created_at" DESC);

CREATE INDEX "parking_bookings_community_window_idx" ON "public"."parking_bookings" USING "btree" ("community_id", "starts_at", "ends_at");

CREATE INDEX "parking_bookings_driver_idx" ON "public"."parking_bookings" USING "btree" ("driver_id", "starts_at" DESC);

CREATE INDEX "parking_bookings_owner_idx" ON "public"."parking_bookings" USING "btree" ("owner_id", "starts_at" DESC);

CREATE INDEX "parking_community_access_pending_idx" ON "public"."parking_community_access" USING "btree" ("community_id", "status");

CREATE INDEX "parking_drivers_plate_idx" ON "public"."parking_drivers" USING "btree" ("plate");

CREATE INDEX "parking_spot_availability_spot_idx" ON "public"."parking_spot_availability" USING "btree" ("spot_id", "weekday");

CREATE INDEX "parking_spots_community_published_idx" ON "public"."parking_spots" USING "btree" ("community_id", "status") WHERE ("status" = 'published'::"text");

CREATE INDEX "parking_spots_floor_level_idx" ON "public"."parking_spots" USING "btree" ("community_id", "floor_level");

CREATE INDEX "parking_spots_owner_idx" ON "public"."parking_spots" USING "btree" ("owner_id");

CREATE UNIQUE INDEX "solidarity_round_up_expense_unique" ON "public"."solidarity_contributions" USING "btree" ("expense_id") WHERE (("type" = 'round_up'::"text") AND ("expense_id" IS NOT NULL));

CREATE INDEX "supermarket_group_order_members_pending_idx" ON "public"."supermarket_group_order_members" USING "btree" ("order_id") WHERE ("paid_at" IS NULL);

CREATE INDEX "supermarket_products_missing_offer_id_idx" ON "public"."supermarket_products" USING "btree" ("store", "sku") WHERE ("offer_id" IS NULL);

CREATE INDEX "supermarket_products_stock_freshness_idx" ON "public"."supermarket_products" USING "btree" ("store", "last_seen_at") WHERE ("in_stock" = true);

CREATE UNIQUE INDEX "uq_operation_events_coco_tool_request" ON "public"."operation_events" USING "btree" ("community_id", "action", "request_id") WHERE (("request_id" IS NOT NULL) AND ("action" ~~ 'coco.tool.%'::"text"));

CREATE UNIQUE INDEX "uq_supermarket_group_orders_create_request" ON "public"."supermarket_group_orders" USING "btree" ("created_by", "client_request_id") WHERE ("client_request_id" IS NOT NULL);

-- ============================================================
-- Row Level Security y politicas
-- ============================================================

CREATE POLICY "Admins can manage marketing campaigns" ON "public"."marketing_reel_campaigns" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reel_campaigns"."community_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reel_campaigns"."community_id")))));

CREATE POLICY "Admins can manage marketing reels" ON "public"."marketing_reels" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reels"."community_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reels"."community_id")))));

CREATE POLICY "Admins can read marketing campaigns" ON "public"."marketing_reel_campaigns" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reel_campaigns"."community_id")))));

CREATE POLICY "Admins can read marketing reels" ON "public"."marketing_reels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "marketing_reels"."community_id")))));

CREATE POLICY "Admins can read own community operation events" ON "public"."operation_events" FOR SELECT USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));

CREATE POLICY "Admins can read own instagram connection" ON "public"."instagram_connections" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "instagram_connections"."community_id")))));

CREATE POLICY "Authenticated users can insert own community operation events" ON "public"."operation_events" FOR INSERT WITH CHECK (("community_id" = "public"."get_my_community_id"()));

CREATE POLICY "Backend has full access to agent_memories" ON "public"."agent_memories" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "Users create chats" ON "public"."marketplace_chats" FOR INSERT WITH CHECK (("auth"."uid"() = "buyer_id"));

CREATE POLICY "Users insert messages" ON "public"."marketplace_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."marketplace_chats" "c"
  WHERE (("c"."id" = "marketplace_messages"."chat_id") AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"())))))));

CREATE POLICY "Users update own chats" ON "public"."marketplace_chats" FOR UPDATE USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));

CREATE POLICY "Users update own messages (read receipt)" ON "public"."marketplace_messages" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."marketplace_chats" "c"
  WHERE (("c"."id" = "marketplace_messages"."chat_id") AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"()))))));

CREATE POLICY "Users view chat messages" ON "public"."marketplace_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."marketplace_chats" "c"
  WHERE (("c"."id" = "marketplace_messages"."chat_id") AND (("c"."buyer_id" = "auth"."uid"()) OR ("c"."seller_id" = "auth"."uid"()))))));

CREATE POLICY "Users view own chats" ON "public"."marketplace_chats" FOR SELECT USING ((("auth"."uid"() = "buyer_id") OR ("auth"."uid"() = "seller_id")));

ALTER TABLE "public"."agent_action_approvals" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_action_approvals_tenant_select" ON "public"."agent_action_approvals" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))));

ALTER TABLE "public"."agent_activity_log" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_activity_log_tenant_select" ON "public"."agent_activity_log" FOR SELECT USING (("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));

ALTER TABLE "public"."agent_memories" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."agent_policies" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_policies_admin_write" ON "public"."agent_policies" USING ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))) WITH CHECK ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));

CREATE POLICY "agent_policies_tenant_select" ON "public"."agent_policies" FOR SELECT USING (("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))));

ALTER TABLE "public"."agent_runs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_runs_tenant_select" ON "public"."agent_runs" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))));

ALTER TABLE "public"."agent_task_steps" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_task_steps_admin_write" ON "public"."agent_task_steps" USING ((EXISTS ( SELECT 1
   FROM "public"."agent_tasks" "task"
  WHERE (("task"."id" = "agent_task_steps"."task_id") AND ("task"."community_id" = ( SELECT "profiles"."community_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."agent_tasks" "task"
  WHERE (("task"."id" = "agent_task_steps"."task_id") AND ("task"."community_id" = ( SELECT "profiles"."community_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))))));

CREATE POLICY "agent_task_steps_tenant_select" ON "public"."agent_task_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."agent_tasks" "task"
  WHERE (("task"."id" = "agent_task_steps"."task_id") AND ("task"."community_id" = ( SELECT "profiles"."community_id"
           FROM "public"."profiles"
          WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
           FROM "public"."profiles"
          WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))))));

ALTER TABLE "public"."agent_tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tasks_admin_write" ON "public"."agent_tasks" USING ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))) WITH CHECK ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));

CREATE POLICY "agent_tasks_tenant_select" ON "public"."agent_tasks" FOR SELECT USING ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));

ALTER TABLE "public"."agent_tool_calls" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_tool_calls_tenant_select" ON "public"."agent_tool_calls" FOR SELECT USING ((("user_id" = "auth"."uid"()) OR (("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))));

ALTER TABLE "public"."agent_trigger_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_trigger_events_admin" ON "public"."agent_trigger_events" FOR SELECT USING ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));

ALTER TABLE "public"."agent_trigger_rules" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_trigger_rules_admin" ON "public"."agent_trigger_rules" USING ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))))) WITH CHECK ((("community_id" = ( SELECT "profiles"."community_id"
   FROM "public"."profiles"
  WHERE ("profiles"."id" = "auth"."uid"()))) AND (EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text"))))));

ALTER TABLE "public"."ai_budgets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_budgets_admin_read" ON "public"."ai_budgets" FOR SELECT USING ((("community_id" = "public"."current_profile_community_id"()) AND ("public"."current_profile_role"() = 'admin'::"text")));

CREATE POLICY "ai_usage_admin_read" ON "public"."ai_usage_events" FOR SELECT USING ((("community_id" = "public"."current_profile_community_id"()) AND ("public"."current_profile_role"() = 'admin'::"text")));

ALTER TABLE "public"."ai_usage_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."annual_budgets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_budgets_read" ON "public"."annual_budgets" FOR SELECT TO "authenticated" USING (("community_id" = "public"."get_my_community_id"()));

CREATE POLICY "annual_budgets_service_role" ON "public"."annual_budgets" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."api_rate_limits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "applications_admin_all" ON "public"."solidarity_applications" USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text")));

CREATE POLICY "applications_insert_own" ON "public"."solidarity_applications" FOR INSERT WITH CHECK ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND ("user_id" = "auth"."uid"())));

CREATE POLICY "applications_select_own_or_admin" ON "public"."solidarity_applications" FOR SELECT USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (("user_id" = "auth"."uid"()) OR (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text"))));

ALTER TABLE "public"."bank_transactions" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bank_transactions_admin_read" ON "public"."bank_transactions" FOR SELECT TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));

CREATE POLICY "bank_transactions_service_role" ON "public"."bank_transactions" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."billing_runs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "billing_runs_admin_read" ON "public"."billing_runs" FOR SELECT TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));

CREATE POLICY "billing_runs_service_role" ON "public"."billing_runs" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."building_assets" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "building_assets_admin_write" ON "public"."building_assets" TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))) WITH CHECK ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"]))));

CREATE POLICY "building_assets_read_authenticated" ON "public"."building_assets" FOR SELECT TO "authenticated" USING (("community_id" = "public"."get_my_community_id"()));

CREATE POLICY "chat_global_select" ON "public"."chat_messages" FOR SELECT USING (((("receiver_id" IS NULL) AND ("sender_id" IN ( SELECT "profiles"."id"
   FROM "public"."profiles"
  WHERE ("profiles"."community_id" = "public"."get_my_community_id"())))) OR ("sender_id" = "auth"."uid"()) OR ("receiver_id" = "auth"."uid"())));

CREATE POLICY "chat_insert" ON "public"."chat_messages" FOR INSERT WITH CHECK (("auth"."uid"() = "sender_id"));

ALTER TABLE "public"."chat_messages" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coco_sessions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."coco_user_memory" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coco_user_memory_own_read" ON "public"."coco_user_memory" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));

CREATE POLICY "coco_user_memory_service_role" ON "public"."coco_user_memory" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."community_expenses" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "community_expenses_admin_read" ON "public"."community_expenses" FOR SELECT TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = 'admin'::"text")));

CREATE POLICY "community_expenses_service_role" ON "public"."community_expenses" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "contributions_insert_own" ON "public"."solidarity_contributions" FOR INSERT WITH CHECK ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND ("user_id" = "auth"."uid"())));

CREATE POLICY "contributions_select_own" ON "public"."solidarity_contributions" FOR SELECT USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (("user_id" = "auth"."uid"()) OR (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text"))));

CREATE POLICY "funds_admin_all" ON "public"."solidarity_funds" USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text")));

CREATE POLICY "funds_select_community" ON "public"."solidarity_funds" FOR SELECT USING (("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));

ALTER TABLE "public"."instagram_connections" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ledger_admin_all" ON "public"."solidarity_ledger" USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text")));

CREATE POLICY "ledger_select_community" ON "public"."solidarity_ledger" FOR SELECT USING (("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));

ALTER TABLE "public"."maintenance_logs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_logs_admin_write" ON "public"."maintenance_logs" TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))) WITH CHECK ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"]))));

CREATE POLICY "maintenance_logs_read_authenticated" ON "public"."maintenance_logs" FOR SELECT TO "authenticated" USING (("community_id" = "public"."get_my_community_id"()));

ALTER TABLE "public"."maintenance_tasks" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_tasks_admin_write" ON "public"."maintenance_tasks" TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])))) WITH CHECK ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"]))));

CREATE POLICY "maintenance_tasks_read_authenticated" ON "public"."maintenance_tasks" FOR SELECT TO "authenticated" USING (("community_id" = "public"."get_my_community_id"()));

ALTER TABLE "public"."marketing_reel_campaigns" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."marketing_reels" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."marketplace_chats" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."marketplace_messages" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_batches_admin_select" ON "public"."onboarding_import_batches" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "onboarding_import_batches"."community_id")))));

CREATE POLICY "onboarding_documents_admin_select" ON "public"."onboarding_import_documents" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "onboarding_import_documents"."community_id")))));

ALTER TABLE "public"."onboarding_import_batches" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."onboarding_import_documents" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."onboarding_import_rows" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_rows_admin_select" ON "public"."onboarding_import_rows" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text") AND ("p"."community_id" = "onboarding_import_rows"."community_id")))));

ALTER TABLE "public"."operation_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."parking_access_events" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parking_access_events_read" ON "public"."parking_access_events" FOR SELECT TO "authenticated" USING (((("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) AND ("community_id" = "public"."get_my_community_id"())) OR (EXISTS ( SELECT 1
   FROM ("public"."parking_bookings" "b"
     LEFT JOIN "public"."parking_drivers" "d" ON (("d"."id" = "b"."driver_id")))
  WHERE (("b"."id" = "parking_access_events"."booking_id") AND (("b"."owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("d"."user_id" = ( SELECT "auth"."uid"() AS "uid"))))))));

CREATE POLICY "parking_availability_owner_write" ON "public"."parking_spot_availability" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parking_spots" "s"
  WHERE (("s"."id" = "parking_spot_availability"."spot_id") AND ("s"."owner_id" = ( SELECT "auth"."uid"() AS "uid")))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."parking_spots" "s"
  WHERE (("s"."id" = "parking_spot_availability"."spot_id") AND ("s"."owner_id" = ( SELECT "auth"."uid"() AS "uid"))))));

CREATE POLICY "parking_availability_read" ON "public"."parking_spot_availability" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."parking_spots" "s"
  WHERE ("s"."id" = "parking_spot_availability"."spot_id"))));

ALTER TABLE "public"."parking_bookings" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parking_bookings_read" ON "public"."parking_bookings" FOR SELECT TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR ("driver_id" = "public"."my_parking_driver_id"()) OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) AND ("community_id" = "public"."get_my_community_id"()))));

ALTER TABLE "public"."parking_community_access" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parking_community_access_read" ON "public"."parking_community_access" FOR SELECT TO "authenticated" USING ((("driver_id" = "public"."my_parking_driver_id"()) OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) AND ("community_id" = "public"."get_my_community_id"()))));

ALTER TABLE "public"."parking_drivers" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parking_drivers_self_select" ON "public"."parking_drivers" FOR SELECT TO "authenticated" USING ((("user_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("public"."get_my_role"() = ANY (ARRAY['concierge'::"text", 'admin'::"text"])) AND "public"."parking_driver_linked_to_community"("id", "public"."get_my_community_id"()))));

CREATE POLICY "parking_drivers_self_update" ON "public"."parking_drivers" FOR UPDATE TO "authenticated" USING (("user_id" = ( SELECT "auth"."uid"() AS "uid"))) WITH CHECK (("user_id" = ( SELECT "auth"."uid"() AS "uid")));

ALTER TABLE "public"."parking_spot_availability" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."parking_spots" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "parking_spots_owner_delete" ON "public"."parking_spots" FOR DELETE TO "authenticated" USING (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "parking_spots_owner_insert" ON "public"."parking_spots" FOR INSERT TO "authenticated" WITH CHECK (("owner_id" = ( SELECT "auth"."uid"() AS "uid")));

CREATE POLICY "parking_spots_owner_update" ON "public"."parking_spots" FOR UPDATE TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("public"."get_my_role"() = 'admin'::"text") AND ("community_id" = "public"."get_my_community_id"())))) WITH CHECK ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("public"."get_my_role"() = 'admin'::"text") AND ("community_id" = "public"."get_my_community_id"()))));

CREATE POLICY "parking_spots_read" ON "public"."parking_spots" FOR SELECT TO "authenticated" USING ((("owner_id" = ( SELECT "auth"."uid"() AS "uid")) OR (("status" = 'published'::"text") AND ("community_id" = "public"."get_my_community_id"())) OR (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) AND ("community_id" = "public"."get_my_community_id"())) OR (("status" = 'published'::"text") AND "allows_external" AND (EXISTS ( SELECT 1
   FROM "public"."communities" "c"
  WHERE (("c"."id" = "parking_spots"."community_id") AND "c"."parking_external_enabled"))) AND ("public"."my_parking_driver_id"() IS NOT NULL))));

ALTER TABLE "public"."platform_operation_events" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."reserve_fund_movements" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserve_fund_read" ON "public"."reserve_fund_movements" FOR SELECT TO "authenticated" USING (("community_id" = "public"."get_my_community_id"()));

CREATE POLICY "reserve_fund_service_role" ON "public"."reserve_fund_movements" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."solidarity_applications" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."solidarity_contributions" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."solidarity_funds" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."solidarity_ledger" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."solidarity_tasks" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supermarket_cart_plans" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supermarket_cart_plans_service_role" ON "public"."supermarket_cart_plans" TO "service_role" USING (true) WITH CHECK (true);

CREATE POLICY "supermarket_group_items_insert_own" ON "public"."supermarket_group_order_items" FOR INSERT TO "authenticated" WITH CHECK ((("community_id" = "public"."current_profile_community_id"()) AND ("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."supermarket_group_orders" "orders"
  WHERE (("orders"."id" = "supermarket_group_order_items"."order_id") AND ("orders"."community_id" = "supermarket_group_order_items"."community_id") AND ("orders"."status" = ANY (ARRAY['open'::"text", 'ready'::"text"])))))));

CREATE POLICY "supermarket_group_items_read_community" ON "public"."supermarket_group_order_items" FOR SELECT TO "authenticated" USING (("community_id" = "public"."current_profile_community_id"()));

CREATE POLICY "supermarket_group_items_update_own" ON "public"."supermarket_group_order_items" FOR UPDATE TO "authenticated" USING ((("community_id" = "public"."current_profile_community_id"()) AND ("user_id" = "auth"."uid"()))) WITH CHECK ((("community_id" = "public"."current_profile_community_id"()) AND ("user_id" = "auth"."uid"())));

CREATE POLICY "supermarket_group_members_insert_own" ON "public"."supermarket_group_order_members" FOR INSERT TO "authenticated" WITH CHECK ((("community_id" = "public"."current_profile_community_id"()) AND ("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."supermarket_group_orders" "orders"
  WHERE (("orders"."id" = "supermarket_group_order_members"."order_id") AND ("orders"."community_id" = "supermarket_group_order_members"."community_id") AND ("orders"."status" = ANY (ARRAY['open'::"text", 'ready'::"text"])))))));

CREATE POLICY "supermarket_group_members_read_community" ON "public"."supermarket_group_order_members" FOR SELECT TO "authenticated" USING (("community_id" = "public"."current_profile_community_id"()));

ALTER TABLE "public"."supermarket_group_order_items" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supermarket_group_order_members" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supermarket_group_orders" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supermarket_group_orders_insert_own" ON "public"."supermarket_group_orders" FOR INSERT TO "authenticated" WITH CHECK ((("community_id" = "public"."current_profile_community_id"()) AND ("created_by" = "auth"."uid"())));

CREATE POLICY "supermarket_group_orders_read_community" ON "public"."supermarket_group_orders" FOR SELECT TO "authenticated" USING (("community_id" = "public"."current_profile_community_id"()));

CREATE POLICY "supermarket_group_orders_update_owner_admin" ON "public"."supermarket_group_orders" FOR UPDATE TO "authenticated" USING ((("community_id" = "public"."current_profile_community_id"()) AND (("created_by" = "auth"."uid"()) OR ("public"."current_profile_role"() = 'admin'::"text")))) WITH CHECK ((("community_id" = "public"."current_profile_community_id"()) AND (("created_by" = "auth"."uid"()) OR ("public"."current_profile_role"() = 'admin'::"text"))));

CREATE POLICY "supermarket_history_authenticated_read" ON "public"."supermarket_price_history" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."supermarket_price_history" ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."supermarket_products" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "supermarket_products_authenticated_read" ON "public"."supermarket_products" FOR SELECT TO "authenticated" USING (true);

CREATE POLICY "supermarket_runs_authenticated_read" ON "public"."supermarket_scrape_runs" FOR SELECT TO "authenticated" USING (true);

ALTER TABLE "public"."supermarket_scrape_runs" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_admin_all" ON "public"."solidarity_tasks" USING ((("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)) AND (( SELECT "p"."role"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1) = 'admin'::"text")));

CREATE POLICY "tasks_select_community" ON "public"."solidarity_tasks" FOR SELECT USING (("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));

CREATE POLICY "tasks_update_community_members" ON "public"."solidarity_tasks" FOR UPDATE USING (("community_id" = ( SELECT "p"."community_id"
   FROM "public"."profiles" "p"
  WHERE ("p"."id" = "auth"."uid"())
 LIMIT 1)));

ALTER TABLE "public"."unit_charges" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_charges_read" ON "public"."unit_charges" FOR SELECT TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) OR ("unit_id" IN ( SELECT "units"."id"
   FROM "public"."units"
  WHERE ("units"."owner_id" = "auth"."uid"()))))));

CREATE POLICY "unit_charges_service_role" ON "public"."unit_charges" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."unit_payments" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "unit_payments_read" ON "public"."unit_payments" FOR SELECT TO "authenticated" USING ((("community_id" = "public"."get_my_community_id"()) AND (("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"])) OR ("unit_id" IN ( SELECT "units"."id"
   FROM "public"."units"
  WHERE ("units"."owner_id" = "auth"."uid"()))))));

CREATE POLICY "unit_payments_service_role" ON "public"."unit_payments" TO "service_role" USING (true) WITH CHECK (true);

ALTER TABLE "public"."visitors" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "visitors_all_staff_community" ON "public"."visitors" USING ((("community_id" = "public"."get_my_community_id"()) AND ("public"."get_my_role"() = ANY (ARRAY['admin'::"text", 'concierge'::"text"]))));

CREATE POLICY "visitors_select_community_only" ON "public"."visitors" FOR SELECT USING (("community_id" = "public"."get_my_community_id"()));

COMMIT;

-- Confirmed purchases and atomic history preference (20260906164806)
-- Previous rows are comparisons, not confirmed purchases. Keep them out of
-- repurchase suggestions without deleting the user's existing data.
ALTER TABLE public.supermarket_purchase_history
  ADD COLUMN IF NOT EXISTS confirmed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.set_supermarket_history_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'Authentication and preference required';
  END IF;
  UPDATE public.profiles
  SET supermarket_history_enabled = p_enabled
  WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile unavailable';
  END IF;
  IF NOT p_enabled THEN
    DELETE FROM public.supermarket_purchase_history WHERE user_id = auth.uid();
  END IF;
  RETURN p_enabled;
END;
$$;

REVOKE ALL ON FUNCTION public.set_supermarket_history_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_supermarket_history_enabled(boolean) TO authenticated;
