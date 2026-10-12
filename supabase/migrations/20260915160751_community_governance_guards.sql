BEGIN;

CREATE OR REPLACE FUNCTION public.validate_community_coordinator()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.coordinator_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = NEW.coordinator_id AND community_id = NEW.community_id
  ) THEN
    RAISE EXCEPTION 'coordinator-outside-community';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_community_coordinator() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS time_bank_coordinator_tenant_guard ON public.time_bank_offers;
CREATE TRIGGER time_bank_coordinator_tenant_guard BEFORE INSERT OR UPDATE OF coordinator_id ON public.time_bank_offers FOR EACH ROW EXECUTE FUNCTION public.validate_community_coordinator();
DROP TRIGGER IF EXISTS collective_purchase_coordinator_tenant_guard ON public.collective_purchase_campaigns;
CREATE TRIGGER collective_purchase_coordinator_tenant_guard BEFORE INSERT OR UPDATE OF coordinator_id ON public.collective_purchase_campaigns FOR EACH ROW EXECUTE FUNCTION public.validate_community_coordinator();
DROP TRIGGER IF EXISTS community_project_coordinator_tenant_guard ON public.community_projects;
CREATE TRIGGER community_project_coordinator_tenant_guard BEFORE INSERT OR UPDATE OF coordinator_id ON public.community_projects FOR EACH ROW EXECUTE FUNCTION public.validate_community_coordinator();
DROP TRIGGER IF EXISTS supermarket_group_coordinator_tenant_guard ON public.supermarket_group_orders;
CREATE TRIGGER supermarket_group_coordinator_tenant_guard BEFORE INSERT OR UPDATE OF coordinator_id ON public.supermarket_group_orders FOR EACH ROW EXECUTE FUNCTION public.validate_community_coordinator();

CREATE INDEX IF NOT EXISTS idx_time_bank_coordinator ON public.time_bank_offers(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_time_bank_validated_by ON public.time_bank_offers(validated_by);
CREATE INDEX IF NOT EXISTS idx_collective_purchase_organizer ON public.collective_purchase_campaigns(organizer_id);
CREATE INDEX IF NOT EXISTS idx_collective_purchase_coordinator ON public.collective_purchase_campaigns(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_collective_purchase_validated_by ON public.collective_purchase_campaigns(validated_by);
CREATE INDEX IF NOT EXISTS idx_community_project_creator ON public.community_projects(creator_id);
CREATE INDEX IF NOT EXISTS idx_community_project_coordinator ON public.community_projects(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_community_project_validated_by ON public.community_projects(validated_by);
CREATE INDEX IF NOT EXISTS idx_supermarket_group_coordinator ON public.supermarket_group_orders(coordinator_id);
CREATE INDEX IF NOT EXISTS idx_supermarket_group_validated_by ON public.supermarket_group_orders(validated_by);
CREATE INDEX IF NOT EXISTS idx_community_participation_community ON public.community_participation_requests(community_id);
CREATE INDEX IF NOT EXISTS idx_community_participation_resolved_by ON public.community_participation_requests(resolved_by);

COMMIT;
