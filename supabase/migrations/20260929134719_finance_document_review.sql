-- Private, deduplicated financial evidence. Access is mediated by authenticated routes.
ALTER TABLE public.community_expenses
  ADD COLUMN IF NOT EXISTS document_sha256 text;

CREATE UNIQUE INDEX IF NOT EXISTS community_expenses_document_sha256_uniq
  ON public.community_expenses (community_id, document_sha256)
  WHERE document_sha256 IS NOT NULL;

ALTER TABLE public.expense_items
  ADD COLUMN IF NOT EXISTS source_expense_id uuid REFERENCES public.community_expenses(id) ON DELETE SET NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('finance-documents', 'finance-documents', false, 10485760,
  ARRAY['application/pdf','image/jpeg','image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;
