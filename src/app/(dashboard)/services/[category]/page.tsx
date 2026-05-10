import { providersService } from "@/lib/services/providersService";
import { CategoryClient } from "@/components/services/CategoryClient";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

type CategoryId = "plumbing" | "electrical" | "locksmith" | "cleaning" | "general";

const CATEGORY_CONFIG: Record<CategoryId, {
    name: string;
    iconName: "wrench" | "zap" | "key" | "cleaning" | "toolbox";
    gradient: string;
    description: string;
}> = {
    plumbing: {
        name: "Gasfiteria",
        iconName: "wrench",
        gradient: "from-blue-500 to-cyan-600",
        description: "Expertos en instalaciones, fugas y reparaciones de sistemas de agua",
    },
    electrical: {
        name: "Electricidad",
        iconName: "zap",
        gradient: "from-yellow-500 to-orange-600",
        description: "Electricistas certificados para instalaciones, tableros y emergencias",
    },
    locksmith: {
        name: "Cerrajeria",
        iconName: "key",
        gradient: "from-purple-500 to-pink-600",
        description: "Servicios de cerrajeria, accesos y seguridad las 24 horas",
    },
    cleaning: {
        name: "Limpieza",
        iconName: "cleaning",
        gradient: "from-emerald-500 to-teal-600",
        description: "Aseo profesional para departamentos, mudanzas y espacios comunes",
    },
    general: {
        name: "Multiservicios",
        iconName: "toolbox",
        gradient: "from-orange-500 to-red-600",
        description: "Reparaciones menores, mantencion preventiva y apoyo operativo",
    },
};

export const dynamic = "force-dynamic";

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
    const resolvedParams = await params;
    const category = resolvedParams.category as CategoryId;
    const config = CATEGORY_CONFIG[category];

    if (!config) {
        notFound();
    }

    const categoryProviders = await providersService.getByCategory(category);

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
            <header className="border-b border-subtle pb-7">
                <Link
                    href="/services"
                    className="mb-4 inline-flex items-center gap-2 text-sm font-medium cc-text-secondary transition-colors hover:text-brand-600"
                >
                    <ArrowLeft className="h-4 w-4" />
                    Volver a servicios
                </Link>

                <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
                            Red de proveedores
                        </div>
                        <h1 className="text-3xl font-bold cc-text-primary md:text-4xl">
                            {config.name}
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                            {config.description}. Compara disponibilidad, experiencia y evaluaciones antes de solicitar.
                        </p>
                    </div>
                    <div className="rounded-lg border border-subtle bg-surface px-5 py-4 shadow-sm">
                        <p className="text-2xl font-semibold cc-text-primary">{categoryProviders.length}</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            {categoryProviders.length === 1 ? "Tecnico disponible" : "Tecnicos disponibles"}
                        </p>
                    </div>
                </div>
            </header>

            <CategoryClient providers={categoryProviders} categoryName={config.name} />
        </div>
    );
}
