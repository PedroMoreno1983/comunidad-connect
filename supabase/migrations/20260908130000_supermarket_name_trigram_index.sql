-- Autocompletar la lista de compras y corregirla cuando viene mal escrita
-- obliga a buscar por trozo de palabra ("lech") y por parecido ("lehce" ->
-- "leche"). El indice que ya existe, `idx_supermarket_products_name`, es GIN
-- sobre `to_tsvector('spanish', name)`: sirve para palabras completas y no
-- para ninguna de esas dos cosas, asi que un `ilike '%lech%'` recorre las
-- 91.892 filas de la tabla.
--
-- Medido el 2026-09-08 contra produccion: entre 300 y 700 ms por consulta.
-- Demasiado para responder mientras alguien escribe, que es justo cuando esto
-- tiene que contestar.
--
-- Los trigramas resuelven las dos a la vez: el mismo indice acelera el `ilike`
-- por subcadena y habilita `similarity()`, que es lo que permite proponer
-- "leche" cuando alguien escribio "lehce" -una transposicion que ninguna
-- busqueda por prefijo encuentra-.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS supermarket_products_name_trgm_idx
  ON public.supermarket_products USING gin (name gin_trgm_ops);
