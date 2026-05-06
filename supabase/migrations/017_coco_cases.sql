-- Migration 017: CoCo operational cases
-- Stores AI-routed resident, concierge, and admin events without depending on
-- older maintenance/service request schemas.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS coco_cases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  community_id UUID REFERENCES communities(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  unit_id UUID REFERENCES units(id) ON DELETE SET NULL,
  unit_label TEXT,
  role TEXT NOT NULL DEFAULT 'resident' CHECK (role IN ('admin', 'resident', 'concierge')),
  channel TEXT NOT NULL DEFAULT 'web',
  type TEXT NOT NULL CHECK (type IN (
    'consulta_info',
    'reclamo',
    'incidencia',
    'emergencia',
    'gestion_admin',
    'novedad_turno',
    'actualizacion_ticket',
    'alerta_seguridad',
    'solicitud_gestion'
  )),
  category TEXT NOT NULL CHECK (category IN (
    'plomeria',
    'electricidad',
    'ruido',
    'seguridad',
    'aseo',
    'ascensor',
    'areas_comunes',
    'finanzas',
    'administracion',
    'otro'
  )),
  urgency TEXT NOT NULL CHECK (urgency IN ('baja', 'media', 'alta', 'emergencia')),
  action TEXT NOT NULL CHECK (action IN (
    'responder_directo',
    'crear_ticket',
    'escalar_conserjeria',
    'escalar_admin',
    'protocolo_emergencia',
    'registrar_bitacora',
    'actualizar_ticket',
    'notificar_admin',
    'solicitar_clarificacion'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  reason TEXT,
  source_message TEXT NOT NULL,
  assistant_reply TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed', 'cancelled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_coco_cases_community_created ON coco_cases(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coco_cases_status ON coco_cases(status);
CREATE INDEX IF NOT EXISTS idx_coco_cases_urgency ON coco_cases(urgency);
CREATE INDEX IF NOT EXISTS idx_coco_cases_user_id ON coco_cases(user_id);
CREATE INDEX IF NOT EXISTS idx_coco_cases_unit_id ON coco_cases(unit_id);

ALTER TABLE coco_cases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coco_cases_select_community" ON coco_cases;
CREATE POLICY "coco_cases_select_community" ON coco_cases FOR SELECT USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (
    user_id = auth.uid()
    OR (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
  )
);

DROP POLICY IF EXISTS "coco_cases_insert_own" ON coco_cases;
CREATE POLICY "coco_cases_insert_own" ON coco_cases FOR INSERT WITH CHECK (
  user_id = auth.uid()
  OR (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

DROP POLICY IF EXISTS "coco_cases_update_staff" ON coco_cases;
CREATE POLICY "coco_cases_update_staff" ON coco_cases FOR UPDATE USING (
  community_id = (SELECT community_id FROM profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND (SELECT role FROM profiles p WHERE p.id = auth.uid() LIMIT 1) IN ('admin', 'concierge')
);

CREATE OR REPLACE FUNCTION update_coco_cases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS coco_cases_updated_at ON coco_cases;
CREATE TRIGGER coco_cases_updated_at
  BEFORE UPDATE ON coco_cases
  FOR EACH ROW
  EXECUTE FUNCTION update_coco_cases_updated_at();
