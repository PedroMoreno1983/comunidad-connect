"use client";

import type { MarketplaceItem } from "@/lib/types";
import { motion } from "framer-motion";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { type ComponentType, useState } from "react";

type CategoryConfig = {
    icon: ComponentType<{ className?: string }>;
    gradient: string;
    bg: string;
};

type MarketplaceCardItem = MarketplaceItem & { created_at?: string };

interface MarketplaceCardProps {
    item: MarketplaceCardItem;
    idx: number;
    onClick: (item: MarketplaceCardItem) => void;
    categoryLabel: string;
    categoryConfig: CategoryConfig;
}

export function MarketplaceCard({ item, idx, onClick, categoryLabel }: MarketplaceCardProps) {
    const [imgSrc, setImgSrc] = useState(item.imageUrl || item.images?.[0] || null);

    return (
        <motion.article
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.035, duration: 0.3 }}
            onClick={() => onClick(item)}
            className="group cursor-pointer border-b pb-7"
            style={{ borderColor: "var(--cc-line)" }}
        >
            <div className="relative aspect-[4/3] overflow-hidden bg-paper-warm">
                {imgSrc ? (
                    <Image
                        src={imgSrc}
                        alt={item.title}
                        fill
                        sizes="(max-width: 767px) 100vw, 50vw"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
                        onError={() => setImgSrc(null)}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center border border-dashed px-6 text-center" style={{ borderColor: "var(--cc-line-strong)" }}>
                        <p className="max-w-44 text-xs leading-5 cc-text-tertiary">Esta publicación todavía no tiene una foto cargada por el vecino.</p>
                    </div>
                )}
                {item.status === "reserved" && (
                    <span className="absolute left-4 top-4 bg-paper px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] cc-text-primary">Reservado</span>
                )}
            </div>

            <div className="pt-4">
                <div className="mb-2 flex items-center justify-between gap-4 text-[10px] uppercase tracking-[0.14em] cc-text-tertiary">
                    <span>{categoryLabel}</span>
                    <span className="inline-flex items-center gap-1 text-copper"><ShieldCheck className="h-3 w-3" /> Vecino verificado</span>
                </div>
                <div className="flex items-start justify-between gap-5">
                    <div className="min-w-0">
                        <h3 className="text-xl font-normal leading-tight cc-text-primary sm:text-2xl" style={{ fontFamily: "var(--cc-font-display)" }}>{item.title}</h3>
                        <p className="mt-2 line-clamp-2 text-sm leading-6 cc-text-secondary">{item.description}</p>
                    </div>
                    <p className="shrink-0 text-xl cc-text-primary sm:text-2xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                        {item.allowSale !== false ? `$${item.price.toLocaleString("es-CL")}` : "Intercambio"}
                    </p>
                </div>
                <div className="mt-4 flex items-center justify-between text-xs cc-text-tertiary">
                    <span>{new Date(item.created_at ?? item.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</span>
                    <span className="inline-flex items-center gap-1.5 font-semibold text-copper">Ver detalles <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
                </div>
            </div>
        </motion.article>
    );
}
