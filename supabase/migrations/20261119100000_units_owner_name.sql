-- Propietario sin cuenta (19-11-2026).
--
-- La administración de Bahía Las Palmas quiso anotar con CoCo el dueño de cada
-- sitio ("sitio 20 José Ignacio Valenzuela") y fallaba: units.owner_id solo
-- acepta a alguien que ya tiene cuenta. owner_name guarda el nombre mientras
-- tanto; cuando la persona se registra, owner_id pasa a mandar.

ALTER TABLE public.units ADD COLUMN IF NOT EXISTS owner_name TEXT
    CHECK (owner_name IS NULL OR char_length(owner_name) <= 120);

-- Lo escribe el servidor (CoCo, carga de nómina). La administración lo puede
-- corregir desde Unidades como el resto de las columnas de la unidad.
GRANT UPDATE (owner_name) ON public.units TO authenticated;
