-- Registro duplicado de 20260930015010_bank_import_identity: la misma
-- sentencia quedó anotada dos veces en el historial remoto. Es idempotente;
-- este archivo existe solo para que local y remoto coincidan.
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS import_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_import_key ON public.bank_transactions (community_id, import_key) WHERE import_key IS NOT NULL;
