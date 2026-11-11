-- Propuestas de memoria que CoCo saca al cerrar una conversación.
-- No se escriben en la memoria hasta que un administrador las aprueba.
-- No borra datos.

CREATE TABLE IF NOT EXISTS public.coco_memory_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  fact text NOT NULL,
  fact_key text NOT NULL,
  category text NOT NULL CHECK (category IN ('reglamento', 'proveedor', 'acuerdo', 'general')),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS coco_memory_proposals_open_fact
  ON public.coco_memory_proposals (community_id, fact_key)
  WHERE status IN ('proposed', 'approved');

ALTER TABLE public.coco_memory_proposals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_memory_proposals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_memory_proposals TO service_role;
