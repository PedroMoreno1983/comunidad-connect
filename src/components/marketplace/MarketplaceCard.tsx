"use client";

import type { MarketplaceItem } from "@/lib/types";
import { motion } from "framer-motion";
import Image from "next/image";
import { useState } from "react";

type MarketplaceCardItem = MarketplaceItem & { created_at?: string };

interface MarketplaceCardProps {
    item: MarketplaceCardItem;
    idx: number;
    onClick: (item: MarketplaceCardItem) => void;
    categoryLabel: string;
}

export function MarketplaceCard({ item, idx, onClick, categoryLabel }: MarketplaceCardProps) {
    const [imgSrc, setImgSrc] = useState(item.imageUrl || item.images?.[0] || null);

    return (
        <motion.article
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.035, duration: 0.3 }}
            onClick={() => onClick(item)}
            className="group flex cursor-pointer items-center gap-4 border-t py-5 first:border-t-0 sm:gap-6 sm:py-6"
            style={{ borderColor: "var(--cc-line)" }}
        >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden bg-paper-warm sm:h-24 sm:w-24">
                {imgSrc ? (
                    <Image
                        src={imgSrc}
                        alt={item.title}
                        fill
                        sizes="96px"
                        className="object-cover transition-transform duration-500 group-hover:scale-[1.035]"
                        onError={() => setImgSrc(null)}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center border border-dashed px-6 text-center" style={{ borderColor: "var(--cc-line-strong)" }}>
                        <p className="px-2 text-center text-[10px] leading-4 cc-text-tertiary">Sin foto</p>
                    </div>
                )}
                {item.status === "reserved" && (
                    <span className="absolute inset-x-0 bottom-0 bg-paper/90 px-2 py-1 text-center text-[9px] font-semibold uppercase tracking-[0.12em] cc-text-primary">Reservado</span>
                )}
            </div>

            <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <h3 className="text-[15px] font-semibold leading-tight cc-text-primary sm:text-base">{item.title}</h3>
                    <span className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] cc-text-tertiary">{categoryLabel}</span>
                </div>
                <p className="line-clamp-2 text-xs leading-5 cc-text-secondary sm:text-[13px]">{item.description}</p>
                <p className="mt-1 text-[11px] cc-text-tertiary">Vecino verificado · {new Date(item.created_at ?? item.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "short" })}</p>
            </div>

            <p className="shrink-0 text-right text-lg cc-text-primary sm:text-xl" style={{ fontFamily: "var(--cc-font-display)" }}>
                {item.allowSale !== false ? `$${item.price.toLocaleString("es-CL")}` : "Permuta"}
            </p>
        </motion.article>
    );
}
