-- Fondo de reserva (Ley 21.442) y cierre mensual.
--
-- El art. 30 de la Ley 21.442 obliga a mantener un fondo de reserva alimentado
-- con un porcentaje del gasto común. La plata del fondo NO es del mes: se
-- acumula, y su uso debe poder justificarse ante el comité. Por eso vive en su
-- propio libro de movimientos y no mezclado con los egresos corrientes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.reserve_fund_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  -- contribution: entra plata (aporte del gasto común del mes).
  -- withdrawal:   sale plata (se usó el fondo para una obra o emergencia).
  kind TEXT NOT NULL CHECK (kind IN ('contribution', 'withdrawal')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  month TEXT NOT NULL,
  label TEXT NOT NULL,
  notes TEXT,
  -- Si el aporte vino de una emisión, queda trazado: anular la emisión debe
  -- poder revertir también su aporte al fondo.
  billing_run_id UUID REFERENCES public.billing_runs(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reserve_fund_community
  ON public.reserve_fund_movements(community_id, month);

-- Un solo aporte automático por emisión: si se reintenta la emisión, el fondo
-- no recibe el aporte dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reserve_fund_run_once
  ON public.reserve_fund_movements(billing_run_id)
  WHERE billing_run_id IS NOT NULL AND kind = 'contribution';

ALTER TABLE public.reserve_fund_movements ENABLE ROW LEVEL SECURITY;

-- El saldo del fondo es información que la comunidad tiene derecho a conocer
-- (es su plata), así que cualquier miembro del tenant puede leerlo; solo el
-- backend escribe.
DROP POLICY IF EXISTS "reserve_fund_read" ON public.reserve_fund_movements;
CREATE POLICY "reserve_fund_read" ON public.reserve_fund_movements
  FOR SELECT TO authenticated
  USING (community_id = public.get_my_community_id());

DROP POLICY IF EXISTS "reserve_fund_service_role" ON public.reserve_fund_movements;
CREATE POLICY "reserve_fund_service_role" ON public.reserve_fund_movements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
