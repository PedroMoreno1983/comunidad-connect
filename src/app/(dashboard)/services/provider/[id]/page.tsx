import { providersService, reviewsService } from "@/lib/services/providersService";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderProfileClient } from "@/components/services/ProviderProfileClient";

export const dynamic = 'force-dynamic';

export default async function ProviderProfilePage({ params }: { params: Promise<{ id: string }> }) {
    const resolvedParams = await params;

    // Fetch provider from Supabase
    const provider = await providersService.getById(resolvedParams.id);

    if (!provider) {
        notFound();
    }

    // Fetch reviews for this provider
    const providerReviews = await reviewsService.getByProvider(provider.id);

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

            <ProviderProfileClient provider={provider} reviews={providerReviews} />
        </div>
    );
}
