-- Al completar una tarea de mantención, el activo registra la fecha y libera
-- next_maintenance para que el plan preventivo calcule la siguiente según la
-- frecuencia de su tipo. Idempotente.
CREATE OR REPLACE FUNCTION public.maintenance_task_completed_update_asset()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'completed' AND COALESCE(OLD.status, '') <> 'completed' AND NEW.asset_id IS NOT NULL THEN
    UPDATE public.building_assets
       SET last_maintenance = (NOW() AT TIME ZONE 'America/Santiago')::date,
           next_maintenance = NULL
     WHERE id = NEW.asset_id
       AND community_id IS NOT DISTINCT FROM NEW.community_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maintenance_task_completed_update_asset ON public.maintenance_tasks;
CREATE TRIGGER trg_maintenance_task_completed_update_asset
AFTER UPDATE OF status ON public.maintenance_tasks
FOR EACH ROW EXECUTE FUNCTION public.maintenance_task_completed_update_asset();
