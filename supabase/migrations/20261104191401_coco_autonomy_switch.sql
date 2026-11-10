-- Interruptor por comunidad: apaga las escrituras de CoCo sin borrar historial.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS coco_autonomy boolean NOT NULL DEFAULT true;
