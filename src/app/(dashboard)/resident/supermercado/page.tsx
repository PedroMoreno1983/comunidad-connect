"use client";

import { WhatsAppChat } from "@/components/resident/supermarket/WhatsAppChat";
import { QrCode, ShoppingCart, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/Toast";

export default function SupermarketPage() {
    const [isConnected, setIsConnected] = useState(false);
    const searchParams = useSearchParams();
    const { toast } = useToast();

    useEffect(() => {
        if (searchParams.get('status') === 'success') {
            toast({
                title: "¡Compra Exitosa!",
                description: "Tu pedido ha sido procesado correctamente.",
                variant: "success"
            });
        }
    }, [searchParams, toast]);

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.3em]">Asistente de Compras</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Supermercado Express</h1>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">

                {/* Chat Container */}
                <div className="lg:col-span-2">
                    <AnimatePresence mode="wait">
                        {!isConnected ? (
                            <motion.div
                                key="connect"
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -20 }}
                                className="bg-white dark:bg-slate-900 rounded-[2.5rem] p-12 text-center border border-slate-100 dark:border-slate-800 shadow-xl space-y-8"
                            >
                                <div className="mx-auto w-20 h-20 bg-emerald-100 dark:bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-600">
                                    <QrCode className="h-10 w-10" />
                                </div>
                                <div className="space-y-2">
                                    <h2 className="text-3xl font-black text-slate-900 dark:text-white">Conecta tu WhatsApp</h2>
                                    <p className="text-slate-500 max-w-md mx-auto">
                                        Escanea este código o haz clic en &quot;Conectar&quot; para iniciar tu asistente.
                                        Podrás enviar audios y recibir tu carrito listo.
                                    </p>
                                </div>

                                <div className="py-8">
                                    <div className="w-64 h-64 mx-auto bg-slate-900 rounded-2xl flex items-center justify-center relative group cursor-pointer" onClick={() => setIsConnected(true)}>
                                        <QrCode className="h-40 w-40 text-white group-hover:opacity-50 transition-opacity" />
                                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <span className="bg-white text-slate-900 px-4 py-2 rounded-full font-bold shadow-lg">Clic para Conectar</span>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => setIsConnected(true)}
                                    className="px-8 py-4 bg-emerald-600 text-white font-black rounded-2xl hover:bg-emerald-700 transition-all shadow-lg hover:shadow-emerald-500/25"
                                >
                                    Abrir Asistente Web
                                </button>
                            </motion.div>
                        ) : (
                            <motion.div
                                key="chat"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                            >
                                <WhatsAppChat />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Instructions / Info Side */}
                <div className="space-y-8">
                    <div className="bg-emerald-600 rounded-[2.5rem] p-10 text-white relative overflow-hidden">
                        <div className="relative z-10 space-y-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-white/20 rounded-xl">
                                    <MessageCircle className="h-6 w-6 text-white" />
                                </div>
                                <h3 className="text-xl font-black">¿Cómo funciona?</h3>
                            </div>
                            <ul className="space-y-4 text-sm font-medium text-emerald-50">
                                <li className="flex gap-3">
                                    <span className="bg-white/20 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">1</span>
                                    <span>Envía un audio con tu lista de compras.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-white/20 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">2</span>
                                    <span>Nuestra IA busca los mejores precios en Jumbo y Lider.</span>
                                </li>
                                <li className="flex gap-3">
                                    <span className="bg-white/20 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0">3</span>
                                    <span>Revisas el carrito optimizado y pagas en un clic.</span>
                                </li>
                            </ul>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6">
                        <h3 className="font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <ShoppingCart className="h-5 w-5 text-blue-500" />
                            Tiendas Conectadas
                        </h3>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="font-bold text-slate-700 dark:text-slate-300">Jumbo</span>
                                <span className="text-[10px] font-black text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-1 rounded">CONECTADO</span>
                            </div>
                            <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl">
                                <span className="font-bold text-slate-700 dark:text-slate-300">Lider</span>
                                <span className="text-[10px] font-black text-emerald-500 bg-emerald-100 dark:bg-emerald-500/10 px-2 py-1 rounded">CONECTADO</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
