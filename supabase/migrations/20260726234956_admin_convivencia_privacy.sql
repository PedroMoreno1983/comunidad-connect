-- Separate resident mediation drafts from administrative case management.
-- Residents can read and update only their own cases. Administrators can only
-- access cases that were explicitly escalated or already reached agreement.

DROP POLICY IF EXISTS "tenant_neighbor_mediations_select" ON public.neighbor_mediations;
DROP POLICY IF EXISTS "tenant_neighbor_mediations_update" ON public.neighbor_mediations;

CREATE POLICY "tenant_neighbor_mediations_select"
ON public.neighbor_mediations
FOR SELECT
TO authenticated
USING (
  community_id = get_my_community_id()
  AND (
    reporter_id = (SELECT auth.uid())
    OR (get_my_role() = 'admin' AND status IN ('escalated', 'agreement'))
  )
);

CREATE POLICY "tenant_neighbor_mediations_update"
ON public.neighbor_mediations
FOR UPDATE
TO authenticated
USING (
  community_id = get_my_community_id()
  AND (reporter_id = (SELECT auth.uid()) OR (get_my_role() = 'admin' AND status IN ('escalated', 'agreement')))
)
WITH CHECK (
  community_id = get_my_community_id()
  AND (reporter_id = (SELECT auth.uid()) OR (get_my_role() = 'admin' AND status IN ('escalated', 'agreement')))
);

