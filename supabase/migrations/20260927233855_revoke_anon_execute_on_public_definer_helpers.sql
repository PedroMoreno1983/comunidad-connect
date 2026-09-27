-- Cierra el EXECUTE que Postgres deja en PUBLIC sobre cuatro funciones
-- SECURITY DEFINER. Ese grant (acl "=X/postgres") es el que hace que `anon`
-- pueda llamarlas sin iniciar sesion, via POST /rest/v1/rpc/<nombre>.
-- No hay un GRANT explicito a anon: revocar solo a anon no basta.
--
-- Quien las usa de verdad, y por eso a quien se le deja EXECUTE:
--
-- * my_parking_driver_id()
--   No es un RPC del cliente. La evaluan las politicas RLS
--   parking_spots_read, parking_bookings_read y parking_community_access_read,
--   todas TO authenticated. Sin EXECUTE para authenticated, un SELECT de
--   esas tablas falla con "permission denied for function my_parking_driver_id".
--   service_role ya la tenia y se le reafirma: salta RLS, pero es el rol de
--   los jobs y del cliente admin.
--
-- * enforce_parking_spot_rules() y sync_parking_external_flag()
--   Son triggers (trg_parking_spots_rules y trg_communities_parking_external_sync).
--   El alta de un cupo la hace el cliente autenticado en ParkingService, y el
--   interruptor de arriendo externo lo actualiza el admin autenticado. En
--   Postgres 17 el disparo de un trigger SECURITY DEFINER no exige EXECUTE al
--   rol de la sesion: se probo en una transaccion revertida que el INSERT y el
--   UPDATE siguen pasando despues de revocar PUBLIC, anon y authenticated.
--   Nadie las llama por RPC. Quedan solo para service_role, igual que el resto
--   de triggers privilegiados (ver 20260801213216).
--
-- * refresh_supermarket_search_terms(integer, integer)
--   La llama el crawler nocturno (scripts/ingest_full_supermarket_catalog.py)
--   con SUPABASE_SERVICE_ROLE_KEY, desde los workflows de catalogo. No hay
--   supabase.rpc ni cron de base. authenticated y anon no la necesitan: borra
--   y reescribe todo el vocabulario de busqueda.
--
-- Idempotente: REVOKE de un privilegio que no existe solo avisa, y GRANT
-- repetido no cambia el resultado. No se toca el grant del dueno (postgres).

REVOKE ALL ON FUNCTION public.my_parking_driver_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.my_parking_driver_id() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.enforce_parking_spot_rules() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_parking_spot_rules() TO service_role;

REVOKE ALL ON FUNCTION public.sync_parking_external_flag() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_parking_external_flag() TO service_role;

REVOKE ALL ON FUNCTION public.refresh_supermarket_search_terms(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_supermarket_search_terms(integer, integer) TO service_role;
