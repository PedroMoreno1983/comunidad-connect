"use client";

import { ExpensesService } from "@/lib/api";
import { ChevronLeft, MoreHorizontal, ArrowRight, Sparkles, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";
import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";
import { Tag } from "@/components/cc/Tag";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { DATA_PALETTE, FoldedBar } from "@/components/cc/viz/FoldedBar";
import { getApiUrl } from "@/lib/config";
import { calculateHaulmerServiceFee } from "@/lib/payments/haulmerFees";

interface Expense {
    id: string;
    unitId: string;
    month: string;
    amount: number;
    status: 'paid' | 'pending' | 'overdue' | string;
    dueDate: string;
    paidAt?: string | null;
    paymentAmount?: number | null;
    breakdown?: { label: string; amount: number }[];
}

type ExpenseItemRow = {
    label?: string | null;
    amount?: number | string | null;
};

type SupabaseExpenseRow = {
    id: string;
    unit_id?: string | null;
    month?: string | null;
    amount?: number | string | null;
    status?: Expense["status"] | null;
    due_date?: string | null;
    paid_at?: string | null;
    payment_metadata?: { amount?: number | string | null } | null;
    items?: ExpenseItemRow[] | null;
};

function mapExpenseRow(expense: SupabaseExpenseRow): Expense {
    return {
        id: expense.id,
        unitId: expense.unit_id || "",
        month: expense.month || new Date().toISOString().slice(0, 7),
        amount: Number(expense.amount || 0),
        status: expense.status || "pending",
        dueDate: expense.due_date || new Date().toISOString(),
        paidAt: expense.paid_at || null,
        paymentAmount: expense.payment_metadata?.amount != null ? Number(expense.payment_metadata.amount) : null,
        breakdown: (expense.items || []).map(item => ({
            label: item.label || "Concepto",
            amount: Number(item.amount || 0),
        })),
    };
}

export default function ExpensesPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isPaying, setIsPaying] = useState<string | null>(null);
    const [step, setStep] = useState<"review" | "method" | "success">("review");
    const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
    const [contributionType, setContributionType] = useState<string>("none");
    const [confirmedPayment, setConfirmedPayment] = useState<{ expenseId: string; amount: number; paidAt?: string | null } | null>(null);

    const targetUnitId = user?.unitId;
    const paymentReturnExpenseId = searchParams.get("payment") === "return"
        ? searchParams.get("expenseId") || ""
        : "";

    useEffect(() => {
        const fetchExpenses = async () => {
            if (!targetUnitId) {
                setExpenses([]);
                setIsLoading(false);
                return;
            }

            try {
                setIsLoading(true);
                let mapped = ((await ExpensesService.getExpenses(targetUnitId) || []) as SupabaseExpenseRow[]).map(mapExpenseRow);

                if (paymentReturnExpenseId) {
                    for (let attempt = 0; attempt < 3 && !mapped.some(expense => expense.id === paymentReturnExpenseId && expense.status === "paid"); attempt += 1) {
                        await new Promise(resolve => setTimeout(resolve, 1200));
                        mapped = ((await ExpensesService.getExpenses(targetUnitId) || []) as SupabaseExpenseRow[]).map(mapExpenseRow);
                    }

                    const paidExpense = mapped.find(expense => expense.id === paymentReturnExpenseId && expense.status === "paid");
                    if (paidExpense) {
                        setConfirmedPayment({
                            expenseId: paidExpense.id,
                            amount: paidExpense.paymentAmount || paidExpense.amount,
                            paidAt: paidExpense.paidAt,
                        });
                        setStep("success");
                        toast({
                            title: "Pago verificado",
                            description: "La pasarela confirmo el pago y el cobro ya figura pagado.",
                            variant: "success",
                        });
                    } else {
                        toast({
                            title: "Pago en verificacion",
                            description: "Volviste desde la pasarela, pero aun no recibimos la confirmacion firmada. Tu deuda no se marcara pagada hasta validarla.",
                            variant: "default",
                        });
                    }
                    router.replace("/expenses");
                }

                setExpenses(mapped);
            } catch (error: unknown) {
                console.error("Error fetching expenses:", error);
                setExpenses([]);
            } finally {
                setIsLoading(false);
            }
        };

        fetchExpenses();
        // toast y router son estables en la aplicacion; se excluyen para evitar recargas del retorno.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [targetUnitId, paymentReturnExpenseId]);

    const activeExpense = expenses.find(e => e.status !== 'paid');

    const getContributionAmount = (type: string, base: number) => {
        switch (type) {
            case 'round_1000': {
                const remainder = base % 1000;
                return remainder === 0 ? 0 : 1000 - remainder;
            }
            case 'round_5000': {
                const remainder = base % 5000;
                return remainder === 0 ? 0 : 5000 - remainder;
            }
            case 'fixed_1000': return 1000;
            case 'fixed_2000': return 2000;
            case 'fixed_5000': return 5000;
            default: return 0;
        }
    };

    const handlePay = async () => {
        if (!activeExpense) {
            toast({
                title: "Sin cobros pendientes",
                description: "No hay un gasto comun abierto para iniciar pago.",
                variant: "default",
            });
            return;
        }
        
        // Determine breakdown list from real billing items only.
        const breakdownList = activeExpense?.breakdown && activeExpense.breakdown.length > 0
            ? activeExpense.breakdown
            : [];

        const baseAmount = activeExpense.amount > 0 ? activeExpense.amount : breakdownList.reduce((sum, item) => sum + item.amount, 0);

        const extraContribution = getContributionAmount(contributionType, baseAmount);
        const paymentBaseAmount = baseAmount + extraContribution;
        if (paymentBaseAmount <= 0) {
            toast({
                title: "Monto no disponible",
                description: "El cobro no tiene un monto valido para enviar a la pasarela.",
                variant: "destructive",
            });
            return;
        }

        try {
            setIsPaying(activeExpense.id);
            const response = await fetch(getApiUrl("/api/payments/create-haulmer-link"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    amount: paymentBaseAmount,
                    extraContribution,
                    includeServiceFee: true,
                    reference: `EXP_${activeExpense.id}`,
                    returnUrl: `${window.location.origin}/expenses`,
                }),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({})) as { error?: string; code?: string };
                throw new Error(data.error || "No se pudo generar el enlace de pago.");
            }

            const data = await response.json() as { url?: string };
            if (!data.url) throw new Error("La pasarela no devolvio URL de pago.");
            window.location.href = data.url;
            return;
        } catch (error: unknown) {
            const description = error instanceof Error && error.message
                ? error.message
                : "No se pudo procesar el pago. Intenta nuevamente en unos segundos.";
            toast({
                title: "No pudimos iniciar el pago",
                description,
                variant: "destructive",
            });
        } finally {
            setIsPaying(null);
        }
    };

    if (isLoading) {
        return (
            <div className="max-w-md mx-auto px-5 py-20 flex flex-col items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-[#B5664E] mb-4" />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">Cargando cuentas…</span>
            </div>
        );
    }

    // Determine breakdown list from real billing items only.
    const breakdownList = activeExpense?.breakdown && activeExpense.breakdown.length > 0
        ? activeExpense.breakdown
        : [];

    const baseAmount = activeExpense
        ? (activeExpense.amount > 0 ? activeExpense.amount : breakdownList.reduce((sum, item) => sum + item.amount, 0))
        : 0;

    const extraContribution = getContributionAmount(contributionType, baseAmount);
    const paymentBaseAmount = baseAmount + extraContribution;
    const serviceFee = activeExpense && activeExpense.status !== "paid"
        ? calculateHaulmerServiceFee(paymentBaseAmount).totalFee
        : 0;
    const totalAmount = paymentBaseAmount + serviceFee;

    // Format current period
    const periodName = activeExpense
        ? new Date(activeExpense.month + "-02").toLocaleDateString("es-CL", { month: "long", year: "numeric" })
        : "Sin cobro vigente";
    const formattedPeriod = periodName.charAt(0).toUpperCase() + periodName.slice(1);

    // Format due date
    const formattedDueDate = activeExpense
        ? new Date(activeExpense.dueDate).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })
        : "--";

    // History calculation
    let historyChartData: Array<{ m: string; v: number; paid: boolean }> = [];
    if (expenses.length > 0) {
        const sorted = [...expenses].sort((a, b) => a.month.localeCompare(b.month)).slice(-5);
        if (sorted.length > 0) {
            historyChartData = sorted.map(exp => {
                const name = new Date(exp.month + "-02").toLocaleDateString("es-CL", { month: "short" });
                return {
                    m: name.charAt(0).toUpperCase() + name.slice(1, 3),
                    v: Math.round(exp.amount / 1000),
                    paid: exp.status === "paid"
                };
            });
        }
    }

    const averageHistory = historyChartData.length > 0
        ? Math.round(historyChartData.reduce((sum, item) => sum + item.v, 0) / historyChartData.length) * 1000
        : 0;

    return (
        <ErrorBoundary name="Expenses Resident Page">
            <div className="max-w-md mx-auto px-5 py-3.5 flex flex-col min-h-screen">
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pt-1.5">
                    <button 
                        onClick={() => {
                            if (step === "method") setStep("review");
                            else if (step === "success") setStep("review");
                            else window.history.back();
                        }}
                        className="grid place-items-center cursor-pointer"
                        style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                    >
                        <ChevronLeft size={16} />
                    </button>
                    <span className="font-mono uppercase tracking-[0.08em]" style={{ fontSize: 11, color: "var(--cc-ink-tertiary)" }}>
                        Gastos Comunes
                    </span>
                    <button 
                        className="grid place-items-center"
                        style={{ width: 36, height: 36, borderRadius: 12, border: "1px solid var(--cc-line)", background: "transparent" }}
                    >
                        <MoreHorizontal size={16} />
                    </button>
                </div>

                {step === "review" && (
                    <>
                        {/* Period */}
                        <Eyebrow className="mb-2">{formattedPeriod}</Eyebrow>
                        <DisplayHeading size={42}>
                            Tu cuenta <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>del mes</em>
                        </DisplayHeading>

                        {/* Amount Box */}
                        <div className="mt-6 pb-5 border-b" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="text-[12px] flex justify-between items-center" style={{ color: "var(--cc-ink-tertiary)", marginBottom: 8 }}>
                                <span>Total a pagar antes del {formattedDueDate}</span>
                                {activeExpense?.status === "paid" && (
                                    <Tag tone="sage" solid dot>Al día</Tag>
                                )}
                            </div>
                            <div className="flex items-baseline gap-1.5">
                                <span style={{ fontSize: 18, color: "var(--cc-ink-muted)" }}>$</span>
                                <span style={{ fontFamily: "var(--cc-font-display)", fontSize: 56, lineHeight: 1, letterSpacing: "-0.02em" }}>
                                    {totalAmount.toLocaleString("es-CL")}
                                </span>
                            </div>
                        </div>

                        {/* Breakdown */}
                        <div className="mt-5 mb-6">
                            {breakdownList.map((row) => (
                                <div
                                    key={row.label}
                                    className="flex justify-between items-center py-3"
                                    style={{ borderBottom: "1px solid var(--cc-line)" }}
                                >
                                    <div className="text-[13px]" style={{ color: "var(--cc-ink-soft)" }}>{row.label}</div>
                                    <div className="font-mono text-[13px]">${row.amount.toLocaleString("es-CL")}</div>
                                </div>
                            ))}
                            {extraContribution > 0 && (
                                <div
                                    className="flex justify-between items-center py-3"
                                    style={{ borderBottom: "1px solid var(--cc-line)", color: "var(--cc-copper)" }}
                                >
                                    <div className="text-[13px] font-semibold flex items-center gap-1">
                                        <Sparkles size={12} /> Aporte Solidario Vecinal
                                    </div>
                                    <div className="font-mono text-[13px] font-semibold">+${extraContribution.toLocaleString("es-CL")}</div>
                                </div>
                            )}
                            {serviceFee > 0 && (
                                <div
                                    className="flex justify-between items-center py-3"
                                    style={{ borderBottom: "none" }}
                                >
                                    <div className="text-[13px]" style={{ color: "var(--cc-ink-soft)" }}>Cargo servicio pago online</div>
                                    <div className="font-mono text-[13px]">+${serviceFee.toLocaleString("es-CL")}</div>
                                </div>
                            )}
                        </div>

                        {/* Solidarity Option Card */}
                        {activeExpense && activeExpense.status !== "paid" && (
                            <div 
                                className="mb-6 rounded-xl border p-4 bg-paper"
                                style={{ 
                                    borderColor: "var(--cc-copper-soft)",
                                    borderWidth: "1.5px",
                                    background: "rgba(181, 102, 78, 0.03)"
                                }}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <Sparkles size={16} className="text-[#B5664E]" />
                                    <span className="text-sm font-semibold uppercase tracking-wider text-[#B5664E]">
                                        Fondo de Solidaridad Vecinal
                                    </span>
                                </div>
                                <p className="text-xs leading-relaxed mb-4" style={{ color: "var(--cc-ink-soft)" }}>
                                    Apoya a familias del edificio con dificultades para cubrir su gasto común debido a cesantía o jubilación. 100% regulado y anónimo.
                                </p>
                                
                                <div className="grid grid-cols-2 gap-2 mb-3">
                                    {/* Rounding Options */}
                                    <button
                                        type="button"
                                        onClick={() => setContributionType(prev => prev === "round_1000" ? "none" : "round_1000")}
                                        className="rounded-lg py-2.5 px-3 text-left border text-xs cursor-pointer transition-all flex flex-col justify-between h-[52px]"
                                        style={{
                                            borderColor: contributionType === "round_1000" ? "var(--cc-copper)" : "var(--cc-line)",
                                            background: contributionType === "round_1000" ? "var(--cc-paper)" : "transparent",
                                            color: "var(--cc-ink)"
                                        }}
                                    >
                                        <span className="font-semibold text-[10px] uppercase text-slate-400">Redondear $1.000</span>
                                        <span className="font-mono text-xs">
                                            {baseAmount % 1000 === 0 ? "Sin redondeo" : `+$${(1000 - (baseAmount % 1000)).toLocaleString("es-CL")}`}
                                        </span>
                                    </button>
                                    
                                    <button
                                        type="button"
                                        onClick={() => setContributionType(prev => prev === "round_5000" ? "none" : "round_5000")}
                                        className="rounded-lg py-2.5 px-3 text-left border text-xs cursor-pointer transition-all flex flex-col justify-between h-[52px]"
                                        style={{
                                            borderColor: contributionType === "round_5000" ? "var(--cc-copper)" : "var(--cc-line)",
                                            background: contributionType === "round_5000" ? "var(--cc-paper)" : "transparent",
                                            color: "var(--cc-ink)"
                                        }}
                                    >
                                        <span className="font-semibold text-[10px] uppercase text-slate-400">Redondear $5.000</span>
                                        <span className="font-mono text-xs">
                                            {baseAmount % 5000 === 0 ? "Sin redondeo" : `+$${(5000 - (baseAmount % 5000)).toLocaleString("es-CL")}`}
                                        </span>
                                    </button>
                                </div>

                                <div className="flex gap-2">
                                    {[
                                        { id: "fixed_1000", label: "+$1k" },
                                        { id: "fixed_2000", label: "+$2k" },
                                        { id: "fixed_5000", label: "+$5k" },
                                    ].map((opt) => (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setContributionType(prev => prev === opt.id ? "none" : opt.id)}
                                            className="flex-1 py-2 px-1 text-center border text-[11px] rounded-lg cursor-pointer transition-all font-mono"
                                            style={{
                                                borderColor: contributionType === opt.id ? "var(--cc-copper)" : "var(--cc-line)",
                                                background: contributionType === opt.id ? "var(--cc-paper)" : "transparent",
                                                color: "var(--cc-ink)"
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* History chart */}
                        <Eyebrow className="mb-3">Histórico · últimos 5 meses</Eyebrow>
                        <div
                            className="rounded-xl border bg-paper-warm mb-6"
                            style={{ borderColor: "var(--cc-line)", padding: "20px 18px 14px", borderRadius: 18 }}
                        >
                            <div className="flex items-end gap-3.5 mb-2.5" style={{ height: 100 }}>
                                {historyChartData.map((m, idx) => {
                                    const colors = [DATA_PALETTE.yellow, "#D9A04A", DATA_PALETTE.orange, "#CB7146", DATA_PALETTE.copper];
                                    const color = colors[idx % colors.length];
                                    return (
                                    <div key={idx} className="flex-1 flex flex-col items-center gap-1.5">
                                        <div className="flex h-full w-full items-end">
                                            <FoldedBar pct={Math.max(10, (m.v / 200) * 100)} color={m.paid ? color : DATA_PALETTE.copper} orientation="vertical" rounded={4} />
                                        </div>
                                        <div className="font-mono" style={{ fontSize: 10, color: "var(--cc-ink-tertiary)" }}>{m.m}</div>
                                    </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-between items-center pt-2.5" style={{ borderTop: "1px solid var(--cc-line)" }}>
                                <div style={{ fontSize: 12, color: "var(--cc-ink-muted)" }}>Promedio</div>
                                <div className="font-mono" style={{ fontSize: 12 }}>${averageHistory.toLocaleString("es-CL")}</div>
                            </div>
                        </div>

                        {/* CTA */}
                        {activeExpense && activeExpense.status !== "paid" ? (
                            <div className="mt-auto pt-4 pb-3">
                                <Button variant="primary" size="lg" block onClick={() => setStep("method")}>
                                    <span className="flex-1 text-left">Pagar ${totalAmount.toLocaleString("es-CL")}</span>
                                    <ArrowRight size={16} />
                                </Button>
                                <div className="text-center mt-3 text-[11px]" style={{ color: "var(--cc-ink-tertiary)" }}>
                                    Webpay via Tuu/Haulmer, comision e IVA incluidos
                                </div>
                            </div>
                        ) : (
                            <div className="mt-auto pt-4 pb-3 text-center text-sm font-semibold text-success flex items-center justify-center gap-2">
                                <Check size={16} /> Estás al día con tus gastos comunes.
                            </div>
                        )}
                    </>
                )}

                {step === "method" && (
                    <>
                        <Eyebrow className="mb-2">MÉTODO DE PAGO</Eyebrow>
                        <DisplayHeading size={36} className="mb-6">
                            Elige cómo <em>pagar</em>
                        </DisplayHeading>

                        {/* Payment methods list */}
                        <div className="space-y-3 mb-8">
                            {[
                                { id: "webpay", name: "Webpay Plus", desc: "Debito, credito o prepago via Tuu/Haulmer", icon: "WP" },
                            ].map((m) => {
                                const selected = selectedMethod === m.id;
                                return (
                                    <button
                                        key={m.id}
                                        onClick={() => setSelectedMethod(m.id)}
                                        className="w-full flex items-center gap-4 rounded-xl border p-4 text-left transition-all cursor-pointer"
                                        style={{
                                            background: selected ? "var(--cc-ink)" : "var(--cc-paper)",
                                            color: selected ? "var(--cc-paper)" : "var(--cc-ink)",
                                            borderColor: selected ? "transparent" : "var(--cc-line-strong)"
                                        }}
                                    >
                                        <span className="text-2xl">{m.icon}</span>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-semibold">{m.name}</div>
                                            <div className="text-xs" style={{ color: selected ? "rgba(250,247,241,0.6)" : "var(--cc-ink-muted)" }}>
                                                {m.desc}. Cargo servicio: ${serviceFee.toLocaleString("es-CL")}
                                            </div>
                                        </div>
                                        <div 
                                          className="w-5 h-5 rounded-full border grid place-items-center shrink-0"
                                          style={{ borderColor: selected ? "var(--cc-copper-soft)" : "var(--cc-line-strong)" }}
                                        >
                                            {selected && <div className="w-2.5 h-2.5 rounded-full bg-copper" style={{ backgroundColor: "var(--cc-copper)" }} />}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* CTA Pay */}
                        <div className="mt-auto pt-4 pb-3">
                            <Button 
                                variant="copper" 
                                size="lg" 
                                block 
                                disabled={!selectedMethod || isPaying !== null}
                                onClick={handlePay}
                            >
                                {isPaying ? (
                                    <Loader2 className="h-5 w-5 animate-spin" />
                                ) : (
                                    <>Confirmar y Pagar ${totalAmount.toLocaleString("es-CL")}</>
                                )}
                            </Button>
                        </div>
                    </>
                )}

                {step === "success" && (
                    <div className="flex-1 flex flex-col justify-center items-center text-center py-8">
                        <div
                          className="w-16 h-16 rounded-full flex items-center justify-center bg-[rgba(110,130,104,0.1)] text-[#6E8268] mb-6"
                        >
                            <Check size={32} />
                        </div>

                        <DisplayHeading size={38} className="mb-4">
                            ¡Pago <em>exitoso!</em>
                        </DisplayHeading>

                        <p className="text-sm leading-relaxed max-w-xs mb-8" style={{ color: "var(--cc-ink-muted)" }}>
                            Tu pago de <span className="font-semibold text-ink">${(confirmedPayment?.amount || 0).toLocaleString("es-CL")}</span> fue recibido y procesado de forma correcta.
                        </p>

                        {/* Comprobante */}
                        <div className="w-full bg-[#FAF7F1] border rounded-2xl p-5 mb-8 text-left" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-3">COMPROBANTE DE PAGO</div>
                            <div className="flex justify-between items-center text-sm py-1.5">
                                <span className="text-slate-400">Referencia:</span>
                                <span className="font-mono font-medium">{confirmedPayment?.expenseId.slice(0, 8) || "--"}</span>
                            </div>
                            <div className="flex justify-between items-center text-sm py-1.5">
                                <span className="text-slate-400">Fecha:</span>
                                <span className="font-medium">{new Date(confirmedPayment?.paidAt || Date.now()).toLocaleDateString("es-CL")}</span>
                            </div>
                        </div>

                        <div className="w-full space-y-3">
                            <Button
                                variant="ghost"
                                size="md"
                                block
                                onClick={() => {
                                    setStep("review");
                                    setConfirmedPayment(null);
                                }}
                            >
                                Volver a Cuentas
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </ErrorBoundary>
    );
}
