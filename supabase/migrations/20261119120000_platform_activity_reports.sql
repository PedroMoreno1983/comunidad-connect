-- Reporte de actividad de la plataforma, mañana y tarde (19-11-2026).
--
-- Cada envío deja aquí su ventana y hasta qué mensaje revisó de cada
-- conversación de CoCo, para que el siguiente reporte no repita problemas.
-- Solo lo lee y escribe el servidor.

CREATE TABLE IF NOT EXISTS public.platform_activity_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- '2026-11-19-am' / '2026-11-19-pm': el cron no envía dos veces el mismo turno.
    report_key TEXT NOT NULL UNIQUE,
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    recipients TEXT[] NOT NULL DEFAULT '{}',
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    session_offsets JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.platform_activity_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_activity_reports FROM anon, authenticated;
GRANT ALL ON public.platform_activity_reports TO service_role;
