-- Residents must never be able to mark their own common-expense charge as paid.
-- Successful payments are written exclusively by the signed Haulmer webhook
-- with the service role. Administrators retain the community-scoped policy.

DROP POLICY IF EXISTS "expenses_update_own" ON public.expenses;

-- Keep the read policy explicit and scoped to the unit associated with auth.uid().
DROP POLICY IF EXISTS "expenses_select_own" ON public.expenses;
CREATE POLICY "expenses_select_own"
  ON public.expenses
  FOR SELECT
  USING (
    unit_id = (
      SELECT profiles.unit_id
      FROM public.profiles
      WHERE profiles.id = auth.uid()
      LIMIT 1
    )
    AND community_id = public.get_my_community_id()
  );
