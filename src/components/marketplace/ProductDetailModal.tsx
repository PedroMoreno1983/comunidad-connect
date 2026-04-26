"use client";

import { MarketplaceItem } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/Dialog";
import {
    MessageCircle,
    AlertCircle,
    ShieldCheck,
    Clock,
    Repeat,
    CreditCard,
    Tag,
    Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import Image from "next/image";

interface ProductDetailModalProps {
    item: MarketplaceItem | null;
    isOpen: boolean;
    onClose: () => void;
    categoryLabel: string;
    onChat: (item: MarketplaceItem) => void;
    onBuy: (item: MarketplaceItem) => void;
}

export function ProductDetailModal({ item, isOpen, onClose, categoryLabel, onChat, onBuy }: ProductDetailModalProps) {
    const imgSrc = item?.imageUrl || (item?.images && item.images.length > 0 ? item.images[0] : null);
    const deptNumber = Array.from(item?.sellerId ?? item?.id ?? "")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900 + 100;

    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-4xl p-0 bg-surface border-none rounded-[3rem] overflow-hidden shadow-2xl">
                <div className="flex flex-col md:flex-row h-full max-h-[90vh] overflow-y-auto overflow-x-hidden">
                    {/* Left: Image Section */}
                    <div className="md:w-1/2 relative bg-elevated flex items-center justify-center p-0">
                        {(imgSrc) ? (
                            <Image
                                src={imgSrc}
                                alt={item.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover"
                            />
                        ) : (
                            <div className="w-full h-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center min-h-[300px]">
                                <AlertCircle className="h-16 w-16 text-slate-400" />
                            </div>
                        )}
                        <div className="absolute top-6 left-6">
                            <span className="px-4 py-2 bg-black/40 backdrop-blur-md rounded-2xl border border-white/20 text-white font-bold text-xs uppercase tracking-widest">
                                {categoryLabel}
                            </span>
                        </div>
                    </div>

                    {/* Right: Content Section */}
                    <div className="md:w-1/2 p-12 md:p-16 space-y-14 bg-surface overflow-y-auto">
                        <div className="space-y-12">
                            {/* Header & Verification */}
                            <div className="space-y-6">
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="flex items-center gap-2.5 text-blue-600 dark:text-blue-400 font-bold text-xs bg-blue-50/50 dark:bg-blue-500/10 w-fit px-4 py-2 rounded-2xl border border-blue-100/50 dark:border-blue-500/20 shadow-sm"
                                >
                                    <ShieldCheck className="h-4 w-4" />
                                    Artículo Verificado Comunitario • Depto {deptNumber}
                                </motion.div>
                                <DialogTitle className="text-5xl md:text-6xl font-black cc-text-primary leading-[1.05] tracking-tight">
                                    {item.title}
                                </DialogTitle>
                            </div>

                            {/* Modalities Section (Venta, Permuta, Trueque) */}
                            <div className="space-y-6">
                                <h4 className="text-[11px] font-black cc-text-tertiary uppercase tracking-[0.3em] ml-1">Modalidades de Adquisición</h4>
                                <div className="grid grid-cols-1 gap-5">
                                    {/* Venta */}
                                    {(item.allowSale !== false) && (
                                        <div className="group relative flex items-center justify-between p-6 bg-blue-50/30 dark:bg-blue-500/5 rounded-[2.5rem] border border-blue-100/30 dark:border-blue-500/10 hover:border-blue-500/30 transition-all duration-500">
                                            <div className="flex items-center gap-5">
                                                <div className="h-12 w-12 rounded-2xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center shadow-lg shadow-blue-500/10">
                                                    <Tag className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-black cc-text-primary text-lg">Venta Directa</span>
                                                    <span className="text-xs font-bold text-slate-400 uppercase">Pago inmediato seguro</span>
                                                </div>
                                            </div>
                                            <span className="text-3xl font-black text-blue-600 dark:text-blue-400">
                                                ${item.price.toLocaleString('es-CL')}
                                            </span>
                                        </div>
                                    )}

                                    {/* Permuta */}
                                    {item.allowSwap && (
                                        <div className="group p-6 bg-purple-50/30 dark:bg-purple-500/5 rounded-[2.5rem] border border-purple-100/30 dark:border-purple-500/10 hover:border-purple-500/30 transition-all duration-500 space-y-4">
                                            <div className="flex items-center gap-5">
                                                <div className="h-12 w-12 rounded-2xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center shadow-lg shadow-purple-500/10">
                                                    <Repeat className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-black cc-text-primary text-lg">Permuta (Swap)</span>
                                                    <span className="text-xs font-bold text-slate-400 uppercase">Intercambio de valor similar</span>
                                                </div>
                                            </div>
                                            <div className="pl-16">
                                                <p className="text-sm md:text-base text-purple-700/80 dark:text-purple-300/80 font-medium leading-relaxed italic">
                                                    &ldquo;{item.swapDetails || "Busco artículos de similar valor o categoría."}&rdquo;
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Trueque */}
                                    {item.allowBarter && (
                                        <div className="group p-6 bg-emerald-50/30 dark:bg-emerald-500/5 rounded-[2.5rem] border border-emerald-100/30 dark:border-emerald-500/10 hover:border-emerald-500/30 transition-all duration-500 space-y-4">
                                            <div className="flex items-center gap-5">
                                                <div className="h-12 w-12 rounded-2xl bg-success-bg flex items-center justify-center shadow-lg shadow-emerald-500/10">
                                                    <Sparkles className="h-6 w-6 text-success-fg" />
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="font-black cc-text-primary text-lg">Trueque Comunitario</span>
                                                    <span className="text-xs font-bold text-slate-400 uppercase">Abierto a ofertas creativas</span>
                                                </div>
                                            </div>
                                            <div className="pl-16">
                                                <p className="text-sm md:text-base text-emerald-700/80 dark:text-emerald-300/80 font-medium leading-relaxed italic">
                                                    &ldquo;{item.barterDetails || "Conversable por cualquier cosa de utilidad para el hogar."}&rdquo;
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Description */}
                            <div className="space-y-6">
                                <h4 className="text-[11px] font-black cc-text-tertiary uppercase tracking-[0.3em] ml-1">Descripción del Vendedor</h4>
                                <p className="text-xl cc-text-secondary leading-[1.6] font-medium pr-4">
                                    {item.description}
                                </p>
                            </div>

                            {/* Trust Badges */}
                            <div className="grid grid-cols-2 gap-6 pt-4">
                                <div className="flex flex-col gap-2 p-6 bg-elevated/30 rounded-[2rem] border border-subtle transition-colors hover:bg-elevated/50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Garantía</p>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-success-bg rounded-xl">
                                            <ShieldCheck className="h-4 w-4 text-success-fg" />
                                        </div>
                                        <span className="text-sm font-bold cc-text-secondary">Compra Segura</span>
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 p-6 bg-elevated/30 rounded-[2rem] border border-subtle transition-colors hover:bg-elevated/50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publicado en</p>
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-blue-100 dark:bg-blue-500/20 rounded-xl">
                                            <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        </div>
                                        <span className="text-sm font-bold cc-text-secondary">
                                            {new Date(item.createdAt).toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Seller & Action Footer */}
                        <div className="pt-12 border-t border-subtle space-y-8">
                            <div className="group flex items-center gap-5 p-6 bg-slate-50/50 dark:bg-slate-800/20 rounded-[2.5rem] border border-subtle hover:border-blue-500/20 transition-all duration-500">
                                <div className="relative">
                                    <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-xl shadow-blue-500/20 group-hover:rotate-3 transition-transform">
                                        V
                                    </div>
                                    <div className="absolute -bottom-1 -right-1 h-5 w-5 bg-emerald-500 border-4 border-white dark:border-slate-900 rounded-full" />
                                </div>
                                <div className="flex-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Vendedor Residente</p>
                                    <p className="text-xl font-black cc-text-primary">Valentina Rivas</p>
                                    <p className="text-xs font-bold text-slate-400 mt-0.5">⭐ 4.9 • 24 ventas completadas</p>
                                </div>
                                <div className="text-right">
                                    <span className="inline-flex px-3 py-1 bg-emerald-500/10 text-success-fg rounded-full text-[10px] font-black uppercase tracking-wider border border-emerald-500/20">
                                        Online
                                    </span>
                                </div>
                            </div>

                            <div className="flex gap-5">
                                <button
                                    onClick={() => onChat(item)}
                                    className="flex-1 h-20 bg-surface cc-text-primary font-black text-xl rounded-[2rem] border-2 border-subtle hover:border-blue-600 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95 flex items-center justify-center gap-4 shadow-xl shadow-slate-200/20 dark:shadow-none"
                                >
                                    <MessageCircle className="h-7 w-7" />
                                    Preguntar
                                </button>
                                <button
                                    onClick={() => onBuy(item)}
                                    className="flex-[1.8] h-20 bg-blue-600 hover:bg-blue-700 text-white font-black text-2xl rounded-[2rem] shadow-2xl shadow-blue-600/30 hover:shadow-blue-600/40 transition-all active:scale-95 flex items-center justify-center gap-4 disabled:opacity-50"
                                    disabled={item.status === 'reserved' || item.status === 'sold'}
                                >
                                    {item.allowSale !== false ? (
                                        <>
                                            <CreditCard className="h-7 w-7" />
                                            Comprar ahora
                                        </>
                                    ) : (
                                        <>
                                            <Repeat className="h-7 w-7" />
                                            Enviar Propuesta
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
