import { providerServerService } from "@/lib/services/providerServerService";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderProfileClient } from "@/components/services/ProviderProfileClient";

export const dynamic = 'force-dynamic';

export default async function ProviderProfilePage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ contact?: string }>;
}) {
    const resolvedParams = await params;
    const { contact } = await searchParams;

    // Fetch provider from Supabase
    const [provider, providerReviews] = await Promise.all([
        providerServerService.getById(resolvedParams.id),
        providerServerService.getReviews(resolvedParams.id),
    ]);

    if (!provider) {
        notFound();
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 pb-24 sm:px-6 lg:pb-0">
            {/* Back Button */}
            <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm font-semibold cc-text-secondary transition-colors hover:text-brand-700"
            >
                <ArrowLeft className="h-4 w-4" />
                Volver a Servicios
            </Link>

            <ProviderProfileClient provider={provider} reviews={providerReviews} openContact={contact === "1"} />
        </div>
    );
}
