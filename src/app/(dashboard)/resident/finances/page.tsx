"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { ResidentFinanceService } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, CheckCircle2, Clock, CreditCard, FileText, History, Home } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { getApiUrl } from "@/lib/config";
import { safeFormatDate, formatCurrency } from "@/lib/utils";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { ResidentFinanceExpense } from "@/lib/types";

export default function FinancesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const [expenses, setExpenses] = useState<ResidentFinanceExpense[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadFinances = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return;
        }
        try {
            setLoading(true);

            setExpenses(await ResidentFinanceService.getExpensesForResident(user));

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
    }, [toast, user]);

    useEffect(() => {
        if (searchParams.get('status') === 'success') {
            toast({
                title: "Pago recibido",
                description: "Tu pago se esta procesando. El estado se actualizara en unos momentos.",
                variant: "success"
            });
        }
        loadFinances();
    }, [loadFinances, searchParams, toast]);

    const handlePayHaulmer = async (expense: ResidentFinanceExpense) => {
        setProcessingId(expense.id);
        try {

            const monthLabel = safeFormatDate(expense.month, 'MMMM yyyy', true);
            const response = await fetch(getApiUrl('/api/payments/create-haulmer-link'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: expense.amount,
                    description: `Gastos Comunes ${monthLabel} - Depto ${expense.units?.number ?? ''}`,
                    reference: `EXP_${expense.id}`,
                    client: {
                        name: user?.name || 'Residente',
                        email: user?.email || '',
                    },
                    returnUrl: window.location.origin + '/resident/finances?status=success'
                })
            });

            if (!response.ok) throw new Error("Error al generar orden de pago");

            const data = await response.json();
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

    const pendingExpenses = expenses.filter(e => e.status !== 'paid');
    const paidExpenses = expenses.filter(e => e.status === 'paid');
    const totalDebt = pendingExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col justify-between gap-4 border-b border-subtle pb-6 md:flex-row md:items-end">
                <div>
                    <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-600">Finanzas personales</p>
                    <h1 className="text-3xl font-semibold cc-text-primary">Gastos comunes</h1>
                    <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Revisa deuda vigente, vencimientos e historial de pagos asociados a tu unidad.
                    </p>
                </div>
                <div className="rounded-lg border border-subtle bg-surface px-4 py-3 text-sm font-semibold cc-text-primary shadow-sm">
                    Depto {expenses[0]?.units?.number ?? user?.unitName ?? "sin asignar"}
                </div>
            </header>

            <section className="grid gap-3 md:grid-cols-3">
                <Metric icon={<AlertCircle className="h-5 w-5" />} label="Total pendiente" value={formatCurrency(totalDebt)} tone="rose" />
                <Metric icon={<Clock className="h-5 w-5" />} label="Cobros abiertos" value={pendingExpenses.length} tone="amber" />
                <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Pagos registrados" value={paidExpenses.length} tone="emerald" />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
                <section className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
                    <div className="flex items-center justify-between border-b border-subtle p-5">
                        <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5 text-slate-500" />
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary">Cobros pendientes</h2>
                                <p className="text-sm cc-text-secondary">Ordenados por periodo y vencimiento</p>
                            </div>
                        </div>
                        <Badge variant={totalDebt > 0 ? "destructive" : "secondary"}>
                            {totalDebt > 0 ? "Pendiente" : "Al dia"}
                        </Badge>
                    </div>

                    {loading ? (
                        <div className="p-10 text-center text-sm font-semibold cc-text-secondary">Cargando finanzas...</div>
                    ) : pendingExpenses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                            <motion.div
                                initial={{ scale: 0.95, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="mb-5 flex h-14 w-14 items-center justify-center rounded-lg bg-success-bg"
                            >
                                <CheckCircle2 className="h-7 w-7 text-success-fg" />
                            </motion.div>
                            <h3 className="text-xl font-semibold cc-text-primary">Todo al dia</h3>
                            <p className="mt-2 max-w-sm text-sm leading-6 cc-text-secondary">
                                No tienes pagos pendientes en este momento.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-subtle">
                            {pendingExpenses.map((expense) => (
                                <div key={expense.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-elevated/50 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                                            <Home className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <p className="font-semibold capitalize cc-text-primary">
                                                {safeFormatDate(expense.month, 'MMMM yyyy', true)}
                                            </p>
                                            <p className="text-sm cc-text-secondary">
                                                Vence {safeFormatDate(expense.due_date, 'dd MMM yyyy')}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 sm:justify-end">
                                        <span className="text-lg font-semibold cc-text-primary">
                                            {formatCurrency(expense.amount)}
                                        </span>
                                        <Button
                                            onClick={() => handlePayHaulmer(expense)}
                                            className="min-w-[150px] rounded-lg bg-slate-950 text-white hover:bg-slate-800"
                                            disabled={processingId === expense.id}
                                        >
                                            {processingId === expense.id ? 'Redirigiendo...' : 'Pagar con Haulmer'}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                <aside className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm">
                    <div className="flex items-center gap-3 border-b border-subtle p-5">
                        <History className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Historial</h2>
                            <p className="text-sm cc-text-secondary">Pagos confirmados</p>
                        </div>
                    </div>
                    {paidExpenses.length === 0 ? (
                        <div className="p-8 text-center text-sm cc-text-secondary">No hay pagos registrados.</div>
                    ) : (
                        <div className="max-h-[460px] divide-y divide-subtle overflow-y-auto">
                            {paidExpenses.map((expense) => (
                                <div key={expense.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-elevated/50">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                                            <CreditCard className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold capitalize cc-text-primary">
                                                {safeFormatDate(expense.month, 'MMMM yyyy', true)}
                                            </p>
                                            <p className="text-xs cc-text-tertiary">
                                                {expense.paid_at ? safeFormatDate(expense.paid_at, 'dd MMM yyyy') : 'Pagado'}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold cc-text-primary">{formatCurrency(expense.amount)}</p>
                                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-success-fg">Completado</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: "rose" | "amber" | "emerald" }) {
    const colors = {
        rose: "bg-rose-50 text-rose-600",
        amber: "bg-amber-50 text-amber-600",
        emerald: "bg-emerald-50 text-emerald-600",
    };

    return (
        <div className="rounded-lg border border-subtle bg-surface p-4 shadow-sm">
            <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-lg ${colors[tone]}`}>
                {icon}
            </div>
            <p className="text-2xl font-semibold cc-text-primary">{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{label}</p>
        </div>
    );
}
