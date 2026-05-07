"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { MarketplaceItem } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogTitle,
} from "@/components/ui/Dialog";
import {
    AlertCircle,
    Clock,
    CreditCard,
    Home,
    MessageCircle,
    Repeat,
    ShieldCheck,
    Sparkles,
    Tag,
} from "lucide-react";

interface ProductDetailModalProps {
    item: MarketplaceItem | null;
    isOpen: boolean;
    onClose: () => void;
    categoryLabel: string;
    onChat: (item: MarketplaceItem) => void;
    onBuy: (item: MarketplaceItem) => void;
}

function getDeptNumber(item: MarketplaceItem) {
    return Array.from(item.sellerId || item.id)
        .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 900 + 100;
}

function statusLabel(status: MarketplaceItem["status"]) {
    if (status === "reserved") return "Reservado";
    if (status === "sold") return "Vendido";
    if (status === "hidden") return "Oculto";
    return "Disponible";
}

export function ProductDetailModal({ item, isOpen, onClose, categoryLabel, onChat, onBuy }: ProductDetailModalProps) {
    if (!item) return null;

    const imgSrc = item.imageUrl || (item.images && item.images.length > 0 ? item.images[0] : null);
    const deptNumber = getDeptNumber(item);
    const isUnavailable = item.status === "reserved" || item.status === "sold" || item.status === "hidden";
    const publishedAt = item.createdAt
        ? new Date(item.createdAt).toLocaleDateString("es-CL", { day: "numeric", month: "long" })
        : "Fecha no disponible";

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="overflow-hidden rounded-[3rem] border-none bg-surface p-0 shadow-2xl sm:max-w-4xl">
                <div className="flex max-h-[90vh] flex-col overflow-y-auto overflow-x-hidden md:flex-row">
                    <div className="relative flex min-h-[320px] bg-elevated md:w-1/2">
                        {imgSrc ? (
                            <Image
                                src={imgSrc}
                                alt={item.title}
                                fill
                                sizes="(max-width: 768px) 100vw, 50vw"
                                className="object-cover"
                            />
                        ) : (
                            <div className="flex min-h-[320px] w-full items-center justify-center bg-elevated">
                                <AlertCircle className="h-16 w-16 text-slate-400" />
                            </div>
                        )}
                        <div className="absolute left-6 top-6 flex flex-wrap gap-2">
                            <span className="rounded-2xl border border-white/20 bg-black/40 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white backdrop-blur-md">
                                {categoryLabel}
                            </span>
                            <span className={`rounded-2xl border px-4 py-2 text-xs font-bold uppercase tracking-widest backdrop-blur-md ${
                                isUnavailable
                                    ? "border-amber-200/40 bg-amber-500/80 text-white"
                                    : "border-emerald-200/40 bg-emerald-500/80 text-white"
                            }`}>
                                {statusLabel(item.status)}
                            </span>
                        </div>
                    </div>

                    <div className="space-y-10 overflow-y-auto bg-surface p-8 md:w-1/2 md:p-12">
                        <div className="space-y-6">
                            <motion.div
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="flex w-fit items-center gap-2.5 rounded-2xl border border-blue-100/50 bg-blue-50/50 px-4 py-2 text-xs font-bold text-blue-600 shadow-sm dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-400"
                            >
                                <ShieldCheck className="h-4 w-4" />
                                Publicación comunitaria verificada · Depto {deptNumber}
                            </motion.div>
                            <DialogTitle className="text-4xl font-black leading-[1.05] tracking-tight cc-text-primary md:text-5xl">
                                {item.title}
                            </DialogTitle>
                        </div>

                        <section className="space-y-4">
                            <h3 className="ml-1 text-[11px] font-black uppercase tracking-[0.3em] cc-text-tertiary">
                                Modalidades
                            </h3>
                            <div className="grid gap-4">
                                {item.allowSale !== false && (
                                    <div className="flex items-center justify-between rounded-[2rem] border border-blue-100/30 bg-blue-50/30 p-5 dark:border-blue-500/10 dark:bg-blue-500/5">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                                                <Tag className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-black cc-text-primary">Venta directa</p>
                                                <p className="text-xs font-bold uppercase text-slate-400">Pago inmediato</p>
                                            </div>
                                        </div>
                                        <span className="text-2xl font-black text-blue-600 dark:text-blue-400">
                                            ${item.price.toLocaleString("es-CL")}
                                        </span>
                                    </div>
                                )}

                                {item.allowSwap && (
                                    <div className="space-y-3 rounded-[2rem] border border-purple-100/30 bg-purple-50/30 p-5 dark:border-purple-500/10 dark:bg-purple-500/5">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-100 text-brand-600 dark:bg-purple-500/20 dark:text-brand-400">
                                                <Repeat className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-black cc-text-primary">Permuta</p>
                                                <p className="text-xs font-bold uppercase text-slate-400">Intercambio de valor similar</p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium leading-relaxed text-purple-700/80 dark:text-brand-300/80">
                                            {item.swapDetails || "Busca artículos de valor similar o misma categoría."}
                                        </p>
                                    </div>
                                )}

                                {item.allowBarter && (
                                    <div className="space-y-3 rounded-[2rem] border border-emerald-100/30 bg-emerald-50/30 p-5 dark:border-emerald-500/10 dark:bg-emerald-500/5">
                                        <div className="flex items-center gap-4">
                                            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-success-bg text-success-fg">
                                                <Sparkles className="h-5 w-5" />
                                            </div>
                                            <div>
                                                <p className="font-black cc-text-primary">Trueque comunitario</p>
                                                <p className="text-xs font-bold uppercase text-slate-400">Abierto a ofertas creativas</p>
                                            </div>
                                        </div>
                                        <p className="text-sm font-medium leading-relaxed text-emerald-700/80 dark:text-emerald-300/80">
                                            {item.barterDetails || "Conversable por algo útil para el hogar."}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </section>

                        <section className="space-y-4">
                            <h3 className="ml-1 text-[11px] font-black uppercase tracking-[0.3em] cc-text-tertiary">
                                Descripción del vendedor
                            </h3>
                            <p className="pr-4 text-lg font-medium leading-[1.6] cc-text-secondary">
                                {item.description}
                            </p>
                        </section>

                        <section className="grid grid-cols-2 gap-4">
                            <div className="rounded-[2rem] border border-subtle bg-elevated/30 p-5">
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Confianza</p>
                                <div className="flex items-center gap-3">
                                    <div className="rounded-xl bg-success-bg p-2">
                                        <ShieldCheck className="h-4 w-4 text-success-fg" />
                                    </div>
                                    <span className="text-sm font-bold cc-text-secondary">Residente verificado</span>
                                </div>
                            </div>
                            <div className="rounded-[2rem] border border-subtle bg-elevated/30 p-5">
                                <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Publicado</p>
                                <div className="flex items-center gap-3">
                                    <div className="rounded-xl bg-blue-100 p-2 dark:bg-blue-500/20">
                                        <Clock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                    </div>
                                    <span className="text-sm font-bold cc-text-secondary">{publishedAt}</span>
                                </div>
                            </div>
                        </section>

                        <div className="space-y-6 border-t border-subtle pt-8">
                            <div className="flex items-center gap-5 rounded-[2rem] border border-subtle bg-slate-50/50 p-5 dark:bg-slate-800/20">
                                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#6D28D9] text-xl font-bold text-white shadow-xl shadow-blue-500/20">
                                    <Home className="h-6 w-6" />
                                </div>
                                <div className="flex-1">
                                    <p className="mb-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Vendedor residente</p>
                                    <p className="text-lg font-black cc-text-primary">Depto {deptNumber}</p>
                                    <p className="mt-0.5 text-xs font-bold text-slate-400">Identidad visible solo dentro de la comunidad.</p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-row">
                                <button
                                    type="button"
                                    onClick={() => onChat(item)}
                                    className="flex h-16 flex-1 items-center justify-center gap-3 rounded-[1.5rem] border-2 border-subtle bg-surface text-lg font-black cc-text-primary shadow-xl shadow-slate-200/20 transition-all hover:border-blue-600 hover:bg-elevated active:scale-95 dark:shadow-none dark:hover:border-blue-500"
                                >
                                    <MessageCircle className="h-6 w-6" />
                                    Preguntar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onBuy(item)}
                                    disabled={isUnavailable}
                                    className="flex h-16 flex-[1.5] items-center justify-center gap-3 rounded-[1.5rem] bg-blue-600 text-lg font-black text-white shadow-2xl shadow-blue-600/30 transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    {item.allowSale !== false ? (
                                        <>
                                            <CreditCard className="h-6 w-6" />
                                            Comprar ahora
                                        </>
                                    ) : (
                                        <>
                                            <Repeat className="h-6 w-6" />
                                            Enviar propuesta
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
