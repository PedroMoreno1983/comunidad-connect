"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
    ArrowRight,
    BadgeCheck,
    BriefcaseBusiness,
    Clock3,
    Filter,
    Search,
    ShieldCheck,
    SlidersHorizontal,
    Star,
    UsersRound,
    Wrench,
    X,
} from "lucide-react";
import { ServiceProvider } from "@/lib/types";
import { ProviderCard } from "@/components/services/ProviderCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";

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

const CATEGORY_LABELS: Record<ServiceProvider["category"], string> = {
    plumbing: "Gasfitería",
    electrical: "Electricidad",
    locksmith: "Cerrajería",
    cleaning: "Limpieza",
    general: "Multiservicios",
};

function normalize(value: string) {
    return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function ServicesCatalogClient({ categories, providers }: ServicesCatalogClientProps) {
    const [catalogProviders, setCatalogProviders] = useState(providers);
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<ServiceProvider["category"] | "all">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "verified">("all");

    useEffect(() => {
        setCatalogProviders(providers);
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
                CATEGORY_LABELS[provider.category],
                provider.bio,
                ...(provider.specialties || []),
                ...(provider.certifications || []),
            ].filter(Boolean).join(" "));

            return matchesCategory && matchesAvailability && (!normalizedQuery || searchable.includes(normalizedQuery));
        });
    }, [availability, catalogProviders, category, query]);

    const featuredProviders = catalogProviders
        .filter(provider => provider.rating >= 4.5 || provider.verified)
        .slice(0, 3);
    const verifiedCount = catalogProviders.filter(provider => provider.verified).length;
    const availableCount = catalogProviders.filter(provider => provider.availability === "available").length;
    const averageRating = catalogProviders.length
        ? (catalogProviders.reduce((sum, provider) => sum + provider.rating, 0) / catalogProviders.length).toFixed(1)
        : "0.0";
    const completedJobs = catalogProviders.reduce((sum, provider) => sum + provider.completedJobs, 0);
    const hasFilters = Boolean(query || category !== "all" || availability !== "all");

    const clearFilters = () => {
        setQuery("");
        setCategory("all");
        setAvailability("all");
    };

    return (
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <section className="relative overflow-hidden rounded-xl border bg-ink text-paper shadow-xl" style={{ borderColor: "rgba(250,247,241,0.08)" }}>
                <div
                    aria-hidden
                    className="absolute -right-20 -top-24 h-80 w-80 rounded-full"
                    style={{ background: "radial-gradient(circle, rgba(156, 86, 54,0.35), transparent 64%)" }}
                />
                <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1.2fr_0.8fr] lg:p-10">
                    <div className="relative flex flex-col justify-between gap-8">
                        <div>
                            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/82">
                                <ShieldCheck className="h-3.5 w-3.5 text-[#C99572]" />
                                Red profesional verificada
                            </div>
                            <DisplayHeading size={52} style={{ color: "var(--cc-paper)" }}>
                                Solicita servicios <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>con contexto</em>.
                            </DisplayHeading>
                            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/72 md:text-base">
                                Perfiles con reputación, especialidades, disponibilidad y solicitudes trazables para que la comunidad contrate con más confianza.
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-3">
                            <Link
                                href="/services/my-requests"
                                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-[#111827] shadow-sm transition hover:bg-[#F4EFE6]"
                            >
                                Mis solicitudes
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                            <Link
                                href="/services/register"
                                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/18 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/16"
                            >
                                Crear perfil proveedor
                            </Link>
                        </div>
                    </div>

                    <div className="relative grid gap-3 sm:grid-cols-2">
                        {[
                            { label: "Disponibles hoy", value: availableCount, icon: <Clock3 className="h-5 w-5" /> },
                            { label: "Verificados", value: verifiedCount, icon: <BadgeCheck className="h-5 w-5" /> },
                            { label: "Calificacion media", value: averageRating, icon: <Star className="h-5 w-5" /> },
                            { label: "Trabajos cerrados", value: completedJobs, icon: <BriefcaseBusiness className="h-5 w-5" /> },
                        ].map(stat => (
                            <div key={stat.label} className="rounded-xl border border-white/12 bg-white/[0.07] p-4 shadow-sm">
                                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-[#C99572]">
                                    {stat.icon}
                                </div>
                                <p className="text-2xl font-bold text-white">{stat.value}</p>
                                <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/56">{stat.label}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="mt-6 grid gap-6 lg:grid-cols-[290px_1fr]">
                <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
                    <section className="rounded-xl border bg-paper p-4 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="mb-4 flex items-center gap-2">
                            <Filter className="h-4 w-4 text-copper" />
                            <h2 className="text-sm font-bold cc-text-primary">Especialidades</h2>
                        </div>
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() => setCategory("all")}
                                className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                                    category === "all" ? "bg-ink text-paper" : "cc-text-secondary hover:bg-paper-warm"
                                }`}
                            >
                                Toda la red
                                <span className="text-xs">{catalogProviders.length}</span>
                            </button>
                            {categoriesWithCounts.map(item => (
                                <button
                                    key={item.id}
                                    type="button"
                                    onClick={() => setCategory(item.id)}
                                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition ${
                                        category === item.id ? "bg-ink text-paper" : "cc-text-secondary hover:bg-paper-warm"
                                    }`}
                                >
                                    <span>{item.name}</span>
                                    <span className="text-xs">{item.count}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border bg-paper p-4 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="mb-3 flex items-center gap-2">
                            <UsersRound className="h-4 w-4 text-copper" />
                            <h2 className="text-sm font-bold cc-text-primary">Cómo opera</h2>
                        </div>
                        <div className="space-y-3 text-sm cc-text-secondary">
                            <p>1. Revisa reputación y habilidades.</p>
                            <p>2. Envía una solicitud trazable.</p>
                            <p>3. Cierra el trabajo y deja evaluación.</p>
                        </div>
                    </section>
                </aside>

                <main className="space-y-6">
                    <section id="catalogo-servicios" className="scroll-mt-24 rounded-xl border bg-paper p-4 shadow-sm sm:p-5" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
                            <div className="relative">
                                <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-copper" />
                                <input
                                    type="text"
                                    value={query}
                                    onChange={event => setQuery(event.target.value)}
                                    placeholder="Buscar por nombre, especialidad o certificación"
                                    className="w-full rounded-xl border bg-paper-warm py-3.5 pl-12 pr-4 text-sm font-medium cc-text-primary outline-none transition-all placeholder:cc-text-tertiary focus:border-copper focus:ring-4 focus:ring-[rgba(156, 86, 54,0.16)]"
                                    style={{ borderColor: "var(--cc-line)" }}
                                />
                            </div>

                            <div className="flex flex-wrap gap-2 rounded-xl border bg-paper-warm p-1" style={{ borderColor: "var(--cc-line)" }}>
                                {[
                                    { key: "all", label: "Todos" },
                                    { key: "available", label: "Disponibles" },
                                    { key: "verified", label: "Verificados" },
                                ].map(option => (
                                    <button
                                        key={option.key}
                                        type="button"
                                        onClick={() => setAvailability(option.key as typeof availability)}
                                        className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                                            availability === option.key
                                                ? "bg-ink text-paper shadow-sm"
                                                : "cc-text-secondary hover:bg-paper"
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
                                {filteredProviders.length} perfil(es) encontrados
                            </p>
                            {hasFilters && (
                                <button
                                    type="button"
                                    onClick={clearFilters}
                                    className="inline-flex items-center gap-2 rounded-lg bg-paper-warm px-3 py-2 text-xs font-semibold cc-text-secondary hover:text-copper"
                                >
                                    <X className="h-3.5 w-3.5" />
                                    Limpiar filtros
                                </button>
                            )}
                        </div>
                    </section>

                    {!hasFilters && featuredProviders.length > 0 && (
                        <section className="rounded-xl border bg-paper p-5 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                                <div>
                                    <Eyebrow>Recomendados</Eyebrow>
                                    <h2 className="mt-1 text-xl font-semibold tracking-normal cc-text-primary">Perfiles destacados de la red</h2>
                                </div>
                                <Link href="/services/register" className="inline-flex items-center gap-2 text-sm font-bold text-copper">
                                    Postular proveedor
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            </div>
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                                {featuredProviders.map(provider => (
                                    <ProviderCard key={provider.id} provider={provider} showCategory compact />
                                ))}
                            </div>
                        </section>
                    )}

                    <section>
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <Eyebrow>Directorio</Eyebrow>
                                <h2 className="mt-1 text-2xl font-semibold tracking-normal cc-text-primary">Profesionales y empresas</h2>
                            </div>
                            <Wrench className="hidden h-7 w-7 text-copper sm:block" />
                        </div>

                        {filteredProviders.length > 0 ? (
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                {filteredProviders.map(provider => (
                                    <ProviderCard key={provider.id} provider={provider} showCategory />
                                ))}
                            </div>
                        ) : (
                            <EmptyState
                                icon={<Search className="h-6 w-6" />}
                                title="No encontramos perfiles con esos filtros"
                                description="Prueba con otro rubro, amplía la búsqueda o vuelve a ver toda la red disponible."
                                action={<Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}
                            />
                        )}
                    </section>
                </main>
            </div>
        </div>
    );
}
