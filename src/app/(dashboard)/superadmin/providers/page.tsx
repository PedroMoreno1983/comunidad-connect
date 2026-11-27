import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import ProviderNetworkPanel from "@/components/admin/ProviderNetworkPanel";
import { DisplayHeading } from "@/components/cc/Eyebrow";

export default function SuperAdminProvidersPage() {
    return (
        <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-8">
            <Link href="/superadmin" className="inline-flex items-center gap-2 text-sm font-semibold underline">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Panel SaaS
            </Link>
            <DisplayHeading size={32}>Proveedores</DisplayHeading>
            <ProviderNetworkPanel />
        </div>
    );
}
