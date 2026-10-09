"use client";

import type { ProviderCardProps } from "@/lib/types";
import Link from "next/link";
import { ProfileBanner, ProviderPortrait } from "@/components/services/ProviderGlyph";
import { categoryInk } from "@/components/services/providerMarks";
import {
    availabilityCopy,
    providerHeadline,
    providerPrice,
    providerProfileHref,
} from "@/components/services/providerPresentation";

export function ProviderCard({ provider }: ProviderCardProps) {
    const price = providerPrice(provider);
    const availability = availabilityCopy(provider.availability);
    const hasReviews = provider.reviewCount > 0;

    return (
        <article
            className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border text-center"
            style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }}
        >
            <div className="h-16 shrink-0 overflow-hidden">
                <ProfileBanner ink={categoryInk(provider.category)} />
            </div>
            <div className="flex flex-1 flex-col px-4 pb-4">
                <Link
                    href={providerProfileHref(provider.id)}
                    className="-mt-8 self-center rounded-full bg-[var(--cc-paper-warm)] p-1"
                    aria-label={`Ver perfil de ${provider.name}`}
                >
                    <ProviderPortrait provider={provider} size="tile" />
                </Link>
                <h2
                    className="mt-3 line-clamp-2 break-words text-lg leading-tight tracking-[-0.03em] cc-text-primary"
                    style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}
                >
                    <Link href={providerProfileHref(provider.id)} className="hover:underline">
                        {provider.name}
                    </Link>
                </h2>
                <p
                    className="mt-1 line-clamp-2 min-h-10 text-sm italic leading-5 cc-text-secondary"
                    style={{ fontFamily: "var(--cc-font-display)" }}
                >
                    {providerHeadline(provider)}
                </p>
                <p className="mt-3 text-xs leading-5 cc-text-secondary">
                    <span className="inline-flex items-center justify-center gap-1.5">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: availability.color }} />
                        {availability.label}
                    </span>
                    {hasReviews ? (
                        <span>
                            {" · "}
                            <span className="cc-text-primary" style={{ fontVariantNumeric: "lining-nums tabular-nums" }}>
                                {provider.rating}
                            </span>
                            {` · ${provider.reviewCount} reseña${provider.reviewCount === 1 ? "" : "s"}`}
                        </span>
                    ) : null}
                </p>
                <p
                    className="mt-2 text-sm cc-text-primary"
                    style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
                >
                    {price.headline}
                    {price.hasRate ? (
                        <span className="ml-1 text-xs cc-text-tertiary" style={{ fontFamily: "var(--cc-font-sans)" }}>
                            {price.caption}
                        </span>
                    ) : null}
                </p>
                <div className="mt-auto grid gap-1 pt-4">
                    <Link
                        href={providerProfileHref(provider.id, true)}
                        className="inline-flex min-h-11 w-full items-center justify-center rounded-xl text-sm font-semibold text-white"
                        style={{ background: "var(--cc-copper)" }}
                        aria-label={`Contactar a ${provider.name}`}
                    >
                        Contactar
                    </Link>
                    <Link
                        href={providerProfileHref(provider.id)}
                        className="inline-flex min-h-9 w-full items-center justify-center text-sm font-semibold underline-offset-4 hover:underline"
                        style={{ color: "var(--cc-ink)" }}
                        aria-label={`Ver perfil completo de ${provider.name}`}
                    >
                        Ver perfil
                    </Link>
                </div>
            </div>
        </article>
    );
}
