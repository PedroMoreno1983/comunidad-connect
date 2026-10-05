"use client";

/* eslint-disable @next/next/no-img-element */
import { ServiceProvider } from "@/lib/types";
import { BadgeCheck, Star } from "lucide-react";
import Link from "next/link";
import { getInitials } from "@/lib/utils/avatar";
import { getCategoryVisual } from "@/components/services/categoryVisuals";
import {
    providerChips,
    providerPrice,
    providerProfileHref,
} from "@/components/services/providerPresentation";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
    compact?: boolean;
}

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const visual = getCategoryVisual(provider.category);
    const price = providerPrice(provider);
    const chips = providerChips(provider);
    const specialty = (provider.specialties || []).slice(0, compact ? 2 : 3);
    const specialtyLine = [showCategory || specialty.length === 0 ? visual.label : null, ...specialty]
        .filter(Boolean)
        .join(" · ");
    const photoClass = compact
        ? "h-24 w-24 rounded-2xl sm:h-28 sm:w-28"
        : "h-28 w-28 rounded-2xl sm:h-[9.5rem] sm:w-[9.5rem]";

    return (
        <article
            className="rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(26,22,17,0.04),0_12px_32px_-20px_rgba(26,22,17,0.35)] sm:p-5"
            style={{ borderColor: "var(--cc-line)" }}
        >
            <div className="flex items-start gap-4 sm:gap-6">
                <Link href={providerProfileHref(provider.id)} className="shrink-0" aria-label={`Ver perfil de ${provider.name}`}>
                    {provider.photo ? (
                        <img src={provider.photo} alt="" className={`${photoClass} object-cover`} />
                    ) : (
                        <div
                            className={`grid place-items-center text-3xl text-white ${photoClass}`}
                            style={{ background: visual.gradient, fontFamily: "var(--cc-font-display)" }}
                        >
                            {getInitials(provider.name)}
                        </div>
                    )}
                </Link>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2
                            className="text-[1.65rem] leading-none tracking-[-0.03em] cc-text-primary"
                            style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}
                        >
                            <Link href={providerProfileHref(provider.id)} className="hover:underline">
                                {provider.name}
                            </Link>
                        </h2>
                        {provider.verified && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: "var(--cc-sage)" }}>
                                <BadgeCheck className="h-4 w-4" aria-hidden />
                                Verificado
                            </span>
                        )}
                    </div>

                    {specialtyLine && (
                        <p className="mt-2 text-sm cc-text-secondary">{specialtyLine}</p>
                    )}

                    <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
                        <Star className="h-4 w-4" style={{ color: "var(--cc-amber)", fill: provider.reviewCount > 0 ? "var(--cc-amber)" : "transparent" }} />
                        {provider.reviewCount > 0 ? (
                            <>
                                <strong className="cc-text-primary">{provider.rating}</strong>
                                <span className="cc-text-tertiary">
                                    {provider.reviewCount} reseña{provider.reviewCount === 1 ? "" : "s"}
                                </span>
                            </>
                        ) : (
                            <span className="cc-text-tertiary">Sin reseñas todavía</span>
                        )}
                    </p>

                    {provider.bio ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 cc-text-secondary">{provider.bio}</p>
                    ) : null}

                    {chips.length > 0 && (
                        <ul className="mt-3 flex flex-wrap gap-2">
                            {chips.map(chip => (
                                <li
                                    key={chip}
                                    className="rounded-full border px-3 py-1 text-xs font-medium cc-text-secondary"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                                >
                                    {chip}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                <div
                    className="hidden w-48 shrink-0 flex-col justify-center gap-4 border-l pl-6 sm:flex"
                    style={{ borderColor: "var(--cc-line)" }}
                >
                    <div>
                        {price.hasRate ? (
                            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Desde</p>
                        ) : null}
                        <p
                            className="text-[1.85rem] leading-none tracking-[-0.03em] cc-text-primary"
                            style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                        >
                            {price.headline}
                        </p>
                        <p className="mt-1 text-xs cc-text-tertiary">{price.caption}</p>
                    </div>
                    <div className="flex w-[9.5rem] flex-col gap-2 sm:w-auto">
                        <Link
                            href={providerProfileHref(provider.id, true)}
                            className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                            style={{ background: "var(--cc-copper)" }}
                        >
                            Contactar
                        </Link>
                        <Link
                            href={providerProfileHref(provider.id)}
                            className="inline-flex h-11 items-center justify-center rounded-xl border text-sm font-semibold cc-text-primary"
                            style={{ borderColor: "var(--cc-line-strong)", background: "#fff" }}
                        >
                            Ver perfil
                        </Link>
                    </div>
                </div>
            </div>
            <div
                className="mt-4 flex items-end justify-between gap-3 border-t pt-4 sm:hidden"
                style={{ borderColor: "var(--cc-line)" }}
            >
                <div>
                    {price.hasRate ? (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Desde</p>
                    ) : null}
                    <p
                        className="text-2xl leading-none tracking-[-0.03em] cc-text-primary"
                        style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                    >
                        {price.headline}
                    </p>
                    <p className="mt-1 text-xs cc-text-tertiary">{price.caption}</p>
                </div>
                <div className="flex w-[9.5rem] flex-col gap-2">
                    <Link
                        href={providerProfileHref(provider.id, true)}
                        className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                        style={{ background: "var(--cc-copper)" }}
                    >
                        Contactar
                    </Link>
                    <Link
                        href={providerProfileHref(provider.id)}
                        className="inline-flex h-11 items-center justify-center rounded-xl border text-sm font-semibold cc-text-primary"
                        style={{ borderColor: "var(--cc-line-strong)", background: "#fff" }}
                    >
                        Ver perfil
                    </Link>
                </div>
            </div>
        </article>
    );
}
