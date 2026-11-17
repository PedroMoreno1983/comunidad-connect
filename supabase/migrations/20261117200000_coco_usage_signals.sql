-- Datos agregados de CoCo para la administración (17-11-2026).
--
-- Por cada mensaje de un residente se guarda solo el TEMA (lista cerrada),
-- nunca el texto. Sin políticas para usuarios: con RLS activo, ni la
-- administración ni los residentes leen filas. El servidor agrega y esconde
-- los grupos de menos de 3 personas (src/lib/coco/usageSignals.ts).

CREATE TABLE IF NOT EXISTS public.coco_usage_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    channel TEXT NOT NULL CHECK (channel IN ('web', 'whatsapp')),
    topic TEXT NOT NULL CHECK (topic IN (
        'gastos_comunes', 'reservas', 'mantencion', 'convivencia', 'seguridad_accesos',
        'estacionamientos_bodegas', 'asambleas_votaciones', 'reglamento_legal', 'compras_marketplace', 'otros'
    )),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS coco_usage_signals_community_idx ON public.coco_usage_signals (community_id, created_at DESC);

ALTER TABLE public.coco_usage_signals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_usage_signals FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.coco_usage_signals TO service_role;

COMMENT ON TABLE public.coco_usage_signals IS
    'Tema (no texto) de cada mensaje de un residente a CoCo. Solo el servidor lo lee; la administración ve agregados con mínimo 3 personas por grupo.';
