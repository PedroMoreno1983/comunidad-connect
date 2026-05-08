"use client";

import { MarketplaceItem } from "@/lib/types";
import { motion } from "framer-motion";
import { MessageCircle, Heart, Tag, Calendar, User, Search, Repeat, Sparkles, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
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

    return (
        <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.4 }}
            onClick={() => onClick(item)}
            className="group relative cursor-pointer"
        >
            <div className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm transition-colors group-hover:border-brand-200">
                {/* Image Area */}
                <div className="relative aspect-[4/3] overflow-hidden bg-elevated">
                    {(item.imageUrl || (item.images && item.images.length > 0)) ? (
                        <Image
                            src={imgSrc!}
                            alt={item.title || "Image"}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover"
                            onError={() => {
                                setImgSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=random&color=fff&size=512`);
                            }}
                        />
                    ) : (
                        <div className="flex h-full w-full items-center justify-center bg-elevated">
                            <Icon className="h-14 w-14 cc-text-tertiary" />
                        </div>
                    )}

                    {/* Glass Overlay for Category */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <Badge variant="neutral" className="shadow-sm opacity-95">
                            <Icon className="h-3.5 w-3.5 mr-1" />
                            {categoryLabel}
                        </Badge>
                        {item.status === 'reserved' && (
                            <Badge variant="warning" className="p-1.5 shadow-sm opacity-95">
                                RESERVADO
                            </Badge>
                        )}
                    </div>

                    {/* Like Button */}
                    <div className="absolute right-4 top-4 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                        <button className="rounded-lg border border-white/40 bg-white/80 p-2.5 transition-colors hover:bg-white">
                            <Heart className="h-4 w-4 text-slate-700 hover:text-rose-500 transition-colors" />
                        </button>
                    </div>

                    {/* Gradient Bottom Overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* View Details Hint */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2 text-sm font-bold text-white shadow-sm">
                            <Search className="h-4 w-4" />
                            Ver detalles
                        </div>
                    </div>

                    {/* Transaction Badges */}
                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
                        {item.allowSale !== false && (
                            <Badge variant="info" className="shadow-sm opacity-95">
                                <Tag className="h-3 w-3 mr-1" />
                                VENTA
                            </Badge>
                        )}
                        {item.allowSwap && (
                            <Badge variant="conserje" className="shadow-sm opacity-95">
                                <Repeat className="h-3 w-3 mr-1" />
                                PERMUTA
                            </Badge>
                        )}
                        {item.allowBarter && (
                            <Badge variant="success" className="shadow-sm opacity-95">
                                <Sparkles className="h-3 w-3 mr-1" />
                                TRUEQUE
                            </Badge>
                        )}
                        {/* Verified Resident Trust Badge */}
                        <Badge variant="admin" className="shadow-sm opacity-95">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            VERIFICADO
                        </Badge>
                    </div>
                </div>

                {/* Content */}
                <div className="p-5">
                    <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="line-clamp-1 text-lg font-bold leading-tight text-primary transition-colors group-hover:text-brand-500">
                            {item.title}
                        </h3>
                    </div>

                    <p className="text-sm text-secondary line-clamp-2 mb-6 h-10 leading-relaxed font-medium">
                        {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-5 border-t border-subtle/50">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-semibold text-tertiary uppercase tracking-widest mb-1">
                                {item.allowSale !== false ? 'Precio' : 'Modalidad'}
                            </span>
                            <p className="text-xl font-bold text-brand-500">
                                {item.allowSale !== false
                                    ? `$${item.price.toLocaleString('es-CL')}`
                                    : 'Intercambio'}
                            </p>
                        </div>

                        <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-subtle bg-brand-bg text-brand-fg transition-colors group-hover:bg-brand-500 group-hover:text-white">
                            <MessageCircle className="h-5 w-5" />
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-4 text-[10px] font-semibold cc-text-tertiary uppercase tracking-tight">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
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
