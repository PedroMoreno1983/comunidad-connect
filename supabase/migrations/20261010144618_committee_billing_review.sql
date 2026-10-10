-- Revisión independiente del prorrateo antes de emitir el gasto común.
-- Cada solicitud conserva una foto de la propuesta; una nueva solicitud no
-- sobreescribe decisiones anteriores.
CREATE TABLE IF NOT EXISTS public.finance_committee_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  month text NOT NULL CHECK (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  due_date date NOT NULL,
  quota_amount numeric(14, 2),
  quota_method text CHECK (quota_method IN ('share', 'equal')),
  snapshot_digest text NOT NULL CHECK (snapshot_digest ~ '^[0-9a-f]{64}$'),
  snapshot jsonb NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  review_note text CHECK (length(review_note) <= 1000),
  CONSTRAINT finance_committee_review_distinct_actors CHECK (reviewer_id <> requested_by)
);

CREATE INDEX IF NOT EXISTS finance_committee_reviews_latest
  ON public.finance_committee_reviews(community_id, month, requested_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS finance_committee_reviews_reviewer
  ON public.finance_committee_reviews(reviewer_id, requested_at DESC);

ALTER TABLE public.finance_committee_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.finance_committee_reviews FROM anon, authenticated;
GRANT ALL ON public.finance_committee_reviews TO service_role;

ALTER TABLE public.billing_runs
  ADD COLUMN IF NOT EXISTS committee_review_id uuid REFERENCES public.finance_committee_reviews(id) ON DELETE SET NULL;
