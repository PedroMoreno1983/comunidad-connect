"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { createClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CreditCard, History, AlertCircle, CheckCircle2, Home } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { getApiUrl } from "@/lib/config";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

interface CondoFee {
    id: string;
    unit_id: string;
    amount: number;
    month: string;
    status: 'pending' | 'paid' | 'overdue';
    due_date: string;
    paid_at?: string;
    units: {
        number: string;
    };
}

export default function FinancesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const [fees, setFees] = useState<CondoFee[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    useEffect(() => {
        if (searchParams.get('status') === 'success') {
            toast({
                title: "¡Pago Recibido!",
                description: "Tu pago se está procesando. El estado se actualizará en unos momentos.",
                variant: "success"
            });
        }
        loadFinances();
    }, [user, searchParams]);

    const loadFinances = async () => {
        if (!user) return;
        try {
            setLoading(true);

            const supabase = createClient();

            // 1. Obtener la unidad (Priorizar unidad de authContext)
            let targetUnitId = user.unitId;

            if (!targetUnitId) {
                const { data: profile } = await supabase
                    .from('resident_profiles')
                    .select('unit_id')
                    .eq('user_id', user.id)
                    .single();
                targetUnitId = profile?.unit_id;
            }

            if (!targetUnitId) throw new Error("Unidad no encontrada");

            // 2. Traer Gastos Comunes
            const { data, error } = await supabase
                .from('condo_fees')
                .select('*, units(number)')
                .eq('unit_id', targetUnitId)
                .order('due_date', { ascending: false });

            if (error) throw error;
            setFees(data || []);

        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "No se pudieron cargar tus finanzas.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    const handlePayHaulmer = async (fee: CondoFee) => {
        setProcessingId(fee.id);
        try {
            // Llamar a nuestro propio API Route que genera el link
            const response = await fetch(getApiUrl('/api/payments/create-haulmer-link'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: fee.amount,
                    description: `Gastos Comunes ${format(new Date(fee.month), 'MMMM yyyy', { locale: es })} - Depto ${fee.units?.number}`,
                    reference: `FEE_${fee.id}`, // Prefijo FEE_ + UUID
                    client: {
                        name: user?.name || 'Residente',
                        email: user?.email || '',
                    },
                    returnUrl: window.location.origin + '/resident/finances?status=success'
                })
            });

            if (!response.ok) {
                throw new Error("Error al generar orden de pago");
            }

            const data = await response.json();

            // Redirigir al Web Checkout de Haulmer (o Local Mock)
            window.location.href = data.url;

        } catch (error) {
            console.error(error);
            toast({
                title: "Hubo un problema",
                description: "No logramos conectar con Haulmer en este momento.",
                variant: "destructive"
            });
            setProcessingId(null);
        }
    };

    const pendingFees = fees.filter(f => f.status !== 'paid');
    const paidFees = fees.filter(f => f.status === 'paid');
    const totalDebt = pendingFees.reduce((acc, curr) => acc + curr.amount, 0);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500">
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900 border-l-4 border-indigo-500 pl-4 py-1">Finanzas y Pagos</h1>
                    <p className="text-slate-500 mt-2 ml-5">
                        Gestiona tus pagos de Gastos Comunes a través de Haulmer 💸
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="md:col-span-2 border-0 shadow-lg shadow-slate-200/50">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <AlertCircle className="w-5 h-5 text-rose-500" />
                                <CardTitle className="text-lg">Deuda Actual</CardTitle>
                            </div>
                            <span className="text-2xl font-black text-rose-600">
                                ${totalDebt.toLocaleString('es-CL')}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {loading ? (
                            <div className="p-8 text-center text-slate-400">Cargando...</div>
                        ) : pendingFees.length === 0 ? (
                            <div className="p-16 text-center flex flex-col items-center justify-center">
                                <motion.div 
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    className="w-20 h-20 bg-emerald-100 dark:bg-emerald-500/20 rounded-full flex items-center justify-center mb-6"
                                >
                                    <CheckCircle2 className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
                                </motion.div>
                                <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2">¡Todo al día!</h3>
                                <p className="text-slate-500 dark:text-slate-400 max-w-[280px] font-medium leading-relaxed">
                                    No tienes pagos pendientes en este momento. Sigue disfrutando de tu comunidad.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {pendingFees.map(fee => (
                                    <div key={fee.id} className="p-6 flex flex-col sm:flex-row items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex gap-4 items-center w-full sm:w-auto">
                                            <div className="h-12 w-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600">
                                                <Home className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <h4 className="font-semibold text-slate-900 capitalize">
                                                    {format(new Date(fee.month), 'MMMM yyyy', { locale: es })}
                                                </h4>
                                                <p className="text-sm text-slate-500">
                                                    Vence: {format(new Date(fee.due_date), 'dd MMM yyyy')}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                                            <span className="text-lg font-bold text-slate-700">
                                                ${fee.amount.toLocaleString('es-CL')}
                                            </span>
                                            <Button
                                                onClick={() => handlePayHaulmer(fee)}
                                                className="bg-[#1b4382] hover:bg-[#1b4382]/90 text-white min-w-[140px]"
                                                disabled={processingId === fee.id}
                                            >
                                                {processingId === fee.id ? 'Redirigiendo...' : 'Pagar con Haulmer'}
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg shadow-slate-200/50 self-start">
                    <CardHeader className="bg-slate-50/50 border-b border-slate-100 pb-4">
                        <div className="flex items-center gap-2">
                            <History className="w-5 h-5 text-indigo-500" />
                            <CardTitle className="text-lg">Historial de Pagos</CardTitle>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        {paidFees.length === 0 ? (
                            <div className="p-6 text-center text-slate-400 text-sm">
                                No hay pagos registrados.
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
                                {paidFees.map(fee => (
                                    <div key={fee.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                                        <div>
                                            <p className="text-sm font-medium text-slate-700 capitalize">
                                                {format(new Date(fee.month), 'MMMM yyyy', { locale: es })}
                                            </p>
                                            <p className="text-xs text-slate-400">
                                                {fee.paid_at ? format(new Date(fee.paid_at), 'dd MMM yyyy') : 'Pagado'}
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-sm font-bold text-slate-900">
                                                ${fee.amount.toLocaleString('es-CL')}
                                            </p>
                                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 mt-1 border-emerald-200/50">
                                                Completado
                                            </Badge>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
