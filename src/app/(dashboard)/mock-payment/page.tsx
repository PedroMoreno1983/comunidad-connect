"use client";

import { useSearchParams, useRouter } from 'next/navigation';
import { Button } from "@/components/ui/Button";
import { CheckCircle, AlertCircle } from "lucide-react";
import { useState, Suspense } from 'react';

function MockPaymentContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const ref = searchParams.get('ref');
    const amount = searchParams.get('amount') || '0';
    const callback = searchParams.get('callback') || '/home';

    const handleSimulatePayment = async (success: boolean) => {
        setLoading(true);
        // Simular webhook local llamando a nuestro endpoint
        try {
            if (success) {
                await fetch('/api/webhooks/haulmer', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'payment.success',
                        data: {
                            id: 'mock_tx_12345',
                            status: 'paid',
                            payment_id: ref,
                            amount: Number(amount)
                        }
                    })
                });
            }

            // Simular cierre de popup y regreso
            setTimeout(() => {
                setLoading(false);
                router.push(callback + "?payment_status=" + (success ? 'success' : 'failed'));
            }, 1000);

        } catch (e) {
            console.error(e);
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">
                <div className="bg-[#1b4382] p-6 text-center">
                    <h1 className="text-xl font-bold text-white">Haulmer Sandbox</h1>
                    <p className="text-blue-100 text-sm mt-1">Simulador de Pagos Locales</p>
                </div>

                <div className="p-8">
                    <div className="text-center mb-8">
                        <span className="text-slate-500 text-sm font-medium">Monto a pagar</span>
                        <div className="text-4xl font-black text-slate-800 tracking-tight mt-1">
                            ${Number(amount).toLocaleString('es-CL')}
                        </div>
                        <div className="text-xs text-slate-400 mt-2 font-mono">Ref: {ref}</div>
                    </div>

                    <div className="space-y-4">
                        <Button
                            className="w-full h-12 bg-emerald-500 hover:bg-emerald-600 font-medium text-white shadow-lg shadow-emerald-500/20"
                            onClick={() => handleSimulatePayment(true)}
                            disabled={loading}
                        >
                            <CheckCircle className="w-5 h-5 mr-2" />
                            {loading ? "Procesando..." : "Simular Pago Exitoso"}
                        </Button>
                        <Button
                            variant="outline"
                            className="w-full h-12 border-rose-200 text-rose-600 hover:bg-rose-50"
                            onClick={() => handleSimulatePayment(false)}
                            disabled={loading}
                        >
                            <AlertCircle className="w-5 h-5 mr-2" />
                            Simular Pago Rechazado
                        </Button>
                    </div>

                    <p className="text-center text-xs text-slate-400 mt-6">
                        Estás viendo esta pantalla porque no hay un HAULMER_API_KEY configurado.
                    </p>
                </div>
            </div>
        </div>
    );
}

export default function MockPaymentPage() {
    return (
        <Suspense fallback={<div>Loading...</div>}>
            <MockPaymentContent />
        </Suspense>
    );
}
