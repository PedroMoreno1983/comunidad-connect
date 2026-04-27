"use client";

import { useState, useMemo } from 'react';
import { ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { SlidersHorizontal, Wrench, Zap, Key } from "lucide-react";

interface CategoryClientProps {
    providers: ServiceProvider[];
    categoryName: string;
}

export function CategoryClient({ providers, categoryName }: CategoryClientProps) {
    const [sortBy, setSortBy] = useState<'rating' | 'price' | 'experience'>('rating');
    const [filterAvailable, setFilterAvailable] = useState(false);

    // Determine icon based on category name
    const Icon = categoryName === 'Gasfitería' ? Wrench : categoryName === 'Electricidad' ? Zap : Key;

    // Filter and sort providers
    const filteredProviders = useMemo(() => {
        let filtered = [...providers];

        // Apply availability filter
        if (filterAvailable) {
            filtered = filtered.filter(p => p.availability === 'available');
        }

        // Sort
        filtered.sort((a, b) => {
            switch (sortBy) {
                case 'rating':
                    return b.rating - a.rating;
                case 'price':
                    return (a.hourlyRate || 0) - (b.hourlyRate || 0);
                case 'experience':
                    return b.yearsExperience - a.yearsExperience;
                default:
                    return 0;
            }
        });

        return filtered;
    }, [providers, sortBy, filterAvailable]);

    return (
        <>
            {/* Filters & Sort */}
            <div className="bg-surface rounded-xl p-4 shadow-lg border border-subtle">
                <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-slate-400" />
                        <span className="font-semibold cc-text-primary">Filtros</span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Availability filter */}
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-elevated cursor-pointer hover:bg-elevated transition-colors">
                            <input
                                type="checkbox"
                                checked={filterAvailable}
                                onChange={(e) => setFilterAvailable(e.target.checked)}
                                className="rounded border-default text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium cc-text-secondary">
                                Solo disponibles
                            </span>
                        </label>

                        {/* Sort dropdown */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'rating' | 'price' | 'experience')}
                            className="px-4 py-2 rounded-lg border border-subtle bg-surface cc-text-primary text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                        >
                            <option value="rating">Mejor calificados</option>
                            <option value="price">Menor precio</option>
                            <option value="experience">Más experiencia</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Provider Grid */}
            {filteredProviders.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredProviders.map((provider, idx) => (
                        <div
                            key={provider.id}
                            className="animate-slide-up opacity-0"
                            style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                        >
                            <ProviderCard provider={provider} />
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-surface rounded-2xl shadow-lg border border-subtle">
                    <div className="w-16 h-16 mx-auto mb-4 bg-elevated rounded-full flex items-center justify-center">
                        <Icon className="h-8 w-8 cc-text-tertiary" />
                    </div>
                    <h3 className="text-lg font-semibold cc-text-primary mb-2">
                        No hay técnicos disponibles
                    </h3>
                    <p className="cc-text-secondary">
                        Intenta ajustar los filtros de búsqueda
                    </p>
                </div>
            )}
        </>
    );
}
