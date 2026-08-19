-- Ventana de servicio de WhatsApp (24 horas).
--
-- WhatsApp solo permite texto libre durante las 24 horas siguientes al último
-- mensaje que envió el usuario. Fuera de esa ventana, todo mensaje que inicia la
-- plataforma exige una plantilla aprobada por Meta; mandarlo como texto libre
-- falla con el error 63016 de Twilio.
--
-- Guardar cuándo escribió por última vez cada residente es lo que permite elegir
-- entre texto libre (más rico y más barato) y plantilla, en vez de adivinar.
BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_last_inbound_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.whatsapp_last_inbound_at IS
  'Último mensaje entrante del residente por WhatsApp. Define si la ventana de servicio de 24 horas sigue abierta.';

-- Se consulta por perfil, pero el índice ayuda a los reportes de actividad.
CREATE INDEX IF NOT EXISTS profiles_whatsapp_last_inbound_idx
  ON public.profiles(whatsapp_last_inbound_at DESC)
  WHERE whatsapp_last_inbound_at IS NOT NULL;

COMMIT;
