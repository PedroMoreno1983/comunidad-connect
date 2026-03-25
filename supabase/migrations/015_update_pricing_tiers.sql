-- =====================================================
-- MIGRATION: 015_update_pricing_tiers.sql
-- Define the official SaaS Pricing Plans and Module Features
-- =====================================================

-- 1. Básico (Essential)
-- Incluye: Comunidad (Muro, Avisos), Conserjería Básica, y Finanzas.
-- NO Incluye: Amenidades, Mantenimiento, Votaciones, ni Inteligencia Artificial.
UPDATE public.pricing_tiers
SET 
  price_per_unit = 490, 
  base_price = 19990, 
  features = '{
    "amenities": true, 
    "maintenance": false, 
    "voting": false, 
    "coco_ai": false
  }'::jsonb
WHERE name = 'Essential';

-- 2. Avanzado (Pro)
-- Incluye: Todo lo básico + Reservas (Amenities), Mantenimiento (Solicitudes), Votaciones online.
-- NO Incluye: Inteligencia Artificial (CoCo) ni Aula Virtual.
UPDATE public.pricing_tiers
SET 
  price_per_unit = 690, 
  base_price = 34990, 
  features = '{
    "amenities": true, 
    "maintenance": true, 
    "voting": true, 
    "coco_ai": false
  }'::jsonb
WHERE name = 'Pro';

-- 3. Premium (Enterprise)
-- Incluye: Absolutamente todo (Amenities, Mantenimiento, Votaciones) + Inteligencia Artificial (CoCo) y Aula Virtual.
UPDATE public.pricing_tiers
SET 
  price_per_unit = 990, 
  base_price = 49990, 
  features = '{
    "amenities": true, 
    "maintenance": true, 
    "voting": true, 
    "coco_ai": true
  }'::jsonb
WHERE name = 'Enterprise';

-- (Si por alguna razón la tabla estaba vacía o con otros nombres, los insertamos)
INSERT INTO public.pricing_tiers (id, name, price_per_unit, base_price, features)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Essential', 490, 19990, '{"amenities": true, "maintenance": false, "voting": false, "coco_ai": false}'::jsonb),
  ('22222222-2222-2222-2222-222222222222', 'Pro', 690, 34990, '{"amenities": true, "maintenance": true, "voting": true, "coco_ai": false}'::jsonb),
  ('33333333-3333-3333-3333-333333333333', 'Enterprise', 990, 49990, '{"amenities": true, "maintenance": true, "voting": true, "coco_ai": true}'::jsonb)
ON CONFLICT (name) DO NOTHING;
