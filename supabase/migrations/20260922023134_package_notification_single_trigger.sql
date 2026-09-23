-- Ya aplicada en producción (2026-09-22). 048 y
-- 20260916180000 engancharon notify_package_residents dos veces, así que cada
-- encomienda generaba dos avisos iguales. Queda el trigger original.

DROP TRIGGER IF EXISTS packages_notify_residents ON public.packages;
