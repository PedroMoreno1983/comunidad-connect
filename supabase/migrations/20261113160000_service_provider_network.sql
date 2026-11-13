-- ============================================================
-- Red Convive de maestros: proveedores para todas las comunidades
--
-- Hasta ahora cada maestro pertenecía a una sola comunidad. Ahora conviven dos
-- tipos:
--   * De la comunidad (community_id = la comunidad): los registra su
--     administración y solo los ven sus vecinos. Igual que antes.
--   * De la red (community_id IS NULL): los cura Convive (superadmin, vía
--     servidor) y los ven todas las comunidades.
--
-- guard_service_request_lifecycle ya aceptaba proveedores con community_id
-- NULL en solicitudes de cualquier comunidad; faltaba poder crearlos y leerlos.
-- Ninguna administración puede escribir una fila de la red: su política exige
-- community_id = su comunidad. Sumar o sacar a alguien de la red (cambiar
-- community_id) queda reservado al servidor.
-- ============================================================
BEGIN;

ALTER TABLE public.service_providers ALTER COLUMN community_id DROP NOT NULL;

DROP POLICY IF EXISTS "service_providers_network_read" ON public.service_providers;
CREATE POLICY "service_providers_network_read"
  ON public.service_providers
  FOR SELECT
  TO authenticated
  USING (community_id IS NULL);

-- Un enlace de portal de un maestro de la red no pertenece a una comunidad.
ALTER TABLE public.service_provider_links ALTER COLUMN community_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.service_providers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Sin auth.uid() es el servidor (service role): puede todo.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- Mover un maestro entre comunidades o a la red es solo del servidor.
  IF NEW.community_id IS DISTINCT FROM OLD.community_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'La comunidad del proveedor la maneja Convive' USING ERRCODE = '42501';
  END IF;
  IF public.get_my_role() = 'admin' AND OLD.community_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.verified IS DISTINCT FROM OLD.verified
     OR NEW.rating IS DISTINCT FROM OLD.rating
     OR NEW.review_count IS DISTINCT FROM OLD.review_count
     OR NEW.completed_jobs IS DISTINCT FROM OLD.completed_jobs THEN
    RAISE EXCEPTION 'Verificación, nota y trabajos los maneja la administración' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
