"use client";

import { ServiceProvider } from "@/lib/types";
import { ArrowRight, BadgeCheck, Clock, Star } from "lucide-react";
import Link from "next/link";
import { getInitials } from "@/lib/utils/avatar";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
    compact?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
    plumbing: "Gasfitería",
    electrical: "Electricidad",
    locksmith: "Cerrajería",
    cleaning: "Limpieza",
    general: "Multiservicios",
};

function getAvailabilityConfig(availability: string) {
    if (availability === "available") return { tone: "var(--cc-sage)", label: "Disponible hoy" };
    if (availability === "busy") return { tone: "var(--cc-amber)", label: "Agenda ocupada" };
    return { tone: "var(--cc-rose)", label: "Sin cupos" };
}

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const availability = getAvailabilityConfig(provider.availability);
    const categoryLabel = CATEGORY_LABELS[provider.category] || provider.category;
    const headline = `${categoryLabel} para comunidades residenciales`;
    const topSpecialties = (provider.specialties || []).slice(0, compact ? 2 : 3);
    const initials = getInitials(provider.name);

    return (
        <Link href={`/services/provider/${provider.id}`} className="group block h-full">
            <article
                className="flex h-full flex-col rounded-xl border p-5 transition-transform duration-200 hover:-translate-y-0.5"
                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
            >
                <div className="flex items-start gap-3.5">
                    <div
                        className="grid shrink-0 place-items-center rounded-2xl"
                        style={{ width: 52, height: 52, background: "var(--cc-ink)", color: "var(--cc-copper-soft)", fontFamily: "var(--cc-font-display)", fontSize: 20 }}
                    >
                        {initials}
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-base font-semibold leading-tight cc-text-primary">{provider.name}</h3>
                            {provider.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--cc-sage)" }} />}
                        </div>
                        {showCategory && <p className="mt-0.5 text-xs cc-text-tertiary">{headline}</p>}
                    </div>
                </div>

                {!compact && (
                    <p className="mt-4 line-clamp-2 text-sm leading-6 cc-text-secondary">
                        {provider.bio}
                    </p>
                )}

                <div className="mt-4 flex flex-wrap gap-1.5">
                    {topSpecialties.map(specialty => (
                        <span
                            key={specialty}
                            className="rounded-full px-2.5 py-1 text-[11px]"
                            style={{ background: "var(--cc-paper-warm)", border: "1px solid var(--cc-line)", color: "var(--cc-ink-muted)" }}
                        >
                            {specialty}
                        </span>
                    ))}
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t py-3.5" style={{ borderColor: "var(--cc-line)" }}>
                    <div>
                        <p className="flex items-center gap-1 font-mono text-sm font-semibold cc-text-primary">
                            <Star className="h-3.5 w-3.5" style={{ color: "var(--cc-amber)" }} />
                            {provider.rating}
                        </p>
                        <p className="mt-1 text-[10px] cc-text-tertiary">{provider.reviewCount} reseñas</p>
                    </div>
                    <div>
                        <p className="font-mono text-sm font-semibold cc-text-primary">{provider.yearsExperience}</p>
                        <p className="mt-1 text-[10px] cc-text-tertiary">años exp.</p>
                    </div>
                    <div>
                        <p className="font-mono text-sm font-semibold cc-text-primary">{provider.completedJobs}</p>
                        <p className="mt-1 text-[10px] cc-text-tertiary">trabajos</p>
                    </div>
                </div>

                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                    <p className="flex items-center gap-1.5 text-xs cc-text-secondary">
                        <Clock className="h-3.5 w-3.5" style={{ color: "var(--cc-ink-tertiary)" }} />
                        {provider.responseTime}
                    </p>
                    <p className="font-mono text-sm font-semibold" style={{ color: "var(--cc-copper)" }}>
                        {provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}/h` : "Cotización"}
                    </p>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: availability.tone }}>
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.tone }} />
                        {availability.label}
                    </span>
                    <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium"
                        style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                    >
                        Ver perfil
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                </div>
            </article>
        </Link>
    );
}
