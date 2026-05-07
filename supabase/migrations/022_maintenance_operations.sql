-- Maintenance operations schema and demo seed.
-- This supports the admin maintenance command center without relying on
-- mock-only frontend data.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS building_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  brand TEXT,
  model TEXT,
  installation_date DATE,
  location TEXT,
  health_status TEXT NOT NULL DEFAULT 'optimal' CHECK (health_status IN ('optimal', 'warning', 'critical')),
  last_maintenance DATE,
  next_maintenance DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  asset_id UUID REFERENCES building_assets(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  frequency TEXT NOT NULL DEFAULT 'monthly',
  due_date DATE NOT NULL DEFAULT CURRENT_DATE,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'overdue')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
  asset_id UUID REFERENCES building_assets(id) ON DELETE SET NULL,
  task_id UUID REFERENCES maintenance_tasks(id) ON DELETE SET NULL,
  performed_by TEXT NOT NULL DEFAULT 'Administracion',
  description TEXT NOT NULL,
  cost NUMERIC(12, 0) NOT NULL DEFAULT 0,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  attachments TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_building_assets_community ON building_assets(community_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_community_status ON maintenance_tasks(community_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenance_logs_community_date ON maintenance_logs(community_id, date DESC);

ALTER TABLE building_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "building_assets_read_authenticated" ON building_assets;
CREATE POLICY "building_assets_read_authenticated" ON building_assets FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "maintenance_tasks_read_authenticated" ON maintenance_tasks;
CREATE POLICY "maintenance_tasks_read_authenticated" ON maintenance_tasks FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "maintenance_logs_read_authenticated" ON maintenance_logs;
CREATE POLICY "maintenance_logs_read_authenticated" ON maintenance_logs FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "building_assets_admin_write" ON building_assets;
CREATE POLICY "building_assets_admin_write" ON building_assets FOR ALL TO authenticated USING (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
) WITH CHECK (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

DROP POLICY IF EXISTS "maintenance_tasks_admin_write" ON maintenance_tasks;
CREATE POLICY "maintenance_tasks_admin_write" ON maintenance_tasks FOR ALL TO authenticated USING (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
) WITH CHECK (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

DROP POLICY IF EXISTS "maintenance_logs_admin_write" ON maintenance_logs;
CREATE POLICY "maintenance_logs_admin_write" ON maintenance_logs FOR ALL TO authenticated USING (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
) WITH CHECK (
  (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

INSERT INTO building_assets (
  id, name, category, brand, model, installation_date, location, health_status, last_maintenance, next_maintenance
) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Bomba presurizadora A', 'pump', 'Grundfos', 'CME 10', '2020-03-12', 'Sala bombas -1', 'warning', CURRENT_DATE - INTERVAL '22 days', CURRENT_DATE + INTERVAL '2 days'),
  ('22222222-2222-4222-8222-222222222222', 'Ascensor torre B', 'elevator', 'Otis', 'Gen2', '2019-09-18', 'Torre B', 'optimal', CURRENT_DATE - INTERVAL '9 days', CURRENT_DATE + INTERVAL '9 days'),
  ('33333333-3333-4333-8333-333333333333', 'Tablero emergencia', 'electrical', 'Schneider', 'Prisma', '2018-06-03', 'Sala electrica', 'critical', CURRENT_DATE - INTERVAL '45 days', CURRENT_DATE + INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

INSERT INTO maintenance_tasks (
  id, asset_id, title, description, frequency, due_date, priority, status
) VALUES
  ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Revision sala de bombas', 'Medir presion, revisar sellos y validar tablero de control.', 'monthly', CURRENT_DATE + INTERVAL '2 days', 'high', 'pending'),
  ('55555555-5555-4555-8555-555555555555', '22222222-2222-4222-8222-222222222222', 'Prueba ascensor torre B', 'Prueba de rescate, sensores de puerta y bitacora normativa.', 'monthly', CURRENT_DATE + INTERVAL '9 days', 'medium', 'pending'),
  ('66666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333', 'Normalizar tablero emergencia', 'Revisar termicos, rotulacion y continuidad de circuito critico.', 'quarterly', CURRENT_DATE + INTERVAL '1 day', 'high', 'overdue')
ON CONFLICT (id) DO NOTHING;

INSERT INTO maintenance_logs (
  id, asset_id, task_id, performed_by, description, cost, date
) VALUES
  ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', NULL, 'Mantencion interna', 'Cambio de sello y prueba de presion.', 180000, CURRENT_DATE - INTERVAL '7 days'),
  ('88888888-8888-4888-8888-888888888888', '22222222-2222-4222-8222-222222222222', NULL, 'Proveedor ascensores', 'Limpieza de sensores y ajuste de puertas.', 95000, CURRENT_DATE - INTERVAL '4 days'),
  ('99999999-9999-4999-8999-999999999999', '33333333-3333-4333-8333-333333333333', NULL, 'Electricista certificado', 'Inspeccion de tablero y recomendacion de reemplazo de diferencial.', 175000, CURRENT_DATE - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;
