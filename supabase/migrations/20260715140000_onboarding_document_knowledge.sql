ALTER TABLE public.onboarding_import_documents
  ADD COLUMN IF NOT EXISTS document_kind TEXT NOT NULL DEFAULT 'resident_roster',
  ADD COLUMN IF NOT EXISTS summary TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_text TEXT NOT NULL DEFAULT '';

ALTER TABLE public.onboarding_import_documents
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(file_name, '') || ' ' || coalesce(summary, '') || ' ' || coalesce(search_text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS onboarding_documents_search_idx
  ON public.onboarding_import_documents USING GIN(search_vector);
