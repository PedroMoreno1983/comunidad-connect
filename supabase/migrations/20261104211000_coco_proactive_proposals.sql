-- Propuestas que CoCo deja al administrador cuando el scheduler externo
-- corre cada 15 minutos. No borra datos. Nadie del cliente escribe directo:
-- el servidor usa service_role y la pantalla de actividad confirma.

CREATE TABLE IF NOT EXISTS public.coco_proactive_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('overdue_followup', 'pending_bookings')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'accepted', 'dismissed')),
  title text NOT NULL,
  body text NOT NULL,
  href text NOT NULL,
  subject_count integer NOT NULL DEFAULT 0 CHECK (subject_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS coco_proactive_proposals_one_open
  ON public.coco_proactive_proposals (community_id, kind)
  WHERE status = 'proposed';

CREATE INDEX IF NOT EXISTS coco_proactive_proposals_community_created
  ON public.coco_proactive_proposals (community_id, created_at DESC);

ALTER TABLE public.coco_proactive_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_proactive_proposals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_proactive_proposals TO service_role;

-- Una fila por modo y ventana de 15 minutos. Si la llamada se repite, no vuelve a trabajar.
CREATE TABLE IF NOT EXISTS public.coco_scheduler_ticks (
  mode text NOT NULL,
  bucket timestamptz NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mode, bucket)
);

ALTER TABLE public.coco_scheduler_ticks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_scheduler_ticks FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_scheduler_ticks TO service_role;
