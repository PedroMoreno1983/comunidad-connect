"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowRight,
    BadgeCheck,
    BriefcaseBusiness,
    CheckCircle2,
    Clock3,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Star,
    X,
} from "lucide-react";
import { ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { ServiceCategoryCard } from "@/components/services/ServiceCategoryCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/Button";
import { mergeDemoCreatedProviders } from "@/lib/services/demoProvidersStorage";

interface ServiceCategory {
    id: ServiceProvider["category"];
    name: string;
    iconName: "wrench" | "zap" | "key" | "cleaning" | "toolbox";
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
    const [catalogProviders, setCatalogProviders] = useState(providers);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<ServiceProvider["category"] | "all">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "verified">("all");

    useEffect(() => {
        setCatalogProviders(mergeDemoCreatedProviders(providers));
    }, [providers]);

    const categoriesWithCounts = useMemo(() => categories.map(item => ({
        ...item,
        count: catalogProviders.filter(provider => provider.category === item.id).length,
    })), [catalogProviders, categories]);

    const filteredProviders = useMemo(() => {
        const normalizedQuery = normalize(query.trim());

        return catalogProviders.filter(provider => {
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
    }, [availability, catalogProviders, category, query]);

    const featuredProviders = catalogProviders
        .filter(provider => provider.rating >= 4.5 || provider.verified)
        .slice(0, 6);
    const verifiedCount = catalogProviders.filter(provider => provider.verified).length;
    const availableCount = catalogProviders.filter(provider => provider.availability === "available").length;
    const averageRating = catalogProviders.length
        ? (catalogProviders.reduce((sum, provider) => sum + provider.rating, 0) / catalogProviders.length).toFixed(1)
        : "0.0";
    const totalSpecialties = new Set(catalogProviders.flatMap(provider => provider.specialties || [])).size;
    const hasFilters = Boolean(query || category !== "all" || availability !== "all");

    const clearFilters = () => {
        setQuery("");
        setCategory("all");
        setAvailability("all");
    };

    return (
        <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
            <header className="border-b border-subtle pb-7">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-2xl">
                        <div className="mb-3 inline-flex items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Red verificada
                        </div>
                        <h1 className="text-2xl font-bold cc-text-primary md:text-3xl">Directorio de tecnicos</h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                            Encuentra proveedores evaluados por la comunidad, revisa disponibilidad y solicita trabajos con trazabilidad desde CoCo.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/services/my-requests"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-subtle bg-surface px-4 py-3 text-sm font-semibold cc-text-primary shadow-sm transition-colors hover:bg-elevated"
                        >
                            Mis solicitudes
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link
                            href="/services/register"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600"
                        >
                            Registrar proveedor
                        </Link>
                    </div>
                </div>
            </header>

            <section className="grid gap-3 md:grid-cols-4">
                {[
                    { label: "Disponibles hoy", value: availableCount, icon: <Clock3 className="h-5 w-5" />, tone: "bg-blue-50 text-blue-600 dark:bg-blue-500/10" },
                    { label: "Verificados", value: verifiedCount, icon: <BadgeCheck className="h-5 w-5" />, tone: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" },
                    { label: "Calificacion promedio", value: averageRating, icon: <Star className="h-5 w-5" />, tone: "bg-amber-50 text-amber-600 dark:bg-amber-500/10" },
                    { label: "Especialidades", value: totalSpecialties || categories.length, icon: <BriefcaseBusiness className="h-5 w-5" />, tone: "bg-elevated cc-text-secondary" },
                ].map(stat => (
                    <div key={stat.label} className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
                        <div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-lg ${stat.tone}`}>
                            {stat.icon}
                        </div>
                        <p className="text-2xl font-semibold cc-text-primary">{stat.value}</p>
                        <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{stat.label}</p>
                    </div>
                ))}
            </section>

            <section className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        ["1", "Solicita", "El residente describe el problema y adjunta fotos si corresponde."],
                        ["2", "Coordina", "El proveedor confirma disponibilidad, visita y condiciones del trabajo."],
                        ["3", "Cierra", "La comunidad deja registro, evaluacion y trazabilidad de la solicitud."],
                    ].map(([step, title, description]) => (
                        <div key={step} className="flex gap-4 rounded-lg border border-subtle bg-elevated/40 p-4">
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-surface text-sm font-bold cc-text-primary">
                                {step}
                            </div>
                            <div>
                                <h3 className="font-semibold cc-text-primary">{title}</h3>
                                <p className="mt-1 text-sm leading-6 cc-text-secondary">{description}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

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
                        onChange={event => setCategory(event.target.value as ServiceProvider["category"] | "all")}
                        className="h-12 rounded-lg border border-subtle bg-elevated px-4 text-sm font-bold cc-text-secondary outline-none focus:ring-2 focus:ring-brand-500/20"
                    >
                        <option value="all">Todas las categorias</option>
                        {categoriesWithCounts.map(item => (
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
                                className={`rounded-md px-3 py-2 text-[11px] font-semibold transition-colors ${
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
                            className="inline-flex items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-xs font-semibold cc-text-secondary hover:bg-slate-200 dark:hover:bg-slate-800"
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
                        <EmptyState
                            icon={<Search className="h-6 w-6" />}
                            title="No encontramos tecnicos con esos filtros"
                            description="Prueba con otro rubro, amplia la busqueda o vuelve a ver toda la red disponible."
                            action={<Button variant="outline" onClick={clearFilters}>Limpiar filtros</Button>}
                        />
                    )}
                </section>
            ) : (
                <>
                    <section>
                        <h2 className="mb-6 text-2xl font-bold cc-text-primary">Categorias de servicio</h2>
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                            {categoriesWithCounts.map(item => (
                                <ServiceCategoryCard key={item.id} category={item} />
                            ))}
                        </div>
                    </section>

                    {featuredProviders.length > 0 && (
                        <section>
                            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <h2 className="text-2xl font-bold cc-text-primary">Tecnicos destacados</h2>
                                    <p className="mt-1 text-sm cc-text-secondary">Los mejor calificados de la semana.</p>
                                </div>
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

            <section className="rounded-lg border border-subtle bg-surface p-6 shadow-sm md:p-8">
                <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr] lg:items-center">
                    <div>
                        <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-success-bg px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-success-fg">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Red controlada
                        </div>
                        <h2 className="mb-3 text-xl font-bold cc-text-primary">Eres tecnico profesional?</h2>
                        <p className="max-w-2xl text-sm leading-6 cc-text-secondary">
                            Unete a la red de proveedores, recibe solicitudes verificadas y administra tus trabajos desde un panel con estados claros.
                        </p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row lg:justify-end">
                        <Link
                            href="/services/register"
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600"
                        >
                            Registrarse
                        </Link>
                        <Link
                            href="/services/provider-dashboard"
                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-subtle bg-elevated px-5 py-3 text-sm font-bold cc-text-primary transition-colors hover:bg-surface"
                        >
                            Panel proveedor
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}
