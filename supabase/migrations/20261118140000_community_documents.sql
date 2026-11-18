-- Documentos de la comunidad que CoCo lee completos (18-11-2026).
--
-- Un reglamento de copropiedad suele ser un PDF de 40 páginas, en parte
-- escaneado, de más de 5 MB. Antes CoCo leía solo el texto seleccionable de los
-- primeros 5 MB y olvidaba el documento al terminar la conversación. Ahora el
-- archivo sube directo al bucket privado, el servidor lo lee página por página
-- (con OCR de las escaneadas) y lo guarda aquí. Queda privado para quien lo
-- subió hasta que la administración lo publica para la comunidad; desde ahí
-- CoCo lo busca y cita la página.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'community-documents',
    'community-documents',
    false,
    26214400,
    ARRAY['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE IF NOT EXISTS public.community_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    uploaded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    file_name TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'otro' CHECK (kind IN ('reglamento', 'acta', 'contrato', 'otro')),
    visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'community')),
    page_count INTEGER NOT NULL DEFAULT 0,
    ocr_pages INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    published_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS community_documents_community_idx ON public.community_documents (community_id, visibility, created_at DESC);

CREATE TABLE IF NOT EXISTS public.community_document_pages (
    document_id UUID NOT NULL REFERENCES public.community_documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    ocr BOOLEAN NOT NULL DEFAULT FALSE,
    fts TSVECTOR GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(text, ''))) STORED,
    PRIMARY KEY (document_id, page_number)
);
CREATE INDEX IF NOT EXISTS community_document_pages_fts_idx ON public.community_document_pages USING GIN (fts);

ALTER TABLE public.community_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_document_pages ENABLE ROW LEVEL SECURITY;

-- Lectura: lo publicado, para toda la comunidad; lo privado, solo para quien lo subió.
DROP POLICY IF EXISTS "community_documents_read" ON public.community_documents;
CREATE POLICY "community_documents_read" ON public.community_documents
    FOR SELECT USING (
        community_id = public.get_my_community_id()
        AND (visibility = 'community' OR uploaded_by = auth.uid())
    );
DROP POLICY IF EXISTS "community_document_pages_read" ON public.community_document_pages;
CREATE POLICY "community_document_pages_read" ON public.community_document_pages
    FOR SELECT USING (EXISTS (
        SELECT 1 FROM public.community_documents d
        WHERE d.id = community_document_pages.document_id
          AND d.community_id = public.get_my_community_id()
          AND (d.visibility = 'community' OR d.uploaded_by = auth.uid())
    ));

-- Escribe solo el servidor (service_role), que valida rol y comunidad.
REVOKE INSERT, UPDATE, DELETE ON public.community_documents FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.community_document_pages FROM anon, authenticated;
GRANT SELECT ON public.community_documents, public.community_document_pages TO authenticated;
GRANT ALL ON public.community_documents, public.community_document_pages TO service_role;
