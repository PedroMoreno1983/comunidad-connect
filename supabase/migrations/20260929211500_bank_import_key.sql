-- Cartolas sin numero de operacion no entraban al indice parcial de dedup
-- y se volvian a insertar en cada reimportacion.
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS import_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_import_key
  ON public.bank_transactions (community_id, import_key)
  WHERE import_key IS NOT NULL;
