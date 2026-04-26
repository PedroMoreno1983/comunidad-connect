"use client";

import { ServiceProvider } from "@/lib/types";
import { Star, Phone, Clock, CheckCircle, TrendingUp } from "lucide-react";
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
            <article className="h-full bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/20 dark:shadow-black/40 border border-white/50 dark:border-slate-700/50 hover:shadow-2xl hover:border-white/80 dark:hover:border-slate-600 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
                {/* Header con foto */}
                <div className="relative h-32 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800">
                    {provider.verified && (
                        <div className="absolute top-3 right-3 bg-blue-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-lg">
                            <CheckCircle className="h-3 w-3" />
                            Verificado
                        </div>
                    )}
                </div>

                {/* Foto de perfil superpuesta */}
                <div className="px-6 -mt-12 relative z-10">
                    <div className="relative w-24 h-24 rounded-full border-4 border-white dark:border-slate-800 overflow-hidden shadow-xl bg-slate-200 dark:bg-slate-700">
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
                <div className="p-6 pt-4 space-y-4 flex flex-col flex-1">
                    {/* Nombre y rating */}
                    <div>
                        <h3 className="font-bold text-lg cc-text-primary group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
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
                    <div className="mt-4 pt-4 border-t border-subtle/50">
                        <button className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white font-semibold rounded-xl shadow-[0_4px_14px_0_rgba(59,130,246,0.39)] group-hover:shadow-[0_6px_20px_rgba(59,130,246,0.23)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 flex items-center justify-center gap-2">
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
