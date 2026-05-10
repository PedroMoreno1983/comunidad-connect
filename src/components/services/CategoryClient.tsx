"use client";

import { useMemo, useState } from "react";
import { ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { Briefcase, Eraser, Key, SlidersHorizontal, Wrench, Zap } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";

interface CategoryClientProps {
    providers: ServiceProvider[];
    categoryName: string;
}

function categoryIconNode(categoryName: string) {
    if (categoryName === "Gasfiteria") return <Wrench className="h-6 w-6" />;
    if (categoryName === "Electricidad") return <Zap className="h-6 w-6" />;
    if (categoryName === "Cerrajeria") return <Key className="h-6 w-6" />;
    if (categoryName === "Limpieza") return <Eraser className="h-6 w-6" />;
    return <Briefcase className="h-6 w-6" />;
}

export function CategoryClient({ providers, categoryName }: CategoryClientProps) {
    const [sortBy, setSortBy] = useState<"rating" | "price" | "experience">("rating");
    const [filterAvailable, setFilterAvailable] = useState(false);
    const emptyIcon = categoryIconNode(categoryName);

    const filteredProviders = useMemo(() => {
        const filtered = filterAvailable
            ? providers.filter(provider => provider.availability === "available")
            : [...providers];

        return filtered.sort((a, b) => {
            if (sortBy === "rating") return b.rating - a.rating;
            if (sortBy === "price") return (a.hourlyRate || 0) - (b.hourlyRate || 0);
            return b.yearsExperience - a.yearsExperience;
        });
    }, [filterAvailable, providers, sortBy]);

    return (
        <>
            <section className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-slate-400" />
                        <span className="font-semibold cc-text-primary">Orden y disponibilidad</span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-elevated px-4 py-2 transition-colors hover:bg-surface">
                            <input
                                type="checkbox"
                                checked={filterAvailable}
                                onChange={event => setFilterAvailable(event.target.checked)}
                                className="rounded border-default text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium cc-text-secondary">
                                Solo disponibles
                            </span>
                        </label>

                        <select
                            value={sortBy}
                            onChange={event => setSortBy(event.target.value as "rating" | "price" | "experience")}
                            className="rounded-lg border border-subtle bg-elevated px-4 py-2 text-sm font-medium cc-text-primary focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        >
                            <option value="rating">Mejor calificados</option>
                            <option value="price">Menor precio</option>
                            <option value="experience">Mas experiencia</option>
                        </select>
                    </div>
                </div>
            </section>

            {filteredProviders.length > 0 ? (
                <section className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredProviders.map(provider => (
                        <ProviderCard key={provider.id} provider={provider} />
                    ))}
                </section>
            ) : (
                <EmptyState
                    icon={emptyIcon}
                    title="No hay tecnicos en esta vista"
                    description="Ajusta la disponibilidad o vuelve al directorio general para revisar otros rubros de la comunidad."
                    action={
                        <Button variant="outline" onClick={() => setFilterAvailable(false)}>
                            Ver todos los proveedores
                        </Button>
                    }
                />
            )}
        </>
    );
}
