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
            <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-lg border border-slate-100 dark:border-slate-700">
                <div className="flex flex-col md:flex-row gap-4 md:items-center justify-between">
                    <div className="flex items-center gap-2">
                        <SlidersHorizontal className="h-5 w-5 text-slate-400" />
                        <span className="font-semibold text-slate-900 dark:text-white">Filtros</span>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Availability filter */}
                        <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                            <input
                                type="checkbox"
                                checked={filterAvailable}
                                onChange={(e) => setFilterAvailable(e.target.checked)}
                                className="rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                Solo disponibles
                            </span>
                        </label>

                        {/* Sort dropdown */}
                        <select
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as 'rating' | 'price' | 'experience')}
                            className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
                <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700">
                    <div className="w-16 h-16 mx-auto mb-4 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center">
                        <Icon className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                        No hay técnicos disponibles
                    </h3>
                    <p className="text-slate-500 dark:text-slate-400">
                        Intenta ajustar los filtros de búsqueda
                    </p>
                </div>
            )}
        </>
    );
}
