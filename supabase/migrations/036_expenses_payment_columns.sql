-- 036_expenses_payment_columns.sql
-- El webhook de Haulmer/Tuu (src/app/api/webhooks/haulmer/route.ts) y el endpoint
-- create-haulmer-link intentan actualizar expenses.paid_at y expenses.payment_metadata,
-- pero estas columnas nunca se crearon en produccion (existen en schema.sql pero no se
-- aplicaron como migracion incremental). Sin ellas, CUALQUIER pago real que llegue por
-- el webhook falla con "column does not exist" y el gasto nunca queda marcado como pagado.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_metadata JSONB DEFAULT '{}'::jsonb;
