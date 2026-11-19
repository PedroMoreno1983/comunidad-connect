-- Módulos que una comunidad apaga (19-11-2026).
--
-- Bahía Las Palmas es un condominio de casas junto al lago Rapel: cada casa
-- tiene su estacionamiento y su bodega, y el agua no se reparte por medidor.
-- Esos módulos, pensados para edificios, salen del menú y de CoCo.

ALTER TABLE public.communities
    ADD COLUMN IF NOT EXISTS disabled_modules TEXT[] NOT NULL DEFAULT '{}'
    CHECK (disabled_modules <@ ARRAY['parking', 'water']::TEXT[]);

-- communities se lee por columnas desde 20261118220000: la nueva también.
GRANT SELECT (disabled_modules) ON public.communities TO authenticated;

UPDATE public.communities SET disabled_modules = ARRAY['parking', 'water']
WHERE id = '07212377-00de-4153-aa98-ab036661b662';

-- Espacios comunes de Bahía Las Palmas (casas junto al lago Rapel). Antes no
-- tenía ninguno y el inicio mostraba una "capacidad" inventada.
INSERT INTO public.amenities (community_id, name, description, max_capacity, hourly_rate, icon_name, gradient)
SELECT '07212377-00de-4153-aa98-ab036661b662', v.name, v.description, v.capacity, 0, v.icon, v.gradient
FROM (VALUES
    ('Muelle', 'Atraque de embarcaciones y acceso al lago. Embarcación registrada en la comunidad; chaleco salvavidas obligatorio para menores.', 20, 'Anchor', 'from-[#3F8F6B] to-[#1F5F4A]'),
    ('Rampa de botes y playa', 'Bajada y subida de embarcaciones al lago. Reserva por bloque para no cruzarse con otras bajadas.', 10, 'Sailboat', 'from-[#3F8F6B] to-[#1F5F4A]'),
    ('Quincho', 'Quincho con parrilla. Deja el lugar limpio y la parrilla apagada; prohibido el fuego en temporada de restricción.', 30, 'Flame', 'from-[#9C5636] to-[#733D24]'),
    ('Sede social', 'Sala para reuniones, celebraciones y asambleas de la comunidad.', 60, 'PartyPopper', 'from-[#6D5BD0] to-[#3B2F84]'),
    ('Cancha de tenis', 'Cancha de tenis. Reserva por hora; calzado adecuado.', 4, 'Trophy', 'from-[#D8A83A] to-[#9B6B16]'),
    ('Cancha de futbolito', 'Cancha de futbolito. Reserva por hora.', 14, 'Trophy', 'from-[#D8A83A] to-[#9B6B16]')
) AS v(name, description, capacity, icon, gradient)
WHERE EXISTS (SELECT 1 FROM public.communities WHERE id = '07212377-00de-4153-aa98-ab036661b662')
  AND NOT EXISTS (
    SELECT 1 FROM public.amenities a
    WHERE a.community_id = '07212377-00de-4153-aa98-ab036661b662' AND lower(a.name) = lower(v.name)
  );

-- ── Vida junto al lago (módulo opcional) ────────────────────────────────────
-- Lo contrario de disabled_modules: lo que solo tiene sentido en algunas
-- comunidades. 'lake' enciende el registro de embarcaciones y las plantillas
-- de avisos de temporada (crecidas del lago, cortes de camino, temporada alta,
-- restricción de quemas).
ALTER TABLE public.communities
    ADD COLUMN IF NOT EXISTS extra_modules TEXT[] NOT NULL DEFAULT '{}'
    CHECK (extra_modules <@ ARRAY['lake']::TEXT[]);
GRANT SELECT (extra_modules) ON public.communities TO authenticated;
UPDATE public.communities SET extra_modules = ARRAY['lake']
WHERE id = '07212377-00de-4153-aa98-ab036661b662';

-- Embarcaciones por casa: para el uso del muelle y la seguridad en el lago.
-- Cada residente ve y edita las suyas; la administración ve todas las de su comunidad.
CREATE TABLE IF NOT EXISTS public.community_boats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES public.units(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('lancha', 'velero', 'kayak', 'moto_agua', 'bote', 'otro')),
    name TEXT NOT NULL DEFAULT '' CHECK (length(name) <= 60),
    registration TEXT NOT NULL DEFAULT '' CHECK (length(registration) <= 40),
    length_m NUMERIC(5, 2) CHECK (length_m IS NULL OR (length_m > 0 AND length_m < 100)),
    notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 300),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_boats_community_idx ON public.community_boats (community_id, created_at DESC);

ALTER TABLE public.community_boats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "community_boats_owner_or_admin_read" ON public.community_boats;
CREATE POLICY "community_boats_owner_or_admin_read" ON public.community_boats
    FOR SELECT TO authenticated
    USING (owner_id = auth.uid() OR (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin'));
DROP POLICY IF EXISTS "community_boats_service_role" ON public.community_boats;
CREATE POLICY "community_boats_service_role" ON public.community_boats
    TO service_role USING (true) WITH CHECK (true);
-- Escribe solo el servidor, que valida dueño, comunidad y módulo.
REVOKE INSERT, UPDATE, DELETE ON public.community_boats FROM anon, authenticated;
GRANT SELECT ON public.community_boats TO authenticated;
GRANT ALL ON public.community_boats TO service_role;
