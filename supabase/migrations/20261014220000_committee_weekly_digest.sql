-- Resumen semanal para el comité (último pilar de "IA que opera").
-- Cada semana la IA arma un borrador con datos AGREGADOS de la comunidad; el
-- admin lo revisa, puede editarlo y lo aprueba; recién ahí lo ve el comité
-- (o los admins si no hay comité). Un resumen por comunidad y semana.
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.committee_digests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  week_start date NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'discarded')),
  audience text NOT NULL DEFAULT 'committee' CHECK (audience IN ('committee', 'admins')),
  source text NOT NULL DEFAULT 'fallback' CHECK (source IN ('ai', 'fallback')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 6000),
  -- Texto original del borrador (IA o determinista), para auditar la edición.
  generated_content text NOT NULL CHECK (char_length(generated_content) BETWEEN 1 AND 6000),
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  proposal_id uuid REFERENCES public.agent_tool_calls(id) ON DELETE SET NULL,
  generated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT committee_digests_one_per_week UNIQUE (community_id, week_start),
  CONSTRAINT committee_digests_week_is_monday CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT committee_digests_period CHECK (period_end >= period_start),
  CONSTRAINT committee_digests_published_approved CHECK (status <> 'published' OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS committee_digests_latest
  ON public.committee_digests (community_id, week_start DESC);

-- Integrante vigente del comité. SECURITY DEFINER porque finance_committee_members
-- es de uso exclusivo del servidor (sin permisos para authenticated).
CREATE OR REPLACE FUNCTION public.is_active_committee_member(target_community uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.finance_committee_members m
    JOIN public.profiles p ON p.id = m.resident_id
    WHERE m.community_id = target_community
      AND m.resident_id = auth.uid()
      AND m.ended_at IS NULL
      AND m.starts_on <= (now() AT TIME ZONE 'America/Santiago')::date
      AND p.community_id = target_community
      AND p.role = 'resident'
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_committee_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_committee_member(uuid) TO authenticated, service_role;

ALTER TABLE public.committee_digests ENABLE ROW LEVEL SECURITY;
-- Lectura multi-tenant; todas las escrituras van por el servidor (service_role).
REVOKE ALL ON public.committee_digests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.committee_digests FROM authenticated;
GRANT SELECT ON public.committee_digests TO authenticated;
GRANT ALL ON public.committee_digests TO service_role;

DROP POLICY IF EXISTS committee_digests_admin_read ON public.committee_digests;
CREATE POLICY committee_digests_admin_read ON public.committee_digests FOR SELECT TO authenticated
  USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');

DROP POLICY IF EXISTS committee_digests_committee_read ON public.committee_digests;
CREATE POLICY committee_digests_committee_read ON public.committee_digests FOR SELECT TO authenticated
  USING (
    status = 'published'
    AND community_id = public.current_profile_community_id()
    AND public.is_active_committee_member(community_id)
  );
