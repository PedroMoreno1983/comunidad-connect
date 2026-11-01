-- Conserva unit_id TEXT para los servicios existentes y valida su identidad
-- mediante una columna UUID generada. Los cobros son historial financiero:
-- una unidad con cobros no se borra en cascada.
-- Auditoría previa en producción (2026-10-16): 13 cobros, 0 UUID inválidos,
-- 0 unidades huérfanas y 0 referencias a otra comunidad.

CREATE UNIQUE INDEX IF NOT EXISTS units_id_community_uidx ON public.units (id, community_id);

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS unit_uuid uuid GENERATED ALWAYS AS (unit_id::uuid) STORED;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.expenses'::regclass
      AND conname = 'expenses_unit_community_fkey'
  ) THEN
    ALTER TABLE public.expenses
      ADD CONSTRAINT expenses_unit_community_fkey
      FOREIGN KEY (unit_uuid, community_id)
      REFERENCES public.units (id, community_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

ALTER TABLE public.expenses VALIDATE CONSTRAINT expenses_unit_community_fkey;
