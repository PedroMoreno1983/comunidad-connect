"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { ResidentFinanceService } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { AlertCircle, CheckCircle2, Clock, CreditCard, FileText, History, Home } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { getApiUrl } from "@/lib/config";
import { calculateHaulmerServiceFee } from "@/lib/payments/haulmerFees";
import { safeFormatDate, formatCurrency } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import type { ResidentFinanceExpense } from "@/lib/types";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

export default function FinancesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const searchParams = useSearchParams();
    const router = useRouter();
    const [expenses, setExpenses] = useState<ResidentFinanceExpense[]>([]);
    const [loading, setLoading] = useState(true);
    const [processingId, setProcessingId] = useState<string | null>(null);

    const loadFinances = useCallback(async () => {
        if (!user) {
            setLoading(false);
            return [];
        }
        try {
            setLoading(true);

            const data = await ResidentFinanceService.getExpensesForResident(user);
            setExpenses(data);
            return data;

        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "No se pudieron cargar tus finanzas.",
                variant: "destructive"
            });
            return [];
        } finally {
            setLoading(false);
        }
    }, [toast, user]);

    const paymentReturnExpenseId = searchParams.get('payment') === 'return'
        ? searchParams.get('expenseId') || ''
        : '';

    useEffect(() => {
        let cancelled = false;

        const refreshAndVerify = async () => {
            let data = await loadFinances();
            if (!paymentReturnExpenseId || cancelled) return;

            for (let attempt = 0; attempt < 3 && !data.some(expense => expense.id === paymentReturnExpenseId && expense.status === 'paid'); attempt += 1) {
                await new Promise(resolve => setTimeout(resolve, 1200));
                data = await loadFinances();
            }

            if (cancelled) return;
            const verified = data.some(expense => expense.id === paymentReturnExpenseId && expense.status === 'paid');
            toast(verified ? {
                title: "Pago verificado",
                description: "La pasarela confirmo el pago y el cobro ya figura pagado.",
                variant: "success",
            } : {
                title: "Pago en verificacion",
                description: "Aun no recibimos la confirmacion firmada de la pasarela. El cobro seguira pendiente hasta validarla.",
                variant: "default",
            });
            router.replace('/resident/finances');
        };

        void refreshAndVerify();
        return () => { cancelled = true; };
    }, [loadFinances, paymentReturnExpenseId, router, toast]);

    const handlePayHaulmer = async (expense: ResidentFinanceExpense) => {
        setProcessingId(expense.id);
        try {

            const response = await fetch(getApiUrl('/api/payments/create-haulmer-link'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: expense.amount,
                    includeServiceFee: true,
                    reference: `EXP_${expense.id}`,
                    returnUrl: window.location.origin + '/resident/finances'
                })
            });

            if (!response.ok) {
                const payload = await response.json().catch(() => ({})) as { error?: string };
                throw new Error(payload.error || "Error al generar orden de pago");
            }

            const data = await response.json();
            window.location.href = data.url;

        } catch (error: unknown) {
            console.error(error);
            toast({
                title: "Hubo un problema",
                description: error instanceof Error ? error.message : "No logramos conectar con Haulmer en este momento.",
                variant: "destructive"
            });
            setProcessingId(null);
        }
    };

    const pendingExpenses = expenses.filter(e => e.status !== 'paid');
    const paidExpenses = expenses.filter(e => e.status === 'paid');
    const totalDebt = pendingExpenses.reduce((acc, curr) => acc + Number(curr.amount), 0);

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 sm:py-8">
            <header className="flex flex-col justify-between gap-4 border-b pb-6 md:flex-row md:items-end" style={{ borderColor: "var(--cc-line)" }}>
                <div>
                    <Eyebrow className="mb-2">Finanzas personales</Eyebrow>
                    <DisplayHeading size={32}>Gastos comunes</DisplayHeading>
                    <p className="mt-2 max-w-2xl text-sm leading-6 font-medium cc-text-secondary">
                        Revisa deuda vigente, vencimientos e historial de pagos asociados a tu unidad.
                    </p>
                </div>
                <div className="rounded-full border px-4 py-3 text-sm font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    Depto {expenses[0]?.units?.number ?? user?.unitName ?? "sin asignar"}
                </div>
            </header>

            <section className="grid gap-3 sm:grid-cols-3">
                <Metric icon={<AlertCircle className="h-5 w-5" />} label="Total pendiente" value={formatCurrency(totalDebt)} tone="rose" />
                <Metric icon={<Clock className="h-5 w-5" />} label="Cobros abiertos" value={pendingExpenses.length} tone="amber" />
                <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Pagos registrados" value={paidExpenses.length} tone="sage" />
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_380px]">
                <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center justify-between border-b p-5" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="flex items-center gap-3">
                            <FileText className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                            <div>
                                <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Cobros pendientes</h2>
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
                                className="mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-success-bg"
                            >
                                <CheckCircle2 className="h-7 w-7 text-success-fg" />
                            </motion.div>
                            <h3 className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Todo al dia</h3>
                            <p className="mt-2 max-w-sm text-sm leading-6 cc-text-secondary">
                                No tienes pagos pendientes en este momento.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-[var(--cc-line)]">
                            {pendingExpenses.map((expense) => {
                                const fee = calculateHaulmerServiceFee(expense.amount);

                                return (
                                <div key={expense.id} className="flex flex-col gap-4 p-5 transition-colors hover:bg-[var(--cc-paper-warm)] sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--cc-rose-tint)", color: "var(--cc-rose)" }}>
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
                                        <div className="text-right">
                                            <span className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                                {formatCurrency(fee.totalWithFee)}
                                            </span>
                                            <p className="text-xs cc-text-secondary">
                                                Incluye cargo servicio {formatCurrency(fee.totalFee)}
                                            </p>
                                        </div>
                                        <Button
                                            onClick={() => handlePayHaulmer(expense)}
                                            className="min-w-[150px] rounded-full text-white"
                                            style={{ background: "var(--cc-ink)" }}
                                            disabled={processingId === expense.id}
                                        >
                                            {processingId === expense.id ? 'Redirigiendo...' : 'Pagar con Haulmer'}
                                        </Button>
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                </section>

                <aside className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex items-center gap-3 border-b p-5" style={{ borderColor: "var(--cc-line)" }}>
                        <History className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Historial</h2>
                            <p className="text-sm cc-text-secondary">Pagos confirmados</p>
                        </div>
                    </div>
                    {paidExpenses.length === 0 ? (
                        <div className="p-8 text-center text-sm cc-text-secondary">No hay pagos registrados.</div>
                    ) : (
                        <div className="max-h-[460px] divide-y divide-[var(--cc-line)] overflow-y-auto">
                            {paidExpenses.map((expense) => (
                                <div key={expense.id} className="flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--cc-paper-warm)]">
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
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

function Metric({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; tone: "rose" | "amber" | "sage" }) {
    const colors = {
        rose: { background: "var(--cc-rose-tint)", color: "var(--cc-rose)" },
        amber: { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" },
        sage: { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" },
    };

    return (
        <div className="rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full" style={colors[tone]}>
                {icon}
            </div>
            <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{value}</p>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] cc-text-secondary">{label}</p>
        </div>
    );
}
