-- ============================================================
-- El despacho de push exige un secreto compartido.
--
-- /api/push/dispatch es público (lo llama pg_net), así que ahora solo atiende
-- llamadas con la cabecera x-push-secret igual a PUSH_DISPATCH_SECRET (Vercel).
-- La base lo lee de Supabase Vault (secreto "push_dispatch_secret"); el valor
-- nunca va en el repo. Sin el secreto en Vault, el trigger no llama.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.dispatch_notification_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  dispatch_secret TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM public.push_devices WHERE user_id = NEW.user_id) THEN
    BEGIN
      SELECT decrypted_secret INTO dispatch_secret
      FROM vault.decrypted_secrets
      WHERE name = 'push_dispatch_secret'
      LIMIT 1;

      IF dispatch_secret IS NOT NULL THEN
        PERFORM net.http_post(
          url := 'https://conviveconnect.com/api/push/dispatch',
          body := jsonb_build_object('id', NEW.id),
          headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', dispatch_secret),
          timeout_milliseconds := 5000
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- El push es un extra: nunca impide guardar el aviso.
      NULL;
    END;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.dispatch_notification_push() FROM PUBLIC, anon, authenticated;

COMMIT;
