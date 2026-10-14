-- Fase 5 del agente operador: cotizaciones a proveedores y cierre con foto.
-- Idempotente.

-- 1. Cotizaciones ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  task_id uuid REFERENCES public.maintenance_tasks(id) ON DELETE CASCADE,
  service_request_id uuid REFERENCES public.service_requests(id) ON DELETE CASCADE,
  provider_id uuid NOT NULL REFERENCES public.service_providers(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'received', 'selected', 'rejected')),
  amount numeric(14, 2) CHECK (amount IS NULL OR amount >= 0),
  valid_until date,
  notes text,
  decision_note text,
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  decided_at timestamptz,
  CONSTRAINT maintenance_quotes_one_target CHECK (num_nonnulls(task_id, service_request_id) = 1),
  CONSTRAINT maintenance_quotes_amount_when_received CHECK (status NOT IN ('received', 'selected') OR amount IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quotes_task_provider_uniq
  ON public.maintenance_quotes (task_id, provider_id) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quotes_request_provider_uniq
  ON public.maintenance_quotes (service_request_id, provider_id) WHERE service_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quotes_task_selected_uniq
  ON public.maintenance_quotes (task_id) WHERE task_id IS NOT NULL AND status = 'selected';
CREATE UNIQUE INDEX IF NOT EXISTS maintenance_quotes_request_selected_uniq
  ON public.maintenance_quotes (service_request_id) WHERE service_request_id IS NOT NULL AND status = 'selected';
CREATE INDEX IF NOT EXISTS maintenance_quotes_community_idx ON public.maintenance_quotes (community_id, status);

ALTER TABLE public.maintenance_quotes ENABLE ROW LEVEL SECURITY;
-- Solo lectura para el staff de la comunidad; las escrituras van por el servidor.
DROP POLICY IF EXISTS maintenance_quotes_staff_read ON public.maintenance_quotes;
CREATE POLICY maintenance_quotes_staff_read ON public.maintenance_quotes FOR SELECT TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() IN ('admin', 'concierge'));

-- 2. Cierre con foto -----------------------------------------------------------
ALTER TABLE public.maintenance_tasks ADD COLUMN IF NOT EXISTS completion_photo_path text;
ALTER TABLE public.maintenance_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.maintenance_tasks ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.maintenance_task_requires_photo()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed'
     AND COALESCE(btrim(NEW.completion_photo_path), '') = '' THEN
    RAISE EXCEPTION 'maintenance_completion_requires_photo'
      USING HINT = 'Una tarea de mantención se cierra con una foto del trabajo terminado.';
  END IF;
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_task_requires_photo ON public.maintenance_tasks;
CREATE TRIGGER trg_maintenance_task_requires_photo
BEFORE UPDATE OF status ON public.maintenance_tasks
FOR EACH ROW EXECUTE FUNCTION public.maintenance_task_requires_photo();

-- 3. Bucket privado para las fotos (lectura con URL firmada desde el servidor).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('maintenance-photos', 'maintenance-photos', false, 8388608,
        ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
ON CONFLICT (id) DO NOTHING;
