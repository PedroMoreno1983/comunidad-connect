-- Conciliación bancaria: cruzar la cartola del banco con los pagos registrados.
--
-- El administrador registra pagos (`unit_payments`) a medida que le avisan las
-- transferencias, pero la verdad de la caja es la cartola del banco. Conciliar
-- es emparejar cada movimiento del banco con el pago que ya registró, y detectar
-- lo que falta: un depósito en el banco sin pago registrado (plata que entró y
-- no se imputó a nadie) o un pago registrado que el banco nunca recibió.
--
-- Modelo: una fila por movimiento de la cartola. Cada movimiento de ingreso se
-- enlaza (o no) a un `unit_payments`. Un pago solo puede conciliarse con un
-- movimiento, y viceversa.

BEGIN;

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  txn_date DATE NOT NULL,
  -- Positivo = ingreso (abono/depósito); negativo = egreso (giro/cargo del banco).
  -- La conciliación de cobranza mira los ingresos; los egresos quedan para
  -- referencia y para no descuadrar el saldo de la cartola.
  amount NUMERIC(12, 2) NOT NULL CHECK (amount <> 0),
  description TEXT NOT NULL DEFAULT '',
  -- Nro de operación / glosa que trae la cartola del banco.
  reference TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'matched', 'ignored')),
  -- El pago registrado con el que quedó conciliado este movimiento.
  matched_payment_id UUID REFERENCES public.unit_payments(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_community
  ON public.bank_transactions(community_id, txn_date DESC);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_status
  ON public.bank_transactions(community_id, status);

-- Evita importar dos veces el mismo movimiento al recargar la cartola.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_dedup
  ON public.bank_transactions(community_id, txn_date, amount, reference)
  WHERE reference IS NOT NULL AND reference <> '';

-- Un pago no puede quedar conciliado con dos movimientos distintos.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_payment_once
  ON public.bank_transactions(matched_payment_id)
  WHERE matched_payment_id IS NOT NULL;

ALTER TABLE public.bank_transactions ENABLE ROW LEVEL SECURITY;

-- Información de gestión de la caja: solo administración de la propia comunidad.
DROP POLICY IF EXISTS "bank_transactions_admin_read" ON public.bank_transactions;
CREATE POLICY "bank_transactions_admin_read" ON public.bank_transactions
  FOR SELECT TO authenticated
  USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');

DROP POLICY IF EXISTS "bank_transactions_service_role" ON public.bank_transactions;
CREATE POLICY "bank_transactions_service_role" ON public.bank_transactions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;
