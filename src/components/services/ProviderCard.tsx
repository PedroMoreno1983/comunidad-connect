"use client";

import { ServiceProvider } from "@/lib/types";
import { Star, Clock, CheckCircle, TrendingUp } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { getProviderAvatar } from "@/lib/utils/avatar";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
}

export function ProviderCard({ provider, showCategory = false }: ProviderCardProps) {
    const getCategoryLabel = (category: string) => {
        const labels = {
            plumbing: 'Gasfitería',
            electrical: 'Electricidad',
            locksmith: 'Cerrajería',
            cleaning: 'Limpieza',
            general: 'General'
        };
        return labels[category as keyof typeof labels] || category;
    };

    const getAvailabilityConfig = (availability: string) => {
        if (availability === 'available') {
            return {
                dot: 'bg-emerald-500',
                label: 'Disponible',
                bg: 'bg-success-bg',
                text: 'text-success-fg'
            };
        }
        if (availability === 'busy') {
            return {
                dot: 'bg-amber-500',
                label: 'Ocupado',
                bg: 'bg-warning-bg',
                text: 'text-warning-fg'
            };
        }
        return {
            dot: 'bg-red-500',
            label: 'No disponible',
            bg: 'bg-danger-bg',
            text: 'text-danger-fg'
        };
    };

    const availability = getAvailabilityConfig(provider.availability);

    return (
        <Link
            href={`/services/provider/${provider.id}`}
            className="block group h-full"
        >
            <article className="flex h-full flex-col overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm transition-colors hover:border-brand-200">
                {/* Header con foto */}
                <div className="relative h-20 bg-elevated">
                    {provider.verified && (
                        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-600">
                            <CheckCircle className="h-3 w-3" />
                            Verificado
                        </div>
                    )}
                </div>

                {/* Foto de perfil superpuesta */}
                <div className="relative z-10 -mt-8 px-5">
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-subtle bg-elevated shadow-sm">
                        <Image
                            src={getProviderAvatar(provider.name, provider.photo)}
                            alt={provider.name}
                            fill
                            sizes="96px"
                            className="object-cover"
                        />
                    </div>
                </div>

                {/* Contenido */}
                <div className="flex flex-1 flex-col space-y-4 p-5 pt-4">
                    {/* Nombre y rating */}
                    <div>
                        <h3 className="text-lg font-bold cc-text-primary transition-colors group-hover:text-brand-600">
                            {provider.name}
                        </h3>
                        {showCategory && (
                            <p className="text-sm cc-text-secondary mt-0.5">
                                {getCategoryLabel(provider.category)}
                            </p>
                        )}
                        <div className="flex items-center gap-2 mt-1.5">
                            <div className="flex items-center gap-1 text-amber-500">
                                <Star className="h-4 w-4 fill-current" />
                                <span className="font-semibold cc-text-primary">{provider.rating}</span>
                            </div>
                            <span className="text-sm cc-text-tertiary">
                                ({provider.reviewCount} {provider.reviewCount === 1 ? 'reseña' : 'reseñas'})
                            </span>
                        </div>
                    </div>

                    {/* Info rápida */}
                    <div className="space-y-2 text-sm flex-1">
                        <div className="flex items-center gap-2 cc-text-secondary">
                            <TrendingUp className="h-4 w-4 text-slate-400" />
                            <span>{provider.yearsExperience} años de experiencia</span>
                        </div>
                        <div className="flex items-center gap-2 cc-text-secondary">
                            <Clock className="h-4 w-4 text-slate-400" />
                            <span>Responde en {provider.responseTime}</span>
                        </div>
                        {provider.hourlyRate && (
                            <div className="flex items-center gap-2 font-semibold cc-text-primary mt-3">
                                <span className="text-xl">${provider.hourlyRate.toLocaleString('es-CL')}</span>
                                <span className="text-sm font-normal cc-text-secondary">/hora</span>
                            </div>
                        )}
                    </div>

                    {/* Disponibilidad */}
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full w-max ${availability.bg} ${availability.text}`}>
                        <span className={`h-2 w-2 rounded-full ${availability.dot} animate-pulse`}></span>
                        <span className="text-xs font-medium">{availability.label}</span>
                    </div>

                    {/* Botón de acción */}
                    <div className="mt-4 border-t border-subtle/50 pt-4">
                        <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-brand-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                            Ver Perfil
                            <svg className="h-4 w-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                    </div>
                </div>
            </article>
        </Link>
    );
}
