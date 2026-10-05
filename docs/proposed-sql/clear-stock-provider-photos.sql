-- Propuesto, no aplicado.
-- Limpia retratos de stock o generadores de avatares si alguna vez se guardaron
-- en service_providers.photo o profiles.avatar_url.
-- Consulta en producción (2026-10-05, proyecto sxtnhhblunvorbwbmmbg): cero filas
-- coinciden. Las fotos actuales viven en el storage de ese proyecto Supabase.
-- El front ya ignora estos dominios; este SQL solo anula la URL guardada.

update public.service_providers
set photo = null
where photo ~* 'images\.unsplash\.com|source\.unsplash\.com|unsplash\.com|ui-avatars\.com|randomuser\.me|pravatar|picsum\.photos|dicebear|generated\.photos|placehold\.co|placeholder\.com|placekitten\.com|loremflickr\.com|robohash\.org';

update public.profiles
set avatar_url = null
where avatar_url ~* 'images\.unsplash\.com|source\.unsplash\.com|unsplash\.com|ui-avatars\.com|randomuser\.me|pravatar|picsum\.photos|dicebear|generated\.photos|placehold\.co|placeholder\.com|placekitten\.com|loremflickr\.com|robohash\.org';
