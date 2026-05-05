"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, X, ChevronRight, ShieldCheck, ShoppingCart, ReceiptText } from "lucide-react";
import Link from "next/link";

export function WhatsNew() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const hasSeen = localStorage.getItem("cc_seen_v2_pro");
        if (!hasSeen) {
            const timer = setTimeout(() => setShow(true), 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const close = () => {
        localStorage.setItem("cc_seen_v2_pro", "true");
        setShow(false);
    };

    const news = [
        {
            title: "Supermercado IA",
            desc: "CoCo ahora te ayuda con listas de compras y recetas inteligentes.",
            icon: ShoppingCart,
            color: "text-emerald-600",
            bg: "bg-emerald-100",
            link: "/resident/supermercado"
        },
        {
            title: "Residentes Verificados",
            desc: "Nueva insignia de confianza en el Marketplace para mayor seguridad.",
            icon: ShieldCheck,
            color: "text-brand-600",
            bg: "bg-brand-100",
            link: "/marketplace"
        },
        {
            title: "Pagos con Boleta SII",
            desc: "Integración con Haulmer para facturación electrónica automática.",
            icon: ReceiptText,
            color: "text-rose-600",
            bg: "bg-rose-100",
            link: "/resident/finances"
        }
    ];

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 100 }}
                    className="fixed bottom-6 right-24 z-[100] w-80"
                >
                    <div className="bg-surface rounded-3xl shadow-2xl border border-indigo-100 dark:border-slate-700 overflow-hidden">
                        {/* Header */}
                        <div className="p-4 bg-gradient-to-r from-[#6D28D9] to-[#5B21B6] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-white animate-pulse" />
                                <span className="font-bold text-white text-sm">¡Novedades en v2.0 Pro!</span>
                            </div>
                            <button onClick={close} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                                <X className="h-4 w-4 text-white" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="p-4 space-y-4">
                            {news.map((item, idx) => (
                                <Link
                                    key={idx}
                                    href={item.link}
                                    onClick={close}
                                    className="flex items-start gap-3 group cursor-pointer"
                                >
                                    <div className={`p-2 rounded-xl flex-shrink-0 ${item.bg}`}>
                                        <item.icon className={`h-4 w-4 ${item.color}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h4 className="text-xs font-black cc-text-primary group-hover:text-brand-600 transition-colors">
                                            {item.title}
                                        </h4>
                                        <p className="text-[10px] cc-text-secondary leading-relaxed">
                                            {item.desc}
                                        </p>
                                    </div>
                                    <ChevronRight className="h-3 w-3 text-slate-300 group-hover:translate-x-1 transition-all mt-1" />
                                </Link>
                            ))}
                        </div>

                        <div className="p-3 bg-canvas/50 border-t border-subtle">
                            <button
                                onClick={close}
                                className="w-full py-2 bg-surface border border-subtle rounded-xl text-xs font-bold cc-text-secondary hover:bg-slate-50 transition-colors"
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
