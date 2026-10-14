-- Keep each financial close and its audit record in the same transaction.
-- The caller inserts only with service_role; a failed audit insert rolls back the close.
CREATE OR REPLACE FUNCTION public.audit_finance_period_closure()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.operation_events (
    community_id, actor_id, actor_role, action, entity_type, entity_id,
    severity, status, summary, metadata
  ) VALUES (
    NEW.community_id, NEW.closed_by, 'admin', 'finance.period_snapshot_saved',
    'finance_period_closure', NEW.month, 'info', 'success',
    'Corte financiero ' || NEW.month || ' guardado',
    jsonb_build_object(
      'month', NEW.month,
      'openingCash', NEW.opening_cash,
      'totalIncome', NEW.statements #> '{income,totalIncome}',
      'totalExpenses', NEW.statements #> '{income,totalExpenses}'
    )
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_finance_period_closure() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_finance_period_closure() TO service_role;

DROP TRIGGER IF EXISTS finance_period_closure_audit ON public.finance_period_closures;
CREATE TRIGGER finance_period_closure_audit
  AFTER INSERT ON public.finance_period_closures
  FOR EACH ROW EXECUTE FUNCTION public.audit_finance_period_closure();
