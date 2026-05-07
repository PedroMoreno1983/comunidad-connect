import { MarketplaceManagementClient } from "@/components/marketplace/MarketplaceManagementClient";

export const dynamic = "force-dynamic";

export default function AdminMarketplacePage() {
    return <MarketplaceManagementClient mode="admin" />;
}
