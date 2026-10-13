-- Facturación electrónica (DTE) vía OpenFactura. Cada comunidad configura su
-- emisor; la API key se guarda cifrada (AES-256-GCM) desde el servidor.
-- Cada emisión reserva primero su fila con una clave de idempotencia única,
-- así un reintento nunca emite dos veces el mismo documento.
BEGIN;

CREATE TABLE IF NOT EXISTS public.invoicing_settings (
  community_id uuid PRIMARY KEY REFERENCES public.communities(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'openfactura' CHECK (provider IN ('openfactura')),
  environment text NOT NULL DEFAULT 'test' CHECK (environment IN ('test', 'production')),
  api_key_sealed text NOT NULL,
  api_key_hint text NOT NULL,
  emitter jsonb NOT NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.invoicing_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.invoicing_settings FROM anon, authenticated;
GRANT ALL ON public.invoicing_settings TO service_role;

CREATE TABLE IF NOT EXISTS public.tax_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  environment text NOT NULL CHECK (environment IN ('test', 'production')),
  dte_type smallint NOT NULL CHECK (dte_type IN (33, 34)),
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'issued', 'failed')),
  folio integer,
  provider_token text,
  receiver jsonb NOT NULL,
  items jsonb NOT NULL,
  net_amount integer NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  exempt_amount integer NOT NULL DEFAULT 0 CHECK (exempt_amount >= 0),
  tax_amount integer NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount integer NOT NULL CHECK (total_amount > 0),
  issue_date date NOT NULL,
  pdf_path text,
  warnings jsonb,
  error text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_documents_community_idx
  ON public.tax_documents (community_id, created_at DESC);
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tax_documents FROM anon, authenticated;
GRANT ALL ON public.tax_documents TO service_role;

COMMIT;
