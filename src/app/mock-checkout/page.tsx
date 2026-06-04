"use client";

import { useState, Suspense, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { CreditCard, ShieldCheck, Loader2, ArrowLeft, CheckCircle2, XCircle } from "lucide-react";

function MockCheckoutContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    useEffect(() => {
        document.title = "Pasarela de Pago Simulada | Convive Connect";
    }, []);

    const reference = searchParams.get("reference") ?? "";
    const amount = Number(searchParams.get("amount") ?? 0);
    const returnUrl = searchParams.get("returnUrl") ?? "";

    // Form inputs
    const [cardName, setCardName] = useState("");
    const [cardNumber, setCardNumber] = useState("");
    const [cardExpiry, setCardExpiry] = useState("");
    const [cardCvv, setCardCvv] = useState("");
    const [rut, setRut] = useState("");

    // Simulation states
    const [step, setStep] = useState<"idle" | "processing" | "success" | "failed">("idle");
    const [statusMessage, setStatusMessage] = useState("");

    // Format CLP helper
    const formatCLP = (n: number) =>
        new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(n);

    // Format card number helper
    const handleCardNumberChange = (val: string) => {
        const clean = val.replace(/\D/g, "").slice(0, 16);
        const parts = [];
        for (let i = 0; i < clean.length; i += 4) {
            parts.push(clean.slice(i, i + 4));
        }
        setCardNumber(parts.join(" "));
    };

    // Format expiry date helper
    const handleExpiryChange = (val: string) => {
        const clean = val.replace(/\D/g, "").slice(0, 4);
        if (clean.length >= 2) {
            setCardExpiry(`${clean.slice(0, 2)}/${clean.slice(2)}`);
        } else {
            setCardExpiry(clean);
        }
    };

    // Format RUT helper
    const formatRut = (value: string) => {
        const clean = value.replace(/[^0-9kK]/g, "").slice(0, 9);
        if (clean.length <= 1) return clean;
        const body = clean.slice(0, -1);
        const dv = clean.slice(-1).toUpperCase();
        let formatted = "";
        for (let i = 0; i < body.length; i++) {
            if (i > 0 && (body.length - i) % 3 === 0) {
                formatted += ".";
            }
            formatted += body[i];
        }
        return `${formatted}-${dv}`;
    };

    const handleRutChange = (val: string) => {
        setRut(formatRut(val));
    };

    // Run transaction simulation
    const executeSimulation = async (outcome: "success" | "failed") => {
        if (!reference || !returnUrl) {
            alert("Faltan parámetros críticos (referencia o returnUrl).");
            return;
        }

        setStep("processing");

        // Premium multi-step visual feedback
        const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

        setStatusMessage("Estableciendo conexión segura con Haulmer Sandbox...");
        await delay(1200);
        
        setStatusMessage("Validando datos bancarios simulados...");
        await delay(1000);

        if (outcome === "failed") {
            setStatusMessage("Fondos insuficientes en la cuenta origen (Simulado).");
            await delay(1000);
            setStep("failed");
            return;
        }

        setStatusMessage("Autorizando cargo por transacción...");
        await delay(800);

        setStatusMessage("Confirmando y emitiendo documento tributario SII...");
        
        try {
            const res = await fetch("/api/payments/mock-success", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ reference }),
            });

            if (!res.ok) {
                throw new Error("El servidor falló al aplicar la simulación.");
            }

            setStatusMessage("Pago procesado con éxito.");
            await delay(600);
            setStep("success");
        } catch (err) {
            console.error(err);
            setStatusMessage("Error al guardar registro en la base de datos.");
            await delay(1200);
            setStep("failed");
        }
    };

    const handleBack = () => {
        if (returnUrl) {
            window.location.href = returnUrl;
        } else {
            router.back();
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#0B0F19] text-white">
            {/* Ambient background glows */}
            <div className="absolute top-1/4 left-1/4 w-[350px] h-[350px] bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="w-full max-w-xl bg-[#111827]/80 backdrop-blur-xl border border-slate-800 rounded-3xl overflow-hidden shadow-2xl z-10">
                {/* Header */}
                <div className="p-6 sm:p-8 border-b border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-brand-500/10 text-brand-400">
                            <CreditCard className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold tracking-tight text-slate-100">Haulmer Sandbox</h1>
                            <p className="text-xs text-slate-400 font-medium mt-0.5">Pasarela de Pruebas de ComunidadConnect</p>
                        </div>
                    </div>
                    <button 
                        onClick={handleBack}
                        className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        aria-label="Volver"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </button>
                </div>

                {step === "idle" && (
                    <div className="p-6 sm:p-8 space-y-6">
                        {/* Receipt details */}
                        <div className="bg-[#1F2937]/50 rounded-2xl p-5 border border-slate-800 flex flex-col gap-3">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400 font-medium">Concepto</span>
                                <span className="text-slate-200 font-semibold">
                                    {reference.startsWith("FEE_") ? "Gastos Comunes Copropiedad" : "Artículo Marketplace"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-slate-400 font-medium">Referencia</span>
                                <span className="font-mono text-slate-300 font-semibold">{reference}</span>
                            </div>
                            <hr className="border-slate-800 my-1" />
                            <div className="flex justify-between items-end">
                                <span className="text-slate-400 text-sm font-medium">Total a Pagar</span>
                                <span className="text-2xl font-black text-brand-400 leading-none">{formatCLP(amount)}</span>
                            </div>
                        </div>

                        {/* Interactive Card Form */}
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nombre del Titular</label>
                                    <input 
                                        type="text" 
                                        value={cardName}
                                        onChange={(e) => setCardName(e.target.value)}
                                        placeholder="JUAN PEREZ"
                                        className="w-full bg-[#1F2937]/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-white placeholder-slate-600"
                                    />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Número de Tarjeta</label>
                                    <input 
                                        type="text" 
                                        value={cardNumber}
                                        onChange={(e) => handleCardNumberChange(e.target.value)}
                                        placeholder="4000 1234 5678 9010"
                                        className="w-full bg-[#1F2937]/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-white placeholder-slate-600 font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Vencimiento</label>
                                    <input 
                                        type="text" 
                                        value={cardExpiry}
                                        onChange={(e) => handleExpiryChange(e.target.value)}
                                        placeholder="MM/AA"
                                        className="w-full bg-[#1F2937]/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-white placeholder-slate-600 text-center font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">CVV</label>
                                    <input 
                                        type="password" 
                                        value={cardCvv}
                                        onChange={(e) => setCardCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                                        placeholder="•••"
                                        className="w-full bg-[#1F2937]/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-white placeholder-slate-600 text-center font-mono"
                                    />
                                </div>
                                <div className="space-y-1.5 col-span-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">RUT del Pagador</label>
                                    <input 
                                        type="text" 
                                        value={rut}
                                        onChange={(e) => handleRutChange(e.target.value)}
                                        placeholder="12.345.678-9"
                                        className="w-full bg-[#1F2937]/40 border border-slate-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 text-white placeholder-slate-600 font-mono"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Simulation CTAs */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                            <button
                                onClick={() => executeSimulation("failed")}
                                className="w-full py-3.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-colors border border-slate-700"
                            >
                                Simular Pago Rechazado
                            </button>
                            <button
                                onClick={() => executeSimulation("success")}
                                className="w-full py-3.5 px-4 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm shadow-lg shadow-brand-500/20 transition-all"
                            >
                                Simular Pago Exitoso
                            </button>
                        </div>
                    </div>
                )}

                {step === "processing" && (
                    <div className="p-12 text-center flex flex-col items-center justify-center space-y-6">
                        <Loader2 className="h-10 w-10 text-brand-500 animate-spin" />
                        <div className="space-y-2">
                            <h3 className="text-base font-bold">Procesando simulación de pago</h3>
                            <p className="text-xs text-slate-400 max-w-xs mx-auto animate-pulse">{statusMessage}</p>
                        </div>
                    </div>
                )}

                {step === "success" && (
                    <div className="p-8 text-center flex flex-col items-center justify-center space-y-6">
                        <div className="p-4 rounded-full bg-emerald-500/10 text-emerald-400">
                            <CheckCircle2 className="h-12 w-12" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold">¡Simulación Exitosa!</h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                La base de datos fue actualizada correctamente. Se emitió el comprobante tributario y registramos el pago.
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                window.location.href = returnUrl || "/home";
                            }}
                            className="w-full max-w-xs py-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl font-semibold text-sm transition-all"
                        >
                            Volver a la aplicación
                        </button>
                    </div>
                )}

                {step === "failed" && (
                    <div className="p-8 text-center flex flex-col items-center justify-center space-y-6">
                        <div className="p-4 rounded-full bg-rose-500/10 text-rose-400">
                            <XCircle className="h-12 w-12" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xl font-bold">Pago Rechazado</h3>
                            <p className="text-sm text-slate-400 max-w-sm mx-auto">
                                {statusMessage || "La transacción no pudo ser autorizada por la pasarela de pagos simulada."}
                            </p>
                        </div>
                        <div className="flex gap-4 w-full justify-center">
                            <button
                                onClick={() => setStep("idle")}
                                className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl font-semibold text-sm transition-colors"
                            >
                                Reintentar
                            </button>
                            <button
                                onClick={() => {
                                    window.location.href = returnUrl || "/home";
                                }}
                                className="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-semibold text-sm transition-colors"
                            >
                                Cancelar y volver
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer security badge */}
                <div className="px-6 py-4 bg-slate-950/60 border-t border-slate-900 flex justify-center items-center gap-2 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                    <ShieldCheck className="h-4 w-4 text-slate-600" />
                    Transacción Protegida por Encriptación Sandbox TLS 1.3
                </div>
            </div>
        </div>
    );
}

export default function MockCheckoutPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen flex items-center justify-center bg-[#0B0F19]">
                <Loader2 className="h-8 w-8 text-brand-500 animate-spin" />
            </div>
        }>
            <MockCheckoutContent />
        </Suspense>
    );
}
