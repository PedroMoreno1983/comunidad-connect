-- Cargos individuales, registro de pagos y estado de cuenta con arrastre.
--
-- Hasta ahora el dinero de una unidad vivía en `expenses`: una fila por mes con
-- un `status` paid/pending/overdue. Eso alcanza para "¿pagó o no?", pero no
-- para lo que un administrador necesita de verdad:
--   - cobrar una multa o un extra fuera del gasto común
--   - registrar un pago real (monto, fecha, medio, comprobante)
--   - aceptar un pago parcial
--   - ver una cartola con saldo que arrastra la deuda de un mes al siguiente
--
-- El modelo pasa a ser un libro de movimientos por unidad: cargos (debe) y
-- pagos (haber). El saldo es la diferencia. `expenses` se mantiene intacta como
-- el cargo del gasto común mensual, así nada de lo existente se rompe.

BEGIN;

-- ── 1. Cargos distintos del gasto común ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unit_charges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  -- Periodo al que se imputa. Permite que la multa de julio aparezca en la
  -- cartola de julio aunque se cargue en agosto.
  month TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other'
    CHECK (kind IN ('fine', 'interest', 'extraordinary', 'service', 'other')),
  label TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  due_date DATE,
  notes TEXT,
  -- Para un interés por mora: de qué cuota vencida se originó. Evita cobrar
  -- dos veces el interés de la misma deuda.
  source_expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_charges_unit
  ON public.unit_charges(unit_id, month);
CREATE INDEX IF NOT EXISTS idx_unit_charges_community_status
  ON public.unit_charges(community_id, status);

-- Un solo interés por cuota vencida y periodo: si el cron o el admin reintentan
-- la emisión, no se apila interés sobre interés por accidente.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_charges_interest_once
  ON public.unit_charges(source_expense_id, month)
  WHERE kind = 'interest' AND status <> 'cancelled';

-- ── 2. Pagos recibidos ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.unit_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  unit_id UUID NOT NULL REFERENCES public.units(id) ON DELETE CASCADE,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  method TEXT NOT NULL DEFAULT 'transfer'
    CHECK (method IN ('transfer', 'cash', 'check', 'card', 'online', 'other')),
  -- Nro de transferencia, folio del comprobante, id de Webpay, etc.
  reference TEXT,
  notes TEXT,
  -- Imputación opcional. Un pago sin imputar abona al saldo general de la
  -- unidad, que es como se paga en la práctica ("te transfiero $150.000").
  expense_id UUID REFERENCES public.expenses(id) ON DELETE SET NULL,
  charge_id UUID REFERENCES public.unit_charges(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_unit_payments_unit
  ON public.unit_payments(unit_id, paid_at DESC);
CREATE INDEX IF NOT EXISTS idx_unit_payments_community
  ON public.unit_payments(community_id, paid_at DESC);

-- Evita registrar dos veces la misma transferencia por doble clic o reintento.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unit_payments_reference_once
  ON public.unit_payments(community_id, unit_id, reference)
  WHERE reference IS NOT NULL AND reference <> '';

-- ── 3. Configuración financiera de la comunidad ─────────────────────────────
-- Tasa de interés por mora mensual, en porcentaje. 0 = no se aplica interés,
-- que es el default deliberado: cobrar interés sin que el admin lo configure
-- sería cobrarle de más a un residente sin decisión humana de por medio.
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS late_interest_monthly_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

-- Porcentaje del gasto común que se aporta al fondo de reserva (Ley 21.442).
ALTER TABLE public.communities
  ADD COLUMN IF NOT EXISTS reserve_fund_rate NUMERIC(5, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.communities.late_interest_monthly_rate IS
  'Interes por mora mensual en %. 0 = no se aplica.';
COMMENT ON COLUMN public.communities.reserve_fund_rate IS
  'Aporte al fondo de reserva como % del gasto comun. 0 = no se aporta.';

-- ── 4. RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE public.unit_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unit_payments ENABLE ROW LEVEL SECURITY;

-- El residente ve los cargos y pagos de SU unidad; el admin, los de toda su
-- comunidad. Nadie ve los de otra comunidad.
DROP POLICY IF EXISTS "unit_charges_read" ON public.unit_charges;
CREATE POLICY "unit_charges_read" ON public.unit_charges
  FOR SELECT TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (
      public.get_my_role() IN ('admin', 'concierge')
      -- units.owner_id (uuid) evita el choque de tipos con profiles.unit_id, que
      -- es TEXT: comparar el unit_id (uuid) contra esa columna daba "uuid = text".
      OR unit_id IN (SELECT id FROM public.units WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "unit_charges_service_role" ON public.unit_charges;
CREATE POLICY "unit_charges_service_role" ON public.unit_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "unit_payments_read" ON public.unit_payments;
CREATE POLICY "unit_payments_read" ON public.unit_payments
  FOR SELECT TO authenticated
  USING (
    community_id = public.get_my_community_id()
    AND (
      public.get_my_role() IN ('admin', 'concierge')
      -- units.owner_id (uuid) evita el choque de tipos con profiles.unit_id, que
      -- es TEXT: comparar el unit_id (uuid) contra esa columna daba "uuid = text".
      OR unit_id IN (SELECT id FROM public.units WHERE owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "unit_payments_service_role" ON public.unit_payments;
CREATE POLICY "unit_payments_service_role" ON public.unit_payments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
