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
            whileHover={{ y: -8, scale: 1.02 }}
            onClick={() => onClick(item)}
            className="group relative cursor-pointer"
        >
            <div className="bg-surface border border-subtle rounded-3xl shadow-md overflow-hidden transition-all duration-300 group-hover:shadow-xl group-hover:border-default">
                {/* Image Area */}
                <div className="relative aspect-[4/3] overflow-hidden bg-slate-200 dark:bg-slate-700">
                    {(item.imageUrl || (item.images && item.images.length > 0)) ? (
                        <Image
                            src={imgSrc!}
                            alt={item.title || "Image"}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            className="object-cover transition-transform duration-700 group-hover:scale-110"
                            onError={() => {
                                setImgSrc(`https://ui-avatars.com/api/?name=${encodeURIComponent(item.title)}&background=random&color=fff&size=512`);
                            }}
                        />
                    ) : (
                        <div className={`w-full h-full bg-gradient-to-br ${categoryConfig.gradient} flex items-center justify-center`}>
                            <Icon className="h-16 w-16 text-white/40" />
                        </div>
                    )}

                    {/* Glass Overlay for Category */}
                    <div className="absolute top-4 left-4 flex flex-col gap-2">
                        <Badge variant="neutral" className="shadow-lg backdrop-blur-md opacity-90">
                            <Icon className="h-3.5 w-3.5 mr-1" />
                            {categoryLabel}
                        </Badge>
                        {item.status === 'reserved' && (
                            <Badge variant="warning" className="shadow-lg p-1.5 opacity-90 backdrop-blur-md">
                                RESERVADO
                            </Badge>
                        )}
                    </div>

                    {/* Like Button */}
                    <div className="absolute top-4 right-4 translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300">
                        <button className="p-2.5 bg-white/30 dark:bg-slate-900/40 backdrop-blur-lg rounded-2xl border border-white/20 dark:border-slate-700/30 hover:bg-white/40 transition-colors">
                            <Heart className="h-4 w-4 text-white hover:text-rose-400 transition-colors" />
                        </button>
                    </div>

                    {/* Gradient Bottom Overlay */}
                    <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/60 via-black/0 to-transparent opacity-60 group-hover:opacity-80 transition-opacity" />

                    {/* View Details Hint */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                        <div className="px-4 py-2 bg-blue-600/90 backdrop-blur-md text-white rounded-xl font-bold text-sm shadow-lg flex items-center gap-2">
                            <Search className="h-4 w-4" />
                            Ver Detalles
                        </div>
                    </div>

                    {/* Transaction Badges */}
                    <div className="absolute bottom-4 right-4 flex flex-col gap-2 items-end">
                        {item.allowSale !== false && (
                            <Badge variant="info" className="shadow-lg backdrop-blur-sm opacity-95">
                                <Tag className="h-3 w-3 mr-1" />
                                VENTA
                            </Badge>
                        )}
                        {item.allowSwap && (
                            <Badge variant="conserje" className="shadow-lg backdrop-blur-sm opacity-95">
                                <Repeat className="h-3 w-3 mr-1" />
                                PERMUTA
                            </Badge>
                        )}
                        {item.allowBarter && (
                            <Badge variant="success" className="shadow-lg backdrop-blur-sm opacity-95">
                                <Sparkles className="h-3 w-3 mr-1" />
                                TRUEQUE
                            </Badge>
                        )}
                        {/* Verified Resident Trust Badge */}
                        <Badge variant="admin" className="shadow-lg backdrop-blur-sm opacity-95">
                            <ShieldCheck className="h-3 w-3 mr-1" />
                            VERIFICADO
                        </Badge>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="font-bold text-primary line-clamp-1 text-xl leading-tight group-hover:text-brand-500 transition-colors">
                            {item.title}
                        </h3>
                    </div>

                    <p className="text-sm text-secondary line-clamp-2 mb-6 h-10 leading-relaxed font-medium">
                        {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-5 border-t border-subtle/50">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-tertiary uppercase tracking-widest mb-1">
                                {item.allowSale !== false ? 'Inversión' : 'Modalidad'}
                            </span>
                            <p className="text-2xl font-black text-brand-500">
                                {item.allowSale !== false
                                    ? `$${item.price.toLocaleString('es-CL')}`
                                    : 'Intercambio'}
                            </p>
                        </div>

                        <div className="h-12 w-12 bg-brand-bg rounded-2xl border border-subtle text-brand-fg flex items-center justify-center transition-all group-hover:bg-brand-500 group-hover:text-white group-hover:shadow-md cursor-pointer">
                            <MessageCircle className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-4 text-[10px] font-black cc-text-tertiary uppercase tracking-tight">
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
