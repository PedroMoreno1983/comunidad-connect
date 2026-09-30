-- A bank-statement row is identified by the uploaded file and its row number.
-- Re-importing the same statement is safe, while two identical movements in
-- different statements remain distinct. Manual entries keep a NULL key.
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS import_key text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_bank_transactions_import_key
  ON public.bank_transactions (community_id, import_key)
  WHERE import_key IS NOT NULL;
