-- Boletas que llegan solas por correo (19-11-2026).
--
-- Antes había que subir cada boleta de luz, agua y gas a mano todos los meses.
-- Ahora cada comunidad tiene una dirección propia (bills_inbox_token@dominio
-- de recepción): Enel, CGE, Aguas Andinas o Metrogas mandan ahí la boleta
-- electrónica (o se reenvía desde Gmail), Resend la recibe, Convive lee el PDF
-- con IA y la deja en una bandeja para que la administración la registre
-- como egreso en un clic.

ALTER TABLE public.communities
    ADD COLUMN IF NOT EXISTS bills_inbox_token TEXT UNIQUE
    CHECK (bills_inbox_token IS NULL OR bills_inbox_token ~ '^[a-z0-9]{8,24}$');
-- El token no se devuelve al navegador (communities se lee por columnas):
-- quien lo conoce puede mandar documentos a la bandeja de la comunidad.

CREATE TABLE IF NOT EXISTS public.inbound_bill_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id UUID NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
    email_id TEXT NOT NULL,
    attachment_id TEXT NOT NULL,
    from_address TEXT NOT NULL DEFAULT '',
    subject TEXT NOT NULL DEFAULT '',
    file_name TEXT NOT NULL DEFAULT '',
    storage_path TEXT,
    document_sha256 TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'discarded', 'failed')),
    draft JSONB NOT NULL DEFAULT '{}'::jsonb,
    error TEXT,
    expense_id UUID REFERENCES public.community_expenses(id) ON DELETE SET NULL,
    decided_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    decided_at TIMESTAMPTZ,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Resend reintenta el webhook: el mismo adjunto no entra dos veces.
    UNIQUE (email_id, attachment_id)
);
CREATE INDEX IF NOT EXISTS inbound_bill_documents_community_idx
    ON public.inbound_bill_documents (community_id, status, received_at DESC);

ALTER TABLE public.inbound_bill_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inbound_bill_documents_admin_read" ON public.inbound_bill_documents;
CREATE POLICY "inbound_bill_documents_admin_read" ON public.inbound_bill_documents
    FOR SELECT TO authenticated
    USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
DROP POLICY IF EXISTS "inbound_bill_documents_service_role" ON public.inbound_bill_documents;
CREATE POLICY "inbound_bill_documents_service_role" ON public.inbound_bill_documents
    TO service_role USING (true) WITH CHECK (true);
REVOKE INSERT, UPDATE, DELETE ON public.inbound_bill_documents FROM anon, authenticated;
GRANT SELECT ON public.inbound_bill_documents TO authenticated;
GRANT ALL ON public.inbound_bill_documents TO service_role;
