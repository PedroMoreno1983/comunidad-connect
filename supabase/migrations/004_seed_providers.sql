-- Seed data for service providers
-- Run this after 003_enhance_service_providers.sql

-- Insert plumbing providers (Gasfitería)
INSERT INTO service_providers (
  name, category, rating, review_count, contact_phone, email,
  bio, years_experience, specialties, certifications,
  hourly_rate, availability, response_time, completed_jobs, verified
) VALUES
(
  'Juan Carlos Pérez',
  'plumbing',
  4.8,
  24,
  '+56 9 8765 4321',
  'juan.perez@gasfiteria.cl',
  'Maestro gasfitero con más de 15 años de experiencia en reparaciones residenciales y comerciales. Especializado en instalaciones de alta presión y sistemas de calefacción central.',
  15,
  ARRAY['Reparación de cañerías', 'Instalación de calefones', 'Destape de cañerías', 'Instalación de sistemas de agua caliente'],
  ARRAY['Certificado SEC Clase A', 'Certificación en Instalaciones de Gas'],
  15000,
  'available',
  '< 2 horas',
  187,
  true
),
(
  'María González',
  'plumbing',
  4.9,
  31,
  '+56 9 7654 3210',
  'maria.gonzalez@plomeria.cl',
  'Ingeniera especialista en gasfitería con enfoque en eficiencia energética y soluciones sustentables para el hogar.',
  8,
  ARRAY['Sistemas de agua caliente solar', 'Reparación de fugas', 'Instalación de grifería', 'Mantención preventiva'],
  ARRAY['Ingeniera Civil Hidráulica', 'Certificación en Energías Renovables'],
  18000,
  'busy',
  '< 4 horas',
  156,
  true
),
(
  'Roberto Silva',
  'plumbing',
  4.6,
  18,
  '+56 9 6543 2109',
  null,
  'Gasfitero de emergencias disponible 24/7. Rápido, confiable y con precios justos.',
  12,
  ARRAY['Emergencias 24/7', 'Destape urgente', 'Reparación de filtraciones', 'Cambio de cañerías'],
  ARRAY['Técnico Certificado en Gasfitería'],
  12000,
  'available',
  '< 1 hora',
  243,
  false
);

-- Insert electrical providers (Electricidad)
INSERT INTO service_providers (
  name, category, rating, review_count, contact_phone, email,
  bio, years_experience, specialties, certifications,
  hourly_rate, availability, response_time, completed_jobs, verified
) VALUES
(
  'Carlos Andrés Muñoz',
  'electrical',
  4.9,
  42,
  '+56 9 5432 1098',
  'carlos.munoz@electrico.cl',
  'Electricista certificado con experiencia en instalaciones residenciales e industriales. Especialista en paneles solares y domótica.',
  20,
  ARRAY['Instalación eléctrica completa', 'Paneles solares', 'Domótica y automatización', 'Mantención de tableros'],
  ARRAY['Electricista Categoría A SEC', 'Certificación en Energía Solar', 'Instalador Domótico Certificado'],
  20000,
  'available',
  '< 3 horas',
  312,
  true
),
(
  'Patricia Rojas',
  'electrical',
  4.7,
  28,
  '+56 9 4321 0987',
  'p.rojas@electricidad.cl',
  'Técnico electricista con enfoque en eficiencia energética y detección de fallas eléctricas.',
  10,
  ARRAY['Detección de fallas', 'Cambio de tableros', 'Iluminación LED', 'Certificación eléctrica'],
  ARRAY['Técnico Electricista SEC', 'Certificación en Eficiencia Energética'],
  16000,
  'available',
  '< 2 horas',
  198,
  true
),
(
  'Diego Morales',
  'electrical',
  4.5,
  15,
  '+56 9 3210 9876',
  null,
  'Electricista de emergencias con servicio rápido y garantizado. Disponible para urgencias.',
  7,
  ARRAY['Emergencias eléctricas', 'Reparación de cortocircuitos', 'Instalación de enchufes', 'Cambio de interruptores'],
  ARRAY['Electricista Categoría B SEC'],
  14000,
  'busy',
  '< 1 hora',
  142,
  false
);

-- Insert locksmith providers (Cerrajería)
INSERT INTO service_providers (
  name, category, rating, review_count, contact_phone, email,
  bio, years_experience, specialties, certifications,
  hourly_rate, availability, response_time, completed_jobs, verified
) VALUES
(
  'Sergio Vásquez',
  'locksmith',
  4.8,
  35,
  '+56 9 2109 8765',
  'sergio.vasquez@cerrajeria.cl',
  'Maestro cerrajero con especialización en sistemas de seguridad avanzados y cerraduras inteligentes.',
  18,
  ARRAY['Apertura de puertas', 'Instalación de cerraduras inteligentes', 'Sistemas de seguridad', 'Duplicado de llaves de alta seguridad'],
  ARRAY['Maestro Cerrajero Certificado', 'Especialista en Sistemas de Seguridad'],
  16000,
  'available',
  '< 30 minutos',
  276,
  true
),
(
  'Lorena Campos',
  'locksmith',
  4.9,
  29,
  '+56 9 1098 7654',
  'lorena.campos@seguridad.cl',
  'Cerrajera especialista en seguridad residencial con enfoque en prevención y asesoría.',
  12,
  ARRAY['Cambio de cerraduras', 'Instalación de cerrojos', 'Asesoría en seguridad', 'Cerraduras anti-bumping'],
  ARRAY['Cerrajera Profesional', 'Certificación en Seguridad Residencial'],
  15000,
  'available',
  '< 1 hora',
  203,
  true
),
(
  'Andrés Navarro',
  'locksmith',
  4.6,
  21,
  '+56 9 0987 6543',
  null,
  'Cerrajero de emergencias disponible 24/7 para aperturas urgentes y cambio de cerraduras.',
  9,
  ARRAY['Apertura de emergencia', 'Cerrajero 24/7', 'Cambio de combinaciones', 'Reparación de cerraduras'],
  ARRAY['Cerrajero Técnico'],
  13000,
  'available',
  '< 45 minutos',
  167,
  false
);

-- Insert sample reviews
INSERT INTO reviews (provider_id, user_id, rating, comment, service_type)
SELECT 
  sp.id,
  p.id,
  5,
  'Excelente servicio, muy profesional y rápido. Solucionó el problema de inmediato.',
  'Reparación de fuga'
FROM service_providers sp
CROSS JOIN profiles p
WHERE sp.name = 'Juan Carlos Pérez'
LIMIT 1;

INSERT INTO reviews (provider_id, user_id, rating, comment, service_type)
SELECT 
  sp.id,
  p.id,
  5,
  'Súper recomendada! Explicó todo claramente y dejó el trabajo impecable.',
  'Instalación de calefón'
FROM service_providers sp
CROSS JOIN profiles p
WHERE sp.name = 'María González'
LIMIT 1;

INSERT INTO reviews (provider_id, user_id, rating, comment, service_type)
SELECT 
  sp.id,
  p.id,
  5,
  'Llegó súper rápido para la emergencia. Muy buen precio y calidad.',
  'Reparación de panel eléctrico'
FROM service_providers sp
CROSS JOIN profiles p
WHERE sp.name = 'Carlos Andrés Muñoz'
LIMIT 1;

-- Add indexes for better performance with new columns
CREATE INDEX IF NOT EXISTS idx_service_providers_category ON service_providers(category);
CREATE INDEX IF NOT EXISTS idx_service_providers_rating ON service_providers(rating DESC);
CREATE INDEX IF NOT EXISTS idx_service_providers_verified ON service_providers(verified);
CREATE INDEX IF NOT EXISTS idx_service_providers_availability ON service_providers(availability);
