"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { ServiceCategoryCard } from "@/components/services/ServiceCategoryCard";

interface ServiceCategory {
    id: ServiceProvider['category'];
    name: string;
    iconName: 'wrench' | 'zap' | 'key' | 'cleaning' | 'toolbox';
    gradient: string;
    description: string;
    count: number;
}

interface ServicesCatalogClientProps {
    categories: ServiceCategory[];
    providers: ServiceProvider[];
}

function normalize(value: string) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ServicesCatalogClient({ categories, providers }: ServicesCatalogClientProps) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<ServiceProvider['category'] | "all">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "verified">("all");

    const filteredProviders = useMemo(() => {
        const normalizedQuery = normalize(query.trim());

        return providers.filter(provider => {
            const matchesCategory = category === "all" || provider.category === category;
            const matchesAvailability =
                availability === "all"
                || (availability === "available" && provider.availability === "available")
                || (availability === "verified" && provider.verified);

            const searchable = normalize([
                provider.name,
                provider.category,
                provider.bio,
                ...(provider.specialties || []),
                ...(provider.certifications || []),
            ].filter(Boolean).join(" "));

            return matchesCategory && matchesAvailability && (!normalizedQuery || searchable.includes(normalizedQuery));
        });
    }, [availability, category, providers, query]);

    const featuredProviders = providers
        .filter(provider => provider.rating >= 4.5 || provider.verified)
        .slice(0, 6);

    const hasFilters = Boolean(query || category !== "all" || availability !== "all");

    const clearFilters = () => {
        setQuery("");
        setCategory("all");
        setAvailability("all");
    };

    return (
        <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
            <div className="border-b border-subtle pb-6">
                <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Servicios</p>
                <h1 className="text-2xl font-bold cc-text-primary md:text-3xl">
                    Directorio de técnicos
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                    Conecta con profesionales verificados de confianza en tu comunidad
                </p>
            </div>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                    <div className="relative">
                        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Buscar por nombre, especialidad o certificacion..."
                            className="w-full rounded-lg border border-subtle bg-elevated py-3.5 pl-12 pr-4 text-sm font-medium cc-text-primary outline-none transition-all focus:ring-2 focus:ring-brand-500/20"
                        />
                    </div>

                    <select
                        value={category}
                        onChange={event => setCategory(event.target.value as ServiceProvider['category'] | "all")}
                        className="h-12 rounded-lg border border-subtle bg-elevated px-4 text-sm font-bold cc-text-secondary outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                        <option value="all">Todas las categorias</option>
                        {categories.map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                        ))}
                    </select>

                    <div className="flex rounded-lg border border-subtle bg-elevated p-1">
                        {[
                            { key: "all", label: "Todos" },
                            { key: "available", label: "Disponibles" },
                            { key: "verified", label: "Verificados" },
                        ].map(option => (
                            <button
                                key={option.key}
                                type="button"
                                onClick={() => setAvailability(option.key as typeof availability)}
                                className={`rounded-md px-3 py-2 text-[11px] font-black transition-colors ${
                                    availability === option.key
                                        ? "bg-brand-500 text-white"
                                        : "cc-text-secondary hover:bg-surface"
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="inline-flex items-center gap-2 text-xs font-bold cc-text-secondary">
                        <SlidersHorizontal className="h-4 w-4" />
                        {filteredProviders.length} tecnico(s) encontrados
                    </p>
                    {hasFilters && (
                        <button
                            type="button"
                            onClick={clearFilters}
                            className="inline-flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-xs font-black cc-text-secondary hover:bg-slate-200 dark:hover:bg-slate-800"
                        >
                            <X className="h-3.5 w-3.5" />
                            Limpiar filtros
                        </button>
                    )}
                </div>
            </section>

            {hasFilters ? (
                <section>
                    <h2 className="mb-6 text-2xl font-bold cc-text-primary">Resultados</h2>
                    {filteredProviders.length > 0 ? (
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {filteredProviders.map(provider => (
                                <ProviderCard key={provider.id} provider={provider} showCategory />
                            ))}
                        </div>
                    ) : (
                        <div className="rounded-lg border border-dashed border-subtle bg-surface p-12 text-center">
                            <h3 className="text-xl font-bold cc-text-primary">No encontramos tecnicos con esos filtros</h3>
                            <p className="mt-2 text-sm cc-text-secondary">Prueba con otra categoria o una busqueda mas amplia.</p>
                        </div>
                    )}
                </section>
            ) : (
                <>
                    <section>
                        <h2 className="mb-6 text-2xl font-bold cc-text-primary">
                            Categorias de Servicio
                        </h2>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {categories.map(item => (
                                <ServiceCategoryCard key={item.id} category={item} />
                            ))}
                        </div>
                    </section>

                    {featuredProviders.length > 0 && (
                        <section>
                            <div className="mb-6 flex items-center justify-between">
                                <h2 className="text-2xl font-bold cc-text-primary">
                                    Tecnicos Destacados
                                </h2>
                                <p className="text-sm cc-text-secondary">
                                    Los mejor calificados de la semana
                                </p>
                            </div>
                            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {featuredProviders.map(provider => (
                                    <ProviderCard key={provider.id} provider={provider} showCategory />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}

            <section className="rounded-lg border border-subtle bg-surface p-6 md:p-8">
                <div className="relative z-10">
                    <h2 className="mb-3 text-xl font-bold cc-text-primary">
                        ¿Eres técnico profesional?
                    </h2>
                    <p className="mb-6 max-w-2xl text-sm cc-text-secondary">
                        Únete a la red de profesionales verificados y recibe solicitudes de tu comunidad.
                    </p>
                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/services/register"
                            className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600"
                        >
                            Registrarse como Tecnico
                        </Link>
                        <Link
                            href="/services/provider-dashboard"
                            className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-elevated px-5 py-3 text-sm font-bold cc-text-primary transition-colors hover:bg-surface"
                        >
                            Panel Proveedor
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
