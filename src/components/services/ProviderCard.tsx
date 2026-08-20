"use client";

/* eslint-disable @next/next/no-img-element */
import { ServiceProvider } from "@/lib/types";
import { ArrowRight, BadgeCheck, Star } from "lucide-react";
import Link from "next/link";
import { getInitials } from "@/lib/utils/avatar";
import { getCategoryVisual } from "@/components/services/categoryVisuals";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
    compact?: boolean;
}

function getAvailabilityConfig(availability: string) {
    if (availability === "available") return { tone: "var(--cc-sage)", label: "Disponible hoy" };
    if (availability === "busy") return { tone: "var(--cc-amber)", label: "Agenda ocupada" };
    return { tone: "var(--cc-rose)", label: "Sin cupos" };
}

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const availability = getAvailabilityConfig(provider.availability);
    const visual = getCategoryVisual(provider.category);
    const topSpecialties = (provider.specialties || []).slice(0, compact ? 2 : 3);

    return (
        <Link href={`/services/provider/${provider.id}`} className="group block h-full">
            <article
                className="flex h-full flex-col rounded-2xl border p-5 shadow-sm transition-shadow hover:shadow-md"
                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
            >
                <div className="flex items-start gap-4">
                    <div className="relative shrink-0">
                        {provider.photo ? (
                            <img
                                src={provider.photo}
                                alt={provider.name}
                                className="h-20 w-20 rounded-2xl object-cover"
                            />
                        ) : (
                            <div
                                className="grid h-20 w-20 place-items-center rounded-2xl text-2xl text-white"
                                style={{ background: visual.gradient, fontFamily: "var(--cc-font-display)" }}
                            >
                                {getInitials(provider.name)}
                            </div>
                        )}
                        <span
                            className="absolute -bottom-1.5 -right-1.5 h-4 w-4 rounded-full ring-2"
                            style={{ background: availability.tone, ["--tw-ring-color" as string]: "var(--cc-paper)" }}
                            title={availability.label}
                        />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <h3 className="truncate text-base font-bold cc-text-primary">{provider.name}</h3>
                            {provider.verified && <BadgeCheck className="h-4 w-4 shrink-0" style={{ color: "var(--cc-sage)" }} />}
                        </div>
                        <p className="mt-1 flex items-center gap-1 text-xs cc-text-secondary">
                            {provider.reviewCount > 0 ? (
                                <>
                                    <Star className="h-3.5 w-3.5" style={{ color: "var(--cc-amber)", fill: "var(--cc-amber)" }} />
                                    <strong className="cc-text-primary">{provider.rating}</strong>
                                    <span className="cc-text-tertiary">({provider.reviewCount})</span>
                                </>
                            ) : (
                                <>
                                    <Star className="h-3.5 w-3.5" style={{ color: "var(--cc-amber)" }} />
                                    <span className="cc-text-tertiary">Nuevo en la red</span>
                                </>
                            )}
                        </p>
                        {showCategory && (
                            <span
                                className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold"
                                style={{ background: visual.soft, color: visual.accent }}
                            >
                                <visual.Icon className="h-3 w-3" />
                                {visual.label}
                            </span>
                        )}
                    </div>
                </div>

                {!compact && topSpecialties.length > 0 && (
                    <p className="mt-4 line-clamp-1 text-sm cc-text-secondary">
                        <strong className="cc-text-primary">Especialidades:</strong> {topSpecialties.join(" · ")}
                    </p>
                )}

                <div
                    className="mt-auto flex items-center justify-between gap-3 border-t pt-4"
                    style={{ borderColor: "var(--cc-line)" }}
                >
                    <div>
                        <p className="text-lg font-bold cc-text-primary">
                            {provider.hourlyRate ? `$${provider.hourlyRate.toLocaleString("es-CL")}` : "Cotiza"}
                        </p>
                        <p className="text-[11px] cc-text-tertiary">{provider.hourlyRate ? "por hora" : "sin tarifa fija"}</p>
                    </div>
                    <span
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition group-hover:opacity-90"
                        style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}
                    >
                        Ver perfil
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                    </span>
                </div>
            </article>
        </Link>
    );
}
