"use client";

import { ServiceProvider } from "@/lib/types";
import { ArrowRight, BadgeCheck, Clock, Star, TrendingUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getProviderAvatar } from "@/lib/utils/avatar";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
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
            label: "Disponible",
            bg: "bg-success-bg",
            text: "text-success-fg",
        };
    }
    if (availability === "busy") {
        return {
            dot: "bg-amber-500",
            label: "Ocupado",
            bg: "bg-warning-bg",
            text: "text-warning-fg",
        };
    }
    return {
        dot: "bg-red-500",
        label: "No disponible",
        bg: "bg-danger-bg",
        text: "text-danger-fg",
    };
}

export function ProviderCard({ provider, showCategory = false }: ProviderCardProps) {
    const availability = getAvailabilityConfig(provider.availability);

    return (
        <Link href={`/services/provider/${provider.id}`} className="group block h-full">
            <article className="flex h-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm transition-colors hover:border-brand-200">
                <div className="relative h-24 bg-elevated">
                    <div className="absolute inset-x-0 bottom-0 h-px bg-slate-200 dark:bg-slate-800" />
                    {provider.verified && (
                        <div className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-600">
                            <BadgeCheck className="h-3.5 w-3.5" />
                            Verificado
                        </div>
                    )}
                </div>

                <div className="relative z-10 -mt-8 px-5">
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-subtle bg-elevated shadow-sm">
                        <Image
                            src={getProviderAvatar(provider.name, provider.photo)}
                            alt={provider.name}
                            fill
                            sizes="64px"
                            className="object-cover"
                        />
                    </div>
                </div>

                <div className="flex flex-1 flex-col p-5 pt-4">
                    <div className="min-w-0">
                        <h3 className="line-clamp-2 text-lg font-semibold leading-snug cc-text-primary transition-colors group-hover:text-brand-600">
                            {provider.name}
                        </h3>
                        {showCategory && (
                            <p className="mt-1 text-sm cc-text-secondary">
                                {CATEGORY_LABELS[provider.category] || provider.category}
                            </p>
                        )}
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 border-y border-subtle py-4">
                        <div>
                            <p className="flex items-center gap-1.5 text-sm font-semibold cc-text-primary">
                                <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                                {provider.rating}
                            </p>
                            <p className="mt-1 text-[11px] font-medium cc-text-tertiary">
                                {provider.reviewCount} resenas
                            </p>
                        </div>
                        <div>
                            <p className="flex items-center gap-1.5 text-sm font-semibold cc-text-primary">
                                <TrendingUp className="h-4 w-4 text-slate-400" />
                                {provider.yearsExperience} anos
                            </p>
                            <p className="mt-1 text-[11px] font-medium cc-text-tertiary">Experiencia</p>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-1 flex-col gap-3">
                        <p className="flex items-center gap-2 text-sm cc-text-secondary">
                            <Clock className="h-4 w-4 text-slate-400" />
                            Responde en {provider.responseTime}
                        </p>
                        {provider.hourlyRate ? (
                            <p className="text-sm cc-text-secondary">
                                Desde <span className="font-semibold cc-text-primary">${provider.hourlyRate.toLocaleString("es-CL")}</span> / hora
                            </p>
                        ) : (
                            <p className="text-sm cc-text-secondary">Cotizacion segun visita</p>
                        )}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                        <div className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 ${availability.bg} ${availability.text}`}>
                            <span className={`h-2 w-2 rounded-full ${availability.dot}`} />
                            <span className="text-xs font-semibold">{availability.label}</span>
                        </div>
                        <div className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-600">
                            <span className="min-w-[40px]">Perfil</span>
                            <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" />
                        </div>
                    </div>
                </div>
            </article>
        </Link>
    );
}
