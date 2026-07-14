BEGIN;

CREATE OR REPLACE FUNCTION public.notify_package_residents()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (
    user_id,
    type,
    category,
    title,
    body,
    link,
    read,
    community_id
  )
  SELECT
    p.id,
    'info',
    'package',
    'Tienes una encomienda nueva',
    'Conserjeria recibio una encomienda para tu unidad. Descripcion: ' || NEW.description,
    '/resident/packages',
    FALSE,
    NEW.community_id
  FROM public.profiles p
  WHERE p.community_id = NEW.community_id
    AND p.unit_id = NEW.recipient_unit_id
    AND p.role = 'resident';

  RETURN NEW;
END;
$$;

COMMIT;
