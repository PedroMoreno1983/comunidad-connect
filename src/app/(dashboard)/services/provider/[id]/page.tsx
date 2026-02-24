import { providersService, reviewsService } from "@/lib/services/providersService";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ProviderProfileClient } from "@/components/services/ProviderProfileClient";

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
        <div className="max-w-5xl mx-auto space-y-6">
            {/* Back Button */}
            <Link
                href="/services"
                className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                Volver a Servicios
            </Link>

            <ProviderProfileClient provider={provider} reviews={providerReviews} />
        </div>
    );
}
