-- Remove policy names used by the historical root schema.
-- Current installations already use the role- and tenant-scoped policies;
-- these drops make a fresh schema bootstrap converge to the same posture.

BEGIN;

DROP POLICY IF EXISTS training_modules_select ON public.training_modules;
DROP POLICY IF EXISTS training_modules_admin_write ON public.training_modules;
DROP POLICY IF EXISTS training_lessons_select ON public.training_lessons;
DROP POLICY IF EXISTS training_lessons_admin_write ON public.training_lessons;
DROP POLICY IF EXISTS user_training_progress_own ON public.user_training_progress;

COMMIT;
