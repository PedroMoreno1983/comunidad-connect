"use client";

import { useState } from "react";
import { MarketplaceItem } from "@/lib/types";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { CreditCard, ShieldCheck, Lock, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PaymentModalProps {
    item: MarketplaceItem | null;
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function PaymentModal({ item, isOpen, onClose, onSuccess }: PaymentModalProps) {
    const [step, setStep] = useState<'checkout' | 'processing' | 'success'>('checkout');

    const handlePayment = () => {
        setStep('processing');
        setTimeout(() => {
            setStep('success');
        }, 2500);
    };

    if (!item) return null;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md p-8 overflow-hidden rounded-[3rem] border-none shadow-2xl bg-white dark:bg-slate-950">
                <AnimatePresence mode="wait">
                    {step === 'checkout' && (
                        <motion.div
                            key="checkout"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-6"
                        >
                            <DialogHeader>
                                <DialogTitle className="text-2xl font-black">Finalizar Compra</DialogTitle>
                                <DialogDescription className="font-semibold">
                                    Estás a un paso de obtener tu nuevo artículo.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="p-6 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Producto</span>
                                    <span className="font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{item.title}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-slate-500 uppercase tracking-widest">Precio</span>
                                    <span className="text-xl font-black text-blue-600 dark:text-blue-400">${item.price.toLocaleString('es-CL')}</span>
                                </div>
                                <div className="pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                                    <span className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest">Total</span>
                                    <span className="text-2xl font-black text-slate-900 dark:text-white">${item.price.toLocaleString('es-CL')}</span>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="p-4 rounded-2xl border-2 border-blue-600 bg-blue-50 dark:bg-blue-500/10 flex items-center gap-4">
                                    <CreditCard className="h-6 w-6 text-blue-600" />
                                    <div className="flex-1">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">Tarjeta de Crédito / Débito</p>
                                        <p className="text-xs text-slate-500 font-medium">Transacción segura de ComunidadConnect</p>
                                    </div>
                                    <CheckCircle2 className="h-5 w-5 text-blue-600" />
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest justify-center">
                                <Lock className="h-3 w-3" />
                                Encriptación SSL de 256 bits
                            </div>

                            <Button
                                onClick={handlePayment}
                                className="w-full h-16 rounded-2xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-black text-xl shadow-xl shadow-blue-500/10 transition-all active:scale-95"
                            >
                                Confirmar Pago
                            </Button>
                        </motion.div>
                    )}

                    {step === 'processing' && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="py-12 flex flex-col items-center justify-center space-y-6"
                        >
                            <div className="relative">
                                <div className="h-20 w-20 rounded-full border-4 border-slate-100 border-t-blue-600 animate-spin" />
                                <ShieldCheck className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-8 text-blue-600" />
                            </div>
                            <div className="text-center">
                                <DialogTitle className="text-xl font-black text-slate-900 dark:text-white">Procesando Pago Seguro</DialogTitle>
                                <p className="text-sm text-slate-500 font-medium">Por favor, no cierres esta ventana...</p>
                            </div>
                        </motion.div>
                    )}

                    {step === 'success' && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="py-8 flex flex-col items-center justify-center text-center space-y-6"
                        >
                            <div className="h-24 w-24 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
                                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                            </div>
                            <div className="space-y-2">
                                <DialogTitle className="text-3xl font-black text-slate-900 dark:text-white">¡Pago Exitoso!</DialogTitle>
                                <p className="text-slate-500 font-medium max-w-[250px] mx-auto">
                                    Has comprado **{item.title}**. El vendedor ha sido notificado y el artículo ha sido reservado para ti.
                                </p>
                            </div>
                            <Button
                                onClick={() => {
                                    onSuccess();
                                    onClose();
                                }}
                                className="w-full h-14 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-black"
                            >
                                Volver al Marketplace
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </DialogContent>
        </Dialog>
    );
}
