import { MarketplaceManagementClient } from "@/components/marketplace/MarketplaceManagementClient";

export const dynamic = "force-dynamic";

export default function MyMarketplaceListingsPage() {
    return <MarketplaceManagementClient mode="mine" />;
}
