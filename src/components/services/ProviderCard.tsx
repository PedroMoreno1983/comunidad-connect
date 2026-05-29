"use client";

/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { ServiceProvider } from "@/lib/types";
import { ArrowRight, BadgeCheck, BriefcaseBusiness, Clock, MapPin, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import { getInitials, getProviderAvatar } from "@/lib/utils/avatar";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
    compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
    plumbing: "Gasfiteria",
    electrical: "Electricidad",
    locksmith: "Cerrajeria",
    cleaning: "Limpieza",
    general: "Multiservicios",
};

function getAvailabilityConfig(availability: string) {
    if (availability === "available") {
        return {
            dot: "bg-emerald-500",
            label: "Disponible hoy",
            bg: "bg-success-bg",
            text: "text-success-fg",
        };
    }
    if (availability === "busy") {
        return {
            dot: "bg-amber-500",
            label: "Agenda ocupada",
            bg: "bg-warning-bg",
            text: "text-warning-fg",
        };
    }
    return {
        dot: "bg-red-500",
        label: "Sin cupos",
        bg: "bg-danger-bg",
        text: "text-danger-fg",
    };
}

function ProviderAvatar({ provider }: { provider: ServiceProvider }) {
    const [failed, setFailed] = useState(false);
    const initials = getInitials(provider.name);

    return (
        <div className="relative h-[76px] w-[76px] overflow-hidden rounded-2xl border-4 border-surface bg-brand-600 shadow-md">
            {!failed ? (
                <img
                    src={getProviderAvatar(provider.name, provider.photo)}
                    alt={provider.name}
                    className="h-full w-full object-cover"
                    onError={() => setFailed(true)}
                />
            ) : (
                <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,var(--cc-brand-600),var(--cc-ink))] text-xl font-bold text-white">
                    {initials}
                </div>
            )}
        </div>
    );
}

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const availability = getAvailabilityConfig(provider.availability);
    const categoryLabel = CATEGORY_LABELS[provider.category] || provider.category;
    const headline = `${categoryLabel} para comunidades residenciales`;
    const topSpecialties = (provider.specialties || []).slice(0, compact ? 2 : 3);

    return (
        <Link href={`/services/provider/${provider.id}`} className="group block h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-default bg-surface shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg">
                <div className="relative h-20 bg-[#111827]">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(181,102,78,0.82),rgba(17,24,39,0.94))]" />
                    <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/86">
                        <BriefcaseBusiness className="h-3.5 w-3.5" />
                        Red CoCo
                    </div>
                    {provider.verified && (
                        <div className="absolute right-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[11px] font-bold text-brand-700 shadow-sm">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Verificado
                        </div>
                    )}
                </div>

                <div className="relative -mt-9 px-5">
                    <ProviderAvatar provider={provider} />
                </div>

                <div className="flex flex-1 flex-col p-5 pt-3">
                    <div className="min-w-0">
                        <h3 className="text-xl font-bold leading-tight tracking-normal cc-text-primary transition-colors group-hover:text-brand-700">
                            {provider.name}
                        </h3>
                        {showCategory && (
                            <p className="mt-1 text-sm font-semibold cc-text-secondary">
                                {headline}
                            </p>
                        )}
                        <p className="mt-2 flex items-center gap-1.5 text-xs cc-text-tertiary">
                            <MapPin className="h-3.5 w-3.5" />
                            Disponible para tu condominio
                        </p>
                    </div>

                    {!compact && (
                        <p className="mt-4 line-clamp-2 text-sm leading-6 cc-text-secondary">
                            {provider.bio}
                        </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                        {topSpecialties.map(specialty => (
                            <span key={specialty} className="rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700">
                                {specialty}
                            </span>
                        ))}
                    </div>

                    <div className="mt-5 grid grid-cols-3 gap-2 border-y border-default py-4">
                        <div>
                            <p className="flex items-center gap-1 text-sm font-bold cc-text-primary">
                                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                {provider.rating}
                            </p>
                            <p className="mt-1 text-[11px] font-medium cc-text-tertiary">{provider.reviewCount} resenas</p>
                        </div>
                        <div>
                            <p className="flex items-center gap-1 text-sm font-bold cc-text-primary">
                                <TrendingUp className="h-4 w-4 text-brand-500" />
                                {provider.yearsExperience}
                            </p>
                            <p className="mt-1 text-[11px] font-medium cc-text-tertiary">anos exp.</p>
                        </div>
                        <div>
                            <p className="text-sm font-bold cc-text-primary">{provider.completedJobs}</p>
                            <p className="mt-1 text-[11px] font-medium cc-text-tertiary">trabajos</p>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-1 flex-col justify-end gap-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="flex items-center gap-2 text-sm cc-text-secondary">
                                <Clock className="h-4 w-4 text-brand-500" />
                                {provider.responseTime}
                            </p>
                            <p className="text-sm font-semibold cc-text-primary">
                                {provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}/h` : "Cotizacion"}
                            </p>
                        </div>

                        <div className="flex items-center justify-between gap-3">
                            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 ${availability.bg} ${availability.text}`}>
                                <span className={`h-2 w-2 rounded-full ${availability.dot}`} />
                                <span className="text-xs font-bold">{availability.label}</span>
                            </div>
                            <div className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-brand-700">
                                Ver perfil
                                <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                            </div>
                        </div>
                    </div>
                </div>
            </article>
        </Link>
    );
}
