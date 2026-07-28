-- Egresos del edificio, alícuotas y emisión de gastos comunes.
--
-- Hasta ahora la tabla `expenses` guardaba el cobro ya calculado de cada
-- unidad, pero no existía dónde registrar los egresos del edificio (luz, agua,
-- remuneraciones, ascensor) ni cómo repartirlos. Armar el gasto común del mes
-- -- la función central para una administración -- solo era posible creando
-- cada cobro a mano, uno por unidad.
--
-- Esto agrega las tres piezas que faltaban:
--   1. units.share_permille  -> alícuota de cada unidad (tanto por mil)
--   2. community_expenses    -> egresos del edificio por mes
--   3. billing_runs          -> cada emisión, para trazabilidad y no duplicar

BEGIN;

-- ── 1. Alícuota por unidad ──────────────────────────────────────────────────
-- En tanto por mil (no porcentaje) porque los reglamentos de copropiedad
-- chilenos suelen expresarla con 3-4 decimales; ‰ evita perder precisión.
-- NULL = sin alícuota definida: el prorrateo cae a partes iguales y la UI
-- lo advierte antes de emitir.
ALTER TABLE public.units
  ADD COLUMN IF NOT EXISTS share_permille NUMERIC(9, 4);

COMMENT ON COLUMN public.units.share_permille IS
  'Alicuota de la unidad en tanto por mil. La suma de la comunidad deberia dar 1000.';

-- ── 2. Egresos del edificio ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.community_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('water', 'electricity', 'salaries', 'maintenance', 'security', 'other')),
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
  provider TEXT,
  document_url TEXT,
  notes TEXT,
  -- Un egreso puede repartirse por alicuota o en partes iguales. Se decide por
  -- egreso, no por emision: el gas de calefaccion central suele ir por
  -- alicuota, pero un gasto fijo por departamento va en partes iguales.
  prorate_method TEXT NOT NULL DEFAULT 'share'
    CHECK (prorate_method IN ('share', 'equal')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_community_expenses_month
  ON public.community_expenses(community_id, month);

-- ── 3. Emisiones ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.billing_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'cancelled')),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  units_count INTEGER NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  fallback_equal_split BOOLEAN NOT NULL DEFAULT FALSE,
  issued_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Impide emitir dos veces el mismo mes. Una emision cancelada libera el mes,
-- por eso el indice unico es parcial.
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_runs_active_month
  ON public.billing_runs(community_id, month)
  WHERE status = 'issued';

-- Permite revertir una emision: los cobros generados quedan trazados a su
-- corrida, asi se pueden borrar sin tocar cobros cargados a mano.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS billing_run_id UUID REFERENCES public.billing_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_expenses_billing_run
  ON public.expenses(billing_run_id);

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.community_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_runs ENABLE ROW LEVEL SECURITY;

-- Los egresos del edificio son informacion de gestion: los residentes ven su
-- propio cobro y su desglose (expense_items), no la contabilidad completa.
DROP POLICY IF EXISTS "community_expenses_admin_read" ON public.community_expenses;
CREATE POLICY "community_expenses_admin_read" ON public.community_expenses
  FOR SELECT TO authenticated
  USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "community_expenses_service_role" ON public.community_expenses;
CREATE POLICY "community_expenses_service_role" ON public.community_expenses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "billing_runs_admin_read" ON public.billing_runs;
CREATE POLICY "billing_runs_admin_read" ON public.billing_runs
  FOR SELECT TO authenticated
  USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "billing_runs_service_role" ON public.billing_runs;
CREATE POLICY "billing_runs_service_role" ON public.billing_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
