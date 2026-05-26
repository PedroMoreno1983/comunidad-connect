"use client";

import { MarketplaceItem } from "@/lib/types";
import { motion } from "framer-motion";
import { MessageCircle, Heart, Tag as TagIcon, Calendar, User, Search, Repeat, Sparkles, ShieldCheck } from "lucide-react";
import { Tag as CcTag } from "@/components/cc/Tag";
import Image from "next/image";
import { type ComponentType, useState } from "react";

type CategoryConfig = {
    icon: ComponentType<{ className?: string }>;
    gradient: string;
    bg: string;
};

type MarketplaceCardItem = MarketplaceItem & {
    created_at?: string;
};

interface MarketplaceCardProps {
    item: MarketplaceCardItem;
    idx: number;
    onClick: (item: MarketplaceCardItem) => void;
    categoryLabel: string;
    categoryConfig: CategoryConfig;
}

export function MarketplaceCard({ item, idx, onClick, categoryLabel, categoryConfig }: MarketplaceCardProps) {
    const Icon = categoryConfig.icon;
    const [imgSrc, setImgSrc] = useState(item.imageUrl || (item.images && item.images.length > 0 ? item.images[0] : null));
    const deptNumber = Array.from(item.sellerId ?? item.id).reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900 + 100;

    // Premium colorblocks for empty covers based on category
    const categoryColors: Record<string, string> = {
        electronics: "bg-[var(--cc-plum-tint)] text-[var(--cc-plum)]",
        furniture: "bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]",
        clothing: "bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]",
        other: "bg-[var(--cc-sage-tint)] text-[var(--cc-sage)]",
    };

    const colorblockClass = categoryColors[item.category] || "bg-[var(--cc-paper-warm)] text-[var(--cc-ink-muted)]";

    return (
        <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.4 }}
            onClick={() => onClick(item)}
            className="group relative cursor-pointer"
        >
            <div className="overflow-hidden rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] shadow-sm transition-all duration-300 group-hover:border-[var(--cc-copper)] group-hover:shadow-md">
                {/* Image Area */}
                <div className="relative aspect-[4/3] overflow-hidden bg-[var(--cc-paper-warm)]">
                    {(item.imageUrl || (item.images && item.images.length > 0)) ? (
                        <Image
                            src={imgSrc!}
                            alt={item.title || "Image"}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-500 group-hover:scale-105"
                            onError={() => {
                                setImgSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=f3efe8&color=b5664e&size=512`);
                            }}
                        />
                    ) : (
                        <div className={`flex h-full w-full items-center justify-center ${colorblockClass}`}>
                            <Icon className="h-16 w-16 opacity-75" />
                        </div>
                    )}

                    {/* Category and Status badges */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2 z-10">
                        <CcTag tone="neutral" solid className="shadow-sm">
                            <Icon className="h-3.5 w-3.5 mr-1" />
                            {categoryLabel}
                        </CcTag>
                        {item.status === 'reserved' && (
                            <CcTag tone="amber" solid className="shadow-sm">
                                RESERVADO
                            </CcTag>
                        )}
                    </div>

                    {/* Like Button */}
                    <div className="absolute right-4 top-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100 z-10">
                        <button className="rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper)] p-2.5 transition-colors hover:bg-[var(--cc-paper-warm)]">
                            <Heart className="h-4 w-4 text-[var(--cc-ink-secondary)] hover:text-[var(--cc-rose)] transition-colors" />
                        </button>
                    </div>

                    {/* Gradient Bottom Overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/40 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* View Details Hint */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10">
                        <div className="flex items-center gap-2 rounded-full bg-[var(--cc-ink)] px-5 py-2 text-xs font-semibold text-[var(--cc-paper)] shadow-md">
                            <Search className="h-4 w-4" />
                            Ver detalles
                        </div>
                    </div>

                    {/* Transaction Badges */}
                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end z-10">
                        {item.allowSale !== false && (
                            <CcTag tone="neutral" solid className="shadow-sm">
                                <TagIcon className="h-3 w-3 mr-1" />
                                VENTA
                            </CcTag>
                        )}
                        {item.allowSwap && (
                            <CcTag tone="plum" solid className="shadow-sm">
                                <Repeat className="h-3 w-3 mr-1" />
                                PERMUTA
                            </CcTag>
                        )}
                        {item.allowBarter && (
                            <CcTag tone="sage" solid className="shadow-sm">
                                <Sparkles className="h-3 w-3 mr-1" />
                                TRUEQUE
                            </CcTag>
                        )}
                        {/* Verified Resident Trust Badge */}
                        <CcTag tone="copper" solid className="shadow-sm">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            VERIFICADO
                        </CcTag>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5">
                    <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="line-clamp-1 text-base font-semibold leading-tight text-[var(--cc-ink)] transition-colors group-hover:text-[var(--cc-copper)]" style={{ fontFamily: "var(--cc-font-display)" }}>
                            {item.title}
                        </h3>
                    </div>

                    <p className="text-xs text-[var(--cc-ink-secondary)] line-clamp-2 mb-5 h-8 leading-relaxed font-medium">
                        {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-4 border-t border-[var(--cc-line)]">
                        <div className="flex flex-col">
                            <span className="text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider mb-1">
                                {item.allowSale !== false ? 'Precio' : 'Modalidad'}
                            </span>
                            <p className="text-lg font-semibold text-[var(--cc-copper)]">
                                {item.allowSale !== false
                                    ? `$${item.price.toLocaleString('es-CL')}`
                                    : 'Intercambio'}
                            </p>
                        </div>

                        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--cc-line)] bg-[var(--cc-paper-warm)] text-[var(--cc-ink-secondary)] transition-colors group-hover:bg-[var(--cc-ink)] group-hover:text-[var(--cc-paper)]">
                            <MessageCircle className="h-4.5 w-4.5" />
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4 text-[9px] font-medium text-[var(--cc-ink-tertiary)] uppercase tracking-wider">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            {new Date(item.created_at ?? item.createdAt).toLocaleDateString('es-CL')}
                        </div>
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Depto {deptNumber}
                        </div>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}
