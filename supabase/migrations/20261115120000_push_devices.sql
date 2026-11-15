-- ============================================================
-- Notificaciones push en la app (Android e iOS, vía Firebase Cloud Messaging)
--
-- * push_devices: un token de FCM por teléfono. Tabla solo del servidor: la app
--   lo registra por /api/push/devices con la sesión de la persona.
-- * notifications.push_sent_at: marca que el aviso ya salió como push, para no
--   mandarlo dos veces si el despacho se reintenta.
-- * Trigger: cada aviso nuevo de alguien con teléfono registrado le pide a
--   /api/push/dispatch que lo envíe (pg_net, asíncrono). El endpoint no confía
--   en lo que recibe: vuelve a leer el aviso por id y solo envía avisos
--   recientes y aún no enviados. Si pg_net falla, el aviso se guarda igual.
-- ============================================================
BEGIN;

-- pg_net existe en Supabase; en la base de pruebas (PGlite) no, y ahí el
-- trigger simplemente no envía (el EXCEPTION de abajo lo absorbe).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_net') THEN
    CREATE EXTENSION IF NOT EXISTS pg_net;
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.push_devices (
  token TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS push_devices_user_id_idx ON public.push_devices (user_id);

ALTER TABLE public.push_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_devices FROM anon, authenticated;
GRANT ALL ON public.push_devices TO service_role;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.push_devices WHERE user_id = NEW.user_id) THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://conviveconnect.com/api/push/dispatch',
        body := jsonb_build_object('id', NEW.id),
        headers := '{"Content-Type": "application/json"}'::jsonb,
        timeout_milliseconds := 5000
      );
    EXCEPTION WHEN OTHERS THEN
      -- El push es un extra: nunca impide guardar el aviso.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS notifications_dispatch_push ON public.notifications;
CREATE TRIGGER notifications_dispatch_push
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.dispatch_notification_push();

COMMIT;
