"use client";

import { MarketplaceItem } from "@/lib/types";
import { motion } from "framer-motion";
import { MessageCircle, Heart, Tag, Calendar, User, Search, Repeat, Sparkles } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

interface MarketplaceCardProps {
    item: MarketplaceItem;
    idx: number;
    onClick: (item: MarketplaceItem) => void;
    categoryLabel: string;
    categoryConfig: any;
}

export function MarketplaceCard({ item, idx, onClick, categoryLabel, categoryConfig }: MarketplaceCardProps) {
    const Icon = categoryConfig.icon;
    const [imgSrc, setImgSrc] = useState(item.imageUrl || (item.images && item.images.length > 0 ? item.images[0] : null));

    return (
        <motion.article
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.05, duration: 0.4 }}
            whileHover={{ y: -8, scale: 1.02 }}
            onClick={() => onClick(item)}
            className="group relative cursor-pointer"
        >
            <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-white/20 dark:border-slate-700/30 overflow-hidden transition-all duration-300 group-hover:shadow-2xl group-hover:shadow-blue-500/10 group-hover:border-blue-500/30">
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
                        <div className="px-3 py-1.5 bg-white/20 dark:bg-slate-900/40 backdrop-blur-md rounded-full border border-white/20 dark:border-slate-700/30 flex items-center gap-1.5 shadow-sm">
                            <Icon className="h-3.5 w-3.5 text-white" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-white">
                                {categoryLabel}
                            </span>
                        </div>
                        {item.status === 'reserved' && (
                            <div className="px-3 py-1.5 bg-amber-500/90 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg">
                                <span className="text-[10px] font-black uppercase tracking-wider text-white">
                                    Reservado
                                </span>
                            </div>
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
                            <div className="px-3 py-1.5 bg-blue-500/90 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg shadow-blue-500/20">
                                <Tag className="h-3 w-3 text-white" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-white">Venta</span>
                            </div>
                        )}
                        {item.allowSwap && (
                            <div className="px-3 py-1.5 bg-purple-500/90 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg shadow-purple-500/20">
                                <Repeat className="h-3 w-3 text-white" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-white">Permuta</span>
                            </div>
                        )}
                        {item.allowBarter && (
                            <div className="px-3 py-1.5 bg-emerald-500/90 backdrop-blur-md rounded-full border border-white/20 flex items-center gap-1.5 shadow-lg shadow-emerald-500/20">
                                <Sparkles className="h-3 w-3 text-white" />
                                <span className="text-[9px] font-black uppercase tracking-wider text-white">Trueque</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="p-6">
                    <div className="flex justify-between items-start gap-2 mb-3">
                        <h3 className="font-bold text-slate-900 dark:text-white line-clamp-1 text-xl leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                            {item.title}
                        </h3>
                    </div>

                    <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-6 h-10 leading-relaxed font-medium">
                        {item.description}
                    </p>

                    <div className="flex items-center justify-between pt-5 border-t border-slate-100 dark:border-slate-700/50">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                                {item.allowSale !== false ? 'Inversión' : 'Modalidad'}
                            </span>
                            <p className="text-2xl font-black bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                                {item.allowSale !== false
                                    ? `$${item.price.toLocaleString('es-CL')}`
                                    : 'Intercambio'}
                            </p>
                        </div>

                        <div className="h-12 w-12 bg-blue-50 dark:bg-blue-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center transition-all group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 group-hover:shadow-lg group-hover:shadow-blue-500/20">
                            <MessageCircle className="h-6 w-6" />
                        </div>
                    </div>

                    <div className="mt-5 flex items-center gap-4 text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-tight">
                        <div className="flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5" />
                            {new Date((item as any).created_at || item.createdAt).toLocaleDateString('es-CL')}
                        </div>
                        <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            Depto {Math.floor(Math.random() * 900) + 100}
                        </div>
                    </div>
                </div>
            </div>
        </motion.article>
    );
}
