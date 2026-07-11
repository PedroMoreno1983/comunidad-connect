-- 037_coco_sessions_lockdown.sql
-- coco_sessions guarda el historial completo de conversaciones con CoCo (nombre,
-- rol, unidad, comunidad y el contenido de cada mensaje). Se verifico en produccion
-- que esta tabla es legible con la anon key SIN NINGUNA sesion: cualquiera puede
-- leer el historial de cualquier otro usuario solo con la clave publica del
-- proyecto. src/lib/coco/session-store.ts ya se corrigio para usar el cliente de
-- servicio (supabaseAdmin); esta migracion cierra el acceso a nivel de base de
-- datos para que ninguna otra ruta pueda repetir el mismo error.

ALTER TABLE public.coco_sessions ENABLE ROW LEVEL SECURITY;

-- Sin policies para anon/authenticated: solo el rol de servicio (que bypassa RLS)
-- puede leer o escribir esta tabla. Si alguna vez se necesita acceso desde el
-- cliente, debe agregarse una policy explicita scoped por user_id, nunca abrir
-- la tabla completa.
DROP POLICY IF EXISTS "coco_sessions_no_client_access" ON public.coco_sessions;
