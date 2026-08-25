-- Corrige la deriva de esquema en public.units detectada en la auditoría del
-- 2026-08-24. La tabla en produccion no tiene las columnas `type` ni
-- `resident_profile_id`, pero handle_new_user() y tres consultas del codigo
-- ya las usan. Consecuencias observadas antes de este arreglo:
--
--   · un residente que escribe su numero de departamento en /signup no puede
--     registrarse: el trigger aborta con "Database error creating new user"
--   · /api/profile/ensure-resident-unit responde 500 en cada login, de modo
--     que el residente queda sin unidad y sin gastos comunes
--   · la tool read_units del Agent Center lanza excepcion siempre
--
-- Ademas units.number tenia un UNIQUE global en vez de por comunidad, lo que
-- impedia que dos edificios tuvieran ambos un "101".
--
-- Aplicar desde el SQL Editor de Supabase. No usar `db push`: el historial
-- esta divergido y arrastraria ~35 migraciones locales de una sola vez.

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'apartment';

ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS resident_profile_id UUID
  REFERENCES public.profiles(id) ON DELETE SET NULL;

-- El numero de unidad es unico DENTRO de la comunidad, no en toda la
-- plataforma. Verificado al aplicar: no habia duplicados que impidieran
-- crear el indice.
ALTER TABLE public.units DROP CONSTRAINT IF EXISTS units_number_key;

CREATE UNIQUE INDEX IF NOT EXISTS units_number_per_community_key
  ON public.units (community_id, number);
