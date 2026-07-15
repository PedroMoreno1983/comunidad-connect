-- Persistent, reviewable multi-document onboarding batches.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.onboarding_import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  source TEXT NOT NULL DEFAULT 'admin_onboarding' CHECK (source IN ('admin_onboarding', 'agent_center')),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'review', 'syncing', 'synced', 'partial', 'failed')),
  document_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  valid_row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_import_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.onboarding_import_batches(id) ON DELETE CASCADE,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'extracted', 'failed')),
  extracted_rows INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.onboarding_import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES public.onboarding_import_batches(id) ON DELETE CASCADE,
  document_id UUID REFERENCES public.onboarding_import_documents(id) ON DELETE SET NULL,
  community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  unit_number TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'staged' CHECK (status IN ('staged', 'synced', 'unit_only', 'failed', 'skipped')),
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(batch_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS onboarding_batches_community_created_idx ON public.onboarding_import_batches(community_id, created_at DESC);
CREATE INDEX IF NOT EXISTS onboarding_documents_batch_idx ON public.onboarding_import_documents(batch_id, created_at);
CREATE INDEX IF NOT EXISTS onboarding_rows_batch_status_idx ON public.onboarding_import_rows(batch_id, status);

ALTER TABLE public.onboarding_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_import_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.onboarding_import_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS onboarding_batches_admin_select ON public.onboarding_import_batches;
CREATE POLICY onboarding_batches_admin_select ON public.onboarding_import_batches FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.community_id = onboarding_import_batches.community_id)
);
DROP POLICY IF EXISTS onboarding_documents_admin_select ON public.onboarding_import_documents;
CREATE POLICY onboarding_documents_admin_select ON public.onboarding_import_documents FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.community_id = onboarding_import_documents.community_id)
);
DROP POLICY IF EXISTS onboarding_rows_admin_select ON public.onboarding_import_rows;
CREATE POLICY onboarding_rows_admin_select ON public.onboarding_import_rows FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin' AND p.community_id = onboarding_import_rows.community_id)
);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'onboarding-documents', 'onboarding-documents', false, 10485760,
  ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/msword','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv']
)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 10485760;

DROP POLICY IF EXISTS onboarding_documents_admin_storage_select ON storage.objects;
CREATE POLICY onboarding_documents_admin_storage_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'onboarding-documents' AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin' AND p.community_id::text = (storage.foldername(name))[1]
  )
);
