-- ============================================================
-- Arriendos de estacionamiento: Haulmer como método de cobro por defecto
-- ============================================================
BEGIN;

ALTER TABLE public.communities
  ALTER COLUMN parking_billing_method SET DEFAULT 'haulmer';

UPDATE public.communities
SET parking_billing_method = 'haulmer'
WHERE parking_billing_method = 'common_expenses';

COMMENT ON COLUMN public.communities.parking_billing_method IS
  'Cómo se cobra un arriendo de estacionamiento: haulmer (pago en línea vía Haulmer, por defecto) o common_expenses (cargo opcional en la cuenta de gastos comunes de la unidad).';

COMMIT;
