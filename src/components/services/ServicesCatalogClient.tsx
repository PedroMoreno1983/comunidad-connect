"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock3, Search, Star, X } from "lucide-react";
import type { ServiceProvider } from "@/lib/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { getInitials } from "@/lib/utils/avatar";

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

function availabilityLabel(value: ServiceProvider["availability"]) {
    if (value === "available") return { label: "Disponible hoy", color: "var(--cc-sage)" };
    if (value === "busy") return { label: "Agenda ocupada", color: "var(--cc-amber)" };
    return { label: "Sin cupos", color: "var(--cc-rose)" };
}

export function ServicesCatalogClient({ categories, providers }: ServicesCatalogClientProps) {
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState<ServiceProvider["category"] | "all">("all");
    const [availability, setAvailability] = useState<"all" | "available" | "verified">("all");

    const filteredProviders = useMemo(() => {
        const normalizedQuery = normalize(query.trim());
        return providers.filter(provider => {
            const matchesCategory = category === "all" || provider.category === category;
            const matchesAvailability = availability === "all"
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
    }, [availability, category, providers, query]);

    const availableCount = providers.filter(provider => provider.availability === "available").length;
    const verifiedCount = providers.filter(provider => provider.verified).length;
    const hasFilters = Boolean(query || category !== "all" || availability !== "all");
    const clearFilters = () => {
        setQuery("");
        setCategory("all");
        setAvailability("all");
    };

    return (
        <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
            <header className="border-b pb-8 sm:pb-10" style={{ borderColor: "var(--cc-line-strong)" }}>
                <div className="flex flex-col gap-7 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <Eyebrow className="mb-3">Directorio de servicios</Eyebrow>
                        <DisplayHeading size={58}>
                            Contrata con <em className="font-normal italic text-copper">contexto.</em>
                        </DisplayHeading>
                        <p className="mt-5 max-w-2xl text-sm leading-6 cc-text-secondary sm:text-base">
                            Profesionales con reputación, especialidades y disponibilidad visibles antes de solicitar una cotización.
                        </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        <Link href="/services/my-requests"><Button variant="ghost">Mis solicitudes</Button></Link>
                        <Link href="/services/register"><Button variant="copper">Crear perfil proveedor</Button></Link>
                    </div>
                </div>

                <div className="mt-8 flex flex-wrap gap-x-8 gap-y-3 border-t pt-5 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                    <span><strong className="font-mono text-lg cc-text-primary">{providers.length}</strong> profesionales</span>
                    <span><strong className="font-mono text-lg cc-text-primary">{availableCount}</strong> disponibles hoy</span>
                    <span><strong className="font-mono text-lg cc-text-primary">{verifiedCount}</strong> verificados</span>
                </div>
            </header>

            <section className="py-7 sm:py-9">
                <div className="relative border-b pb-4" style={{ borderColor: "var(--cc-line-strong)" }}>
                    <Search className="absolute left-0 top-1 h-5 w-5 cc-text-tertiary" strokeWidth={1.5} />
                    <input
                        value={query}
                        onChange={event => setQuery(event.target.value)}
                        placeholder="Nombre, especialidad o certificación…"
                        className="w-full bg-transparent pl-8 pr-9 text-base outline-none placeholder:cc-text-tertiary cc-text-primary sm:text-lg"
                    />
                    {query && (
                        <button type="button" onClick={() => setQuery("")} className="absolute right-0 top-0.5 p-1 cc-text-tertiary" aria-label="Limpiar búsqueda">
                            <X className="h-5 w-5" />
                        </button>
                    )}
                </div>

                <div className="mt-5 flex gap-6 overflow-x-auto border-b scrollbar-none" style={{ borderColor: "var(--cc-line)" }}>
                    <button type="button" onClick={() => setCategory("all")} className={`shrink-0 border-b-2 pb-3 text-sm ${category === "all" ? "border-copper font-semibold cc-text-primary" : "border-transparent cc-text-tertiary"}`}>
                        Todos · {providers.length}
                    </button>
                    {categories.map(item => (
                        <button key={item.id} type="button" onClick={() => setCategory(item.id)} className={`shrink-0 border-b-2 pb-3 text-sm ${category === item.id ? "border-copper font-semibold cc-text-primary" : "border-transparent cc-text-tertiary"}`}>
                            {item.name} · {providers.filter(provider => provider.category === item.id).length}
                        </button>
                    ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex gap-2">
                        {[
                            { key: "all", label: "Toda la red" },
                            { key: "available", label: "Disponibles" },
                            { key: "verified", label: "Verificados" },
                        ].map(option => (
                            <button key={option.key} type="button" onClick={() => setAvailability(option.key as typeof availability)} className={`rounded-full border px-3 py-1.5 text-xs transition ${availability === option.key ? "border-ink bg-ink text-paper" : "cc-text-secondary"}`} style={availability === option.key ? undefined : { borderColor: "var(--cc-line)" }}>
                                {option.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs cc-text-tertiary">{filteredProviders.length} perfil{filteredProviders.length === 1 ? "" : "es"}</p>
                </div>
            </section>

            {filteredProviders.length > 0 ? (
                <section className="grid gap-x-12 lg:grid-cols-2">
                    {filteredProviders.map(provider => {
                        const status = availabilityLabel(provider.availability);
                        return (
                            <Link key={provider.id} href={`/services/provider/${provider.id}`} className="group border-t py-5 sm:py-6" style={{ borderColor: "var(--cc-line)" }}>
                                <article className="flex items-center gap-4 sm:gap-5">
                                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink text-base text-copper-soft sm:h-14 sm:w-14" style={{ fontFamily: "var(--cc-font-display)" }}>
                                        {getInitials(provider.name)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <h2 className="truncate text-lg font-normal cc-text-primary sm:text-xl" style={{ fontFamily: "var(--cc-font-display)" }}>{provider.name}</h2>
                                            {provider.verified && <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />}
                                        </div>
                                        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs cc-text-tertiary">
                                            <span>{CATEGORY_LABELS[provider.category]}</span>
                                            <span className="inline-flex items-center gap-1"><Star className="h-3 w-3 text-copper" /> {provider.rating} ({provider.reviewCount})</span>
                                            <span className="inline-flex items-center gap-1" style={{ color: status.color }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: status.color }} />{status.label}</span>
                                        </p>
                                        <p className="mt-2 line-clamp-1 text-xs cc-text-secondary sm:text-sm">{(provider.specialties || []).slice(0, 3).join(" · ") || provider.bio}</p>
                                    </div>
                                    <div className="shrink-0 text-right">
                                        <p className="font-mono text-sm font-semibold text-copper sm:text-base">{provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}` : "Cotizar"}</p>
                                        {provider.hourlyRate && <p className="text-[10px] cc-text-tertiary">por hora</p>}
                                        <ArrowRight className="ml-auto mt-2 h-4 w-4 transition-transform group-hover:translate-x-1 cc-text-tertiary" />
                                    </div>
                                </article>
                            </Link>
                        );
                    })}
                </section>
            ) : (
                <EmptyState
                    icon={<Search className="h-6 w-6" />}
                    title="No encontramos perfiles con esos filtros"
                    description="Prueba con otra especialidad o vuelve a ver toda la red."
                    action={<Button variant="ghost" onClick={clearFilters}>Limpiar filtros</Button>}
                />
            )}

            <footer className="mt-10 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--cc-line-strong)" }}>
                <p className="inline-flex items-center gap-2 text-sm cc-text-secondary"><Clock3 className="h-4 w-4 text-copper" /> Solicitudes y respuestas quedan trazadas en tu comunidad.</p>
                {hasFilters && <button type="button" onClick={clearFilters} className="text-left text-sm font-semibold text-copper">Restablecer directorio</button>}
            </footer>
        </div>
    );
}
