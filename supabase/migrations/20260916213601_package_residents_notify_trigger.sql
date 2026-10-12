BEGIN;

-- La función notify_package_residents ya existe (049), pero nunca se enganchó
-- a packages: la UI decía "notificado" y no salía aviso real.
DROP TRIGGER IF EXISTS packages_notify_residents ON public.packages;
CREATE TRIGGER packages_notify_residents
AFTER INSERT ON public.packages
FOR EACH ROW
EXECUTE FUNCTION public.notify_package_residents();

COMMIT;
