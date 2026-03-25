import { providersService } from "@/lib/services/providersService";
import { CategoryClient } from "@/components/services/CategoryClient";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

type CategoryId = 'plumbing' | 'electrical' | 'locksmith';

const CATEGORY_CONFIG = {
    plumbing: {
        name: 'Gasfitería',
        iconName: 'wrench' as const,
        gradient: 'from-blue-500 to-cyan-600',
        description: 'Expertos en instalaciones y reparaciones de sistemas de agua'
    },
    electrical: {
        name: 'Electricidad',
        iconName: 'zap' as const,
        gradient: 'from-yellow-500 to-orange-600',
        description: 'Electricistas certificados para tu hogar o negocio'
    },
    locksmith: {
        name: 'Cerrajería',
        iconName: 'key' as const,
        gradient: 'from-purple-500 to-pink-600',
        description: 'Servicios de cerrajería y seguridad las 24 horas'
    }
};

export const dynamic = 'force-dynamic';

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
    const resolvedParams = await params;
    const category = resolvedParams.category as CategoryId;
    const config = CATEGORY_CONFIG[category];

    if (!config) {
        notFound();
    }

    // Fetch providers from Supabase for this category
    const categoryProviders = await providersService.getByCategory(category);

    return (
        <div className="max-w-7xl space-y-8">
            {/* Header */}
            <div>
                <Link
                    href="/services"
                    className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors mb-4"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a Servicios
                </Link>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="mb-3">
                            <h1 className="text-3xl md:text-4xl font-bold text-slate-900 dark:text-white">
                                {config.name}
                            </h1>
                            <p className="text-slate-500 dark:text-slate-400 mt-1">
                                {categoryProviders.length} {categoryProviders.length === 1 ? 'técnico disponible' : 'técnicos disponibles'}
                            </p>
                        </div>
                        <p className="text-lg text-slate-600 dark:text-slate-300 max-w-2xl">
                            {config.description}
                        </p>
                    </div>
                </div>
            </div>

            <CategoryClient providers={categoryProviders} categoryName={config.name} />
        </div>
    );
}
