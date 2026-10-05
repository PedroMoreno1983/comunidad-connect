"use client";

import { ServiceProvider } from "@/lib/types";
import Link from "next/link";
import { ProviderDataLine, ProviderPortrait } from "@/components/services/ProviderGlyph";
import {
    availabilityCopy,
    providerHeadline,
    providerPrice,
    providerProfileHref,
} from "@/components/services/providerPresentation";

interface ProviderCardProps {
    provider: ServiceProvider;
    showCategory?: boolean;
    compact?: boolean;
}

export function ProviderCard({ provider, showCategory = false, compact = false }: ProviderCardProps) {
    const price = providerPrice(provider);
    const headline = providerHeadline(provider);
    const availability = availabilityCopy(provider.availability);
    const specialty = (provider.specialties || []).filter(item => item.trim()).slice(0, compact ? 1 : 2);
    const extraLine = showCategory ? specialty.join(" · ") : "";

    return (
        <article
            className="rounded-2xl border p-4 sm:p-5"
            style={{
                borderColor: "var(--cc-line-strong)",
                background: "var(--cc-paper-warm)",
            }}
        >
            <div className="flex items-start gap-4 sm:gap-6">
                <Link href={providerProfileHref(provider.id)} className="shrink-0" aria-label={`Ver perfil de ${provider.name}`}>
                    <ProviderPortrait provider={provider} size={compact ? "compact" : "card"} />
                </Link>

                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2
                            className="text-[1.7rem] leading-none tracking-[-0.03em] cc-text-primary"
                            style={{ fontFamily: "var(--cc-font-display)", fontWeight: 520 }}
                        >
                            <Link href={providerProfileHref(provider.id)} className="hover:underline">
                                {provider.name}
                            </Link>
                        </h2>
                        {provider.verified ? (
                            <span className="text-xs italic" style={{ color: "var(--cc-sage)", fontFamily: "var(--cc-font-display)" }}>
                                verificado
                            </span>
                        ) : null}
                    </div>

                    <p className="mt-2 text-sm italic cc-text-secondary" style={{ fontFamily: "var(--cc-font-display)" }}>
                        {headline}
                    </p>
                    {extraLine ? <p className="mt-1 text-xs cc-text-tertiary">{extraLine}</p> : null}

                    <p className="mt-2 flex items-center gap-2 text-sm">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: availability.color }} />
                        <span className="cc-text-secondary">{availability.label}</span>
                        {provider.reviewCount > 0 ? (
                            <span className="cc-text-primary" style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}>
                                {provider.rating}
                                <span className="ml-1 text-xs cc-text-tertiary" style={{ fontFamily: "var(--cc-font-sans)" }}>
                                    {provider.reviewCount} reseña{provider.reviewCount === 1 ? "" : "s"}
                                </span>
                            </span>
                        ) : (
                            <span className="text-xs cc-text-tertiary">Sin reseñas todavía</span>
                        )}
                    </p>

                    <div className="mt-3">
                        <ProviderDataLine provider={provider} />
                    </div>

                    {provider.bio ? (
                        <p className="mt-3 line-clamp-2 text-sm leading-6 cc-text-secondary">{provider.bio}</p>
                    ) : null}
                </div>

                <div
                    className="hidden w-44 shrink-0 flex-col justify-center gap-4 border-l pl-6 sm:flex"
                    style={{ borderColor: "var(--cc-line)" }}
                >
                    <PriceBlock price={price} large />
                    <CardActions id={provider.id} />
                </div>
            </div>
            <div
                className="mt-4 flex items-end justify-between gap-3 border-t pt-4 sm:hidden"
                style={{ borderColor: "var(--cc-line)" }}
            >
                <PriceBlock price={price} />
                <CardActions id={provider.id} />
            </div>
        </article>
    );
}

function PriceBlock({
    price,
    large = false,
}: {
    price: ReturnType<typeof providerPrice>;
    large?: boolean;
}) {
    return (
        <div>
            {price.hasRate ? (
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] cc-text-tertiary">Desde</p>
            ) : null}
            <p
                className={`${large ? "text-[1.85rem]" : "text-2xl"} leading-none tracking-[-0.03em] cc-text-primary`}
                style={{ fontFamily: "var(--cc-font-display)", fontVariantNumeric: "lining-nums tabular-nums" }}
            >
                {price.headline}
            </p>
            <p className="mt-1 text-xs cc-text-tertiary">{price.caption}</p>
        </div>
    );
}

function CardActions({ id }: { id: string }) {
    return (
        <div className="flex w-[9.5rem] flex-col gap-2 sm:w-auto">
            <Link
                href={providerProfileHref(id, true)}
                className="inline-flex h-11 items-center justify-center rounded-xl text-sm font-semibold text-white"
                style={{ background: "var(--cc-copper)" }}
            >
                Contactar
            </Link>
            <Link
                href={providerProfileHref(id)}
                className="inline-flex h-11 items-center justify-center rounded-xl border text-sm font-semibold cc-text-primary"
                style={{ borderColor: "var(--cc-ink)", background: "transparent" }}
            >
                Ver perfil
            </Link>
        </div>
    );
}
