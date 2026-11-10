-- Rutinas que el administrador confirma en el chat.
-- Pausar o borrar cambia el estado; no se borra la fila.
-- No borra otros datos. El cliente no escribe directo.

CREATE TABLE IF NOT EXISTS public.coco_routines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  instruction text NOT NULL,
  cadence text NOT NULL CHECK (cadence IN ('daily', 'weekly', 'monthly')),
  weekday smallint CHECK (weekday IS NULL OR weekday BETWEEN 0 AND 6),
  day_of_month smallint CHECK (day_of_month IS NULL OR day_of_month BETWEEN 1 AND 28),
  time_local text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'deleted')),
  next_run_at timestamptz NOT NULL,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coco_routines_due
  ON public.coco_routines (next_run_at)
  WHERE status = 'active';

ALTER TABLE public.coco_routines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.coco_routines FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.coco_routines TO service_role;
