"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { CheckCircle2, AlertCircle, ShieldCheck, CreditCard, Building2, Loader2, ArrowLeft } from "lucide-react";
import { useState, Suspense, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

function MockPaymentContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');

    const ref = searchParams.get('ref') || `CC-${Math.floor(Math.random() * 1000000)}`;
    const amount = searchParams.get('amount') || '0';
    const callback = searchParams.get('callback') || '/home';

    // Para un efecto visual de tarjeta rotando
    const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

    const handleMouseMove = (e: React.MouseEvent) => {
        const { currentTarget, clientX, clientY } = e;
        const { left, top, width, height } = currentTarget.getBoundingClientRect();
        const x = (clientX - left - width / 2) / 20;
        const y = -(clientY - top - height / 2) / 20;
        setMousePos({ x, y });
    };

    const handleSimulatePayment = async (success: boolean) => {
        setStatus('processing');
        setLoading(true);
        
        // Timeout para dar tiempo a la animación de carga "Procesando pago seguro..."
        await new Promise(r => setTimeout(r, 2000));

        try {
            if (success) {
                // Simular webhook local llamando a nuestro endpoint
                await fetch('/api/webhooks/haulmer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'payment.success',
                        data: {
                            id: `mock_tx_${Math.floor(Math.random() * 10000)}`,
                            status: 'paid',
                            payment_id: ref,
                            amount: Number(amount)
                        }
                    })
                });
                
                setStatus('success');
            } else {
                setStatus('error');
            }

            // Simular cierre de popup y regreso después del éxito/error visual
            setTimeout(() => {
                router.push(callback + "?payment_status=" + (success ? 'success' : 'failed'));
            }, 2500);

        } catch (e) {
            console.error(e);
            setStatus('error');
            setTimeout(() => {
                router.push(callback + "?payment_status=failed");
            }, 2500);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-8 font-sans overflow-hidden relative">
            {/* Background Decorativo */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 dark:bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-indigo-500/10 dark:bg-indigo-500/5 rounded-full blur-3xl pointer-events-none" />

            <motion.div 
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 100, damping: 20 }}
                className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-0 bg-white/60 dark:bg-slate-900/60 backdrop-blur-2xl border border-white/80 dark:border-slate-800 rounded-[2.5rem] shadow-2xl relative z-10 overflow-hidden"
            >
                {/* Columna Izquierda: Detalle del Pago */}
                <div className="p-8 md:p-12 lg:pr-16 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-100 dark:border-slate-800">
                    <div>
                        <button onClick={() => router.push(callback)} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors mb-12">
                            <ArrowLeft className="w-4 h-4" /> Volver al portal
                        </button>

                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-3 bg-indigo-50 dark:bg-indigo-500/10 rounded-2xl">
                                <Building2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">ComunidadConnect</h2>
                        </div>

                        <p className="text-sm font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-2">Total a Pagar</p>
                        <div className="text-5xl lg:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 tracking-tighter mb-8">
                            ${Number(amount).toLocaleString('es-CL')}
                        </div>

                        <div className="space-y-4">
                            <div className="flex justify-between items-center py-4 border-b border-slate-100 dark:border-slate-800/50">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Detalle</span>
                                <span className="font-bold text-slate-900 dark:text-white">Gastos Comunes</span>
                            </div>
                            <div className="flex justify-between items-center py-4 border-b border-slate-100 dark:border-slate-800/50">
                                <span className="font-semibold text-slate-600 dark:text-slate-300">Referencia</span>
                                <span className="font-mono text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-slate-600 dark:text-slate-300">{ref}</span>
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 flex items-center justify-between opacity-60">
                        <span className="text-xs font-bold text-slate-400">Desarrollado para testing local</span>
                        <div className="flex gap-1">
                             <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                             <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                             <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700" />
                        </div>
                    </div>
                </div>

                {/* Columna Derecha: Tarjeta UI / Haulmer Mock */}
                <div 
                    className="p-8 md:p-12 lg:pl-16 bg-slate-50/50 dark:bg-slate-950/50 flex flex-col justify-center relative perspective-[1000px]"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setMousePos({ x: 0, y: 0 })}
                >
                    <AnimatePresence mode="wait">
                        {status === 'idle' && (
                            <motion.div 
                                key="idle"
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                className="w-full max-w-sm mx-auto"
                            >
                                <div className="text-center mb-8">
                                    <div className="inline-flex items-center justify-center p-3 bg-[#1b4382]/10 rounded-2xl mb-4">
                                        <ShieldCheck className="w-8 h-8 text-[#1b4382] dark:text-blue-400" />
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">Haulmer Sandbox</h3>
                                    <p className="text-sm text-slate-500 font-medium mt-1">Simula una transacción segura</p>
                                </div>

                                {/* Tarjeta 3D interactiva */}
                                <motion.div 
                                    className="w-full h-48 bg-gradient-to-tr from-slate-900 to-slate-700 rounded-2xl shadow-2xl p-6 text-white mb-10 relative overflow-hidden"
                                    animate={{ rotateX: mousePos.y, rotateY: mousePos.x }}
                                    transition={{ type: "spring", stiffness: 150, damping: 15, mass: 0.5 }}
                                >
                                    <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl translate-x-10 -translate-y-10" />
                                    <div className="flex justify-between items-center mb-10 relative z-10">
                                        <CreditCard className="w-8 h-8 opacity-80" />
                                        <div className="text-xs font-black uppercase tracking-widest opacity-60">Mock Card</div>
                                    </div>
                                    <div className="text-xl font-mono tracking-[0.2em] opacity-90 mb-2 relative z-10">
                                        •••• •••• •••• 4242
                                    </div>
                                    <div className="flex justify-between text-xs font-mono opacity-60 relative z-10">
                                        <span>User Test</span>
                                        <span>12/28</span>
                                    </div>
                                </motion.div>

                                <div className="space-y-4 relative z-20">
                                    <Button
                                        className="w-full h-14 bg-[#1b4382] hover:bg-[#133060] font-bold text-white shadow-lg shadow-[#1b4382]/20 rounded-xl text-lg transition-transform active:scale-[0.98]"
                                        onClick={() => handleSimulatePayment(true)}
                                    >
                                        Pagar Exitosamente
                                    </Button>
                                    <button
                                        className="w-full h-14 bg-transparent border-2 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-bold rounded-xl text-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors active:scale-[0.98]"
                                        onClick={() => handleSimulatePayment(false)}
                                    >
                                        Simular Pago Fallido
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {status === 'processing' && (
                            <motion.div 
                                key="processing"
                                initial={{ opacity: 0, scale: 0.9 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.9 }}
                                className="flex flex-col items-center justify-center h-full min-h-[400px]"
                            >
                                <div className="relative">
                                    <div className="absolute inset-0 bg-[#1b4382]/20 blur-xl rounded-full animate-pulse" />
                                    <Loader2 className="w-16 h-16 text-[#1b4382] dark:text-blue-400 animate-spin relative z-10" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white mt-8 mb-2">Procesando Pago Seguro...</h3>
                                <p className="text-slate-500 font-medium">Conectando con Haulmer via API</p>
                            </motion.div>
                        )}

                        {status === 'success' && (
                            <motion.div 
                                key="success"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: "spring", stiffness: 150, damping: 15 }}
                                className="flex flex-col items-center justify-center h-full min-h-[400px] text-emerald-500"
                            >
                                <div className="w-24 h-24 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-emerald-500/20">
                                    <CheckCircle2 className="w-12 h-12" />
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">¡Pago Aprobado!</h3>
                                <p className="text-slate-500 font-bold">Redirigiendo de vuelta a la comunidad...</p>
                            </motion.div>
                        )}

                        {status === 'error' && (
                            <motion.div 
                                key="error"
                                initial={{ opacity: 0, scale: 0.5 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ type: "spring", stiffness: 150, damping: 15 }}
                                className="flex flex-col items-center justify-center h-full min-h-[400px] text-rose-500"
                            >
                                <div className="w-24 h-24 bg-rose-100 dark:bg-rose-500/20 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-rose-500/20">
                                    <AlertCircle className="w-12 h-12" />
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white mb-2">Pago Rechazado</h3>
                                <p className="text-slate-500 font-bold">La tarjeta fue declinada en el ambiente local</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}

export default function MockPaymentPage() {
    return (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-50"><Loader2 className="w-12 h-12 animate-spin text-slate-400" /></div>}>
            <MockPaymentContent />
        </Suspense>
    );
}
