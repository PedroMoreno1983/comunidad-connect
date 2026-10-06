"use client";

import type { ProviderCardProps } from "@/lib/types";
import Link from "next/link";
import { ProfileBanner, ProviderDataLine, ProviderPortrait } from "@/components/services/ProviderGlyph";
import { categoryInk } from "@/components/services/providerMarks";
import { availabilityCopy, providerHeadline, providerPrice, providerProfileHref } from "@/components/services/providerPresentation";

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const price = providerPrice(provider);
    const availability = availabilityCopy(provider.availability);
    const specialties = (provider.specialties || []).filter(item => item.trim()).slice(1, 2);

    return (
        <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}>
            <div className="h-24 shrink-0 overflow-hidden border-b" style={{ borderColor: "var(--cc-line)" }}>
                <ProfileBanner ink={categoryInk(provider.category)} />
            </div>
            <div className="relative flex flex-1 flex-col px-5 pb-5 text-center">
                <Link href={providerProfileHref(provider.id)} className="-mt-12 self-center rounded-full" aria-label={`Ver perfil de ${provider.name}`}>
                    <ProviderPortrait provider={provider} size={compact ? "compact" : "card"} />
                </Link>
                <h2 className="mt-3 break-words text-2xl leading-tight tracking-[-0.03em] cc-text-primary" style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}>
                    <Link href={providerProfileHref(provider.id)} className="hover:underline">{provider.name}</Link>
                </h2>
                {provider.verified ? <span className="mt-1 text-xs italic" style={{ color: "var(--cc-sage)" }}>Verificado</span> : null}
                <p className="mt-2 text-sm italic cc-text-secondary" style={{ fontFamily: "var(--cc-font-display)" }}>{providerHeadline(provider)}</p>
                {showCategory && specialties.length > 0 ? <p className="mt-1 text-xs cc-text-tertiary">{specialties.join(" · ")}</p> : null}
                <p className="mt-3 flex items-center justify-center gap-2 text-xs cc-text-secondary">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: availability.color }} />
                    {availability.label}
                </p>
                <p className="mt-1 text-xs cc-text-tertiary">
                    {provider.reviewCount > 0 ? `${provider.rating} / 5 · ${provider.reviewCount} reseña${provider.reviewCount === 1 ? "" : "s"}` : "Sin reseñas todavía"}
                </p>
                <div className="mt-3 flex justify-center"><ProviderDataLine provider={provider} /></div>
                {provider.bio ? <p className="mt-3 line-clamp-2 text-sm leading-6 cc-text-secondary">{provider.bio}</p> : null}
                <div className="mt-auto pt-5">
                    <div className="border-t pt-4" style={{ borderColor: "var(--cc-line)" }}>
                        <p className="text-2xl leading-tight cc-text-primary" style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}>{price.headline}</p>
                        <p className="mt-1 text-xs cc-text-tertiary">{price.caption}</p>
                    </div>
                    <div className="mt-4 grid gap-2">
                        <Link href={providerProfileHref(provider.id, true)} className="inline-flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: "var(--cc-copper)" }} aria-label={`Contactar a ${provider.name}`}>Contactar</Link>
                        <Link href={providerProfileHref(provider.id)} className="inline-flex min-h-11 items-center justify-center rounded-xl border text-sm font-semibold cc-text-primary" style={{ borderColor: "var(--cc-ink)" }} aria-label={`Ver perfil completo de ${provider.name}`}>Ver perfil</Link>
                    </div>
                </div>
            </div>
        </article>
    );
}
