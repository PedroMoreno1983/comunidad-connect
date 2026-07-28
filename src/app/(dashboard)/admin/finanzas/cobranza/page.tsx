"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertTriangle, ArrowLeft, FileText, Loader2, Percent, Receipt, Wallet, X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";

interface UnitBalance {
    unitId: string;
    label: string;
    balance: number;
    overdueAmount: number;
    oldestOverdueMonth: string | null;
    totalCharged: number;
    totalPaid: number;
}

interface CommunityBalances {
    units: UnitBalance[];
    totalDebt: number;
    totalOverdue: number;
    unitsWithDebt: number;
    unitsOverdue: number;
}

interface StatementEntry {
    id: string;
    date: string;
    kind: string;
    label: string;
    amount: number;
    balance: number;
    reference: string | null;
}

interface UnitStatement {
    unitLabel: string;
    entries: StatementEntry[];
    balance: number;
    overdueAmount: number;
    totalCharged: number;
    totalPaid: number;
}

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

const KIND_LABELS: Record<string, string> = {
    gasto_comun: "Gasto común",
    fine: "Multa",
    interest: "Interés",
    extraordinary: "Extraordinario",
    service: "Servicio",
    other: "Otro",
    payment: "Pago",
};

export default function CobranzaPage() {
    const { toast } = useToast();
    const [balances, setBalances] = useState<CommunityBalances | null>(null);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<UnitBalance | null>(null);
    const [statement, setStatement] = useState<UnitStatement | null>(null);
    const [busy, setBusy] = useState(false);

    const [payAmount, setPayAmount] = useState("");
    const [payDate, setPayDate] = useState(today);
    const [payMethod, setPayMethod] = useState("transfer");
    const [payReference, setPayReference] = useState("");

    const [chargeLabel, setChargeLabel] = useState("");
    const [chargeAmount, setChargeAmount] = useState("");
    const [chargeKind, setChargeKind] = useState("fine");

    const loadBalances = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/finance/statement", { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudieron cargar los saldos.");
            setBalances(data);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void loadBalances(); }, [loadBalances]);

    const openUnit = useCallback(async (unit: UnitBalance) => {
        setSelected(unit);
        setStatement(null);
        try {
            const response = await fetch(`/api/finance/statement?unitId=${unit.unitId}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo cargar la cartola.");
            setStatement(data);
            setPayAmount(String(Math.max(0, data.balance)));
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        }
    }, [toast]);

    async function submitPayment() {
        if (!selected) return;
        const amount = Number(payAmount.replace(/[^\d]/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) {
            toast({ title: "Monto inválido", description: "Ingresa un monto mayor que cero.", variant: "destructive" });
            return;
        }

        setBusy(true);
        try {
            const response = await fetch("/api/admin/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitId: selected.unitId,
                    amount,
                    paidAt: payDate,
                    method: payMethod,
                    reference: payReference.trim() || null,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo registrar el pago.");

            toast({ title: "Pago registrado", description: `${money(amount)} en ${selected.label}.`, variant: "success" });
            setPayReference("");
            await Promise.all([loadBalances(), openUnit(selected)]);
        } catch (error) {
            toast({
                title: "No se registró",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function submitCharge() {
        if (!selected) return;
        const amount = Number(chargeAmount.replace(/[^\d]/g, ""));
        if (!chargeLabel.trim() || !Number.isFinite(amount) || amount <= 0) {
            toast({ title: "Datos incompletos", description: "Escribe una descripción y un monto.", variant: "destructive" });
            return;
        }

        setBusy(true);
        try {
            const response = await fetch("/api/admin/charges", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    unitId: selected.unitId,
                    month: currentMonth(),
                    kind: chargeKind,
                    label: chargeLabel.trim(),
                    amount,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo registrar el cargo.");

            toast({ title: "Cargo registrado", description: `${money(amount)} en ${selected.label}.`, variant: "success" });
            setChargeLabel("");
            setChargeAmount("");
            await Promise.all([loadBalances(), openUnit(selected)]);
        } catch (error) {
            toast({
                title: "No se registró",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function applyInterest() {
        setBusy(true);
        try {
            const response = await fetch("/api/admin/payments", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "apply_late_interest", month: currentMonth() }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo aplicar el interés.");

            toast({
                title: data.chargesCreated > 0 ? "Intereses aplicados" : "Sin intereses que aplicar",
                description: data.chargesCreated > 0
                    ? `${data.chargesCreated} cargo(s) por ${money(data.totalInterest)} al ${data.rate}% mensual.`
                    : "No hay cuotas vencidas que devenguen interés este mes.",
                variant: "default",
            });
            await loadBalances();
            if (selected) await openUnit(selected);
        } catch (error) {
            toast({
                title: "No se aplicó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <ErrorBoundary name="Cobranza">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6"
            >
                <div>
                    <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
                    </Link>
                    <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <Eyebrow className="mb-2">Recaudación</Eyebrow>
                            <DisplayHeading size={32}>Cobranza y pagos</DisplayHeading>
                            <p className="mt-2 text-sm leading-6 cc-text-secondary">
                                Saldo de cada unidad, con la deuda que arrastra de meses anteriores.
                                Registra pagos, multas y cargos extraordinarios.
                            </p>
                        </div>
                        <Button
                            type="button"
                            onClick={() => void applyInterest()}
                            disabled={busy}
                            className="text-sm"
                            style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}
                        >
                            <Percent className="mr-2 h-4 w-4" />
                            Aplicar interés por mora
                        </Button>
                    </header>
                </div>

                {balances && (
                    <section className="grid gap-4 sm:grid-cols-3">
                        {[
                            { label: "Deuda total", value: money(balances.totalDebt), hint: `${balances.unitsWithDebt} unidades con saldo` },
                            { label: "Vencido", value: money(balances.totalOverdue), hint: `${balances.unitsOverdue} unidades en mora` },
                            { label: "Unidades", value: String(balances.units.length), hint: "en la comunidad" },
                        ].map(card => (
                            <div key={card.label} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <p className="text-xs font-semibold uppercase tracking-wider cc-text-tertiary">{card.label}</p>
                                <p className="mt-2 text-2xl font-bold cc-text-primary">{card.value}</p>
                                <p className="mt-1 text-xs cc-text-tertiary">{card.hint}</p>
                            </div>
                        ))}
                    </section>
                )}

                <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="border-b px-5 py-4 font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", fontFamily: "var(--cc-font-display)" }}>
                        Saldo por unidad
                    </h2>
                    {loading ? (
                        <p className="p-6 text-center text-sm cc-text-secondary">Cargando…</p>
                    ) : !balances || balances.units.length === 0 ? (
                        <p className="p-6 text-center text-sm cc-text-secondary">
                            La comunidad todavía no tiene unidades registradas.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead style={{ background: "var(--cc-paper-warm)" }}>
                                    <tr>
                                        <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Unidad</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Cobrado</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Pagado</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Saldo</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Vencido</th>
                                        <th className="px-5 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                    {balances.units.map(unit => (
                                        <tr key={unit.unitId}>
                                            <td className="px-5 py-2 font-medium cc-text-primary">{unit.label}</td>
                                            <td className="px-5 py-2 text-right cc-text-tertiary">{money(unit.totalCharged)}</td>
                                            <td className="px-5 py-2 text-right cc-text-tertiary">{money(unit.totalPaid)}</td>
                                            <td className="px-5 py-2 text-right font-semibold cc-text-primary">
                                                {unit.balance < 0 ? `${money(-unit.balance)} a favor` : money(unit.balance)}
                                            </td>
                                            <td className="px-5 py-2 text-right">
                                                {unit.overdueAmount > 0 ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-danger-bg px-2 py-0.5 text-xs font-semibold text-danger-fg">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {money(unit.overdueAmount)}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs cc-text-tertiary">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-2 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => void openUnit(unit)}
                                                    className="text-xs font-semibold underline cc-text-secondary"
                                                >
                                                    Ver cartola
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>

                {selected && (
                    <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="flex items-center justify-between border-b px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                            <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Cartola de {selected.label}
                            </h2>
                            <div className="flex items-center gap-3">
                                <Link
                                    href={`/admin/finanzas/certificado?unitId=${selected.unitId}`}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold underline cc-text-secondary"
                                >
                                    <FileText className="h-3.5 w-3.5" /> Certificado de deuda
                                </Link>
                                <button type="button" onClick={() => { setSelected(null); setStatement(null); }} aria-label="Cerrar cartola" className="rounded-lg p-1 cc-text-tertiary">
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {!statement ? (
                            <p className="p-6 text-center text-sm cc-text-secondary">Cargando cartola…</p>
                        ) : (
                            <>
                                <div className="max-h-72 overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0" style={{ background: "var(--cc-paper-warm)" }}>
                                            <tr>
                                                <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Fecha</th>
                                                <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Concepto</th>
                                                <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Monto</th>
                                                <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Saldo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                            {statement.entries.length === 0 ? (
                                                <tr><td colSpan={4} className="px-5 py-6 text-center cc-text-secondary">Sin movimientos.</td></tr>
                                            ) : statement.entries.map(entry => (
                                                <tr key={entry.id}>
                                                    <td className="px-5 py-2 cc-text-tertiary">{entry.date}</td>
                                                    <td className="px-5 py-2 cc-text-primary">
                                                        {entry.label}
                                                        <span className="ml-2 text-xs cc-text-tertiary">{KIND_LABELS[entry.kind] || entry.kind}</span>
                                                    </td>
                                                    <td className={`px-5 py-2 text-right font-medium ${entry.amount < 0 ? "text-success-fg" : "cc-text-primary"}`}>
                                                        {entry.amount < 0 ? `-${money(-entry.amount)}` : money(entry.amount)}
                                                    </td>
                                                    <td className="px-5 py-2 text-right cc-text-secondary">{money(entry.balance)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="grid gap-5 border-t p-5 md:grid-cols-2" style={{ borderColor: "var(--cc-line)" }}>
                                    <div>
                                        <p className="mb-3 flex items-center gap-2 text-sm font-semibold cc-text-primary">
                                            <Wallet className="h-4 w-4" /> Registrar pago
                                        </p>
                                        <div className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={payAmount} onChange={e => setPayAmount(e.target.value)} inputMode="numeric" placeholder="Monto"
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)}
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                            </div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <select value={payMethod} onChange={e => setPayMethod(e.target.value)}
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                                    <option value="transfer">Transferencia</option>
                                                    <option value="cash">Efectivo</option>
                                                    <option value="check">Cheque</option>
                                                    <option value="card">Tarjeta</option>
                                                    <option value="other">Otro</option>
                                                </select>
                                                <input value={payReference} onChange={e => setPayReference(e.target.value)} placeholder="N° comprobante"
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                            </div>
                                            <Button type="button" onClick={() => void submitPayment()} disabled={busy} className="w-full text-white" style={{ background: "var(--cc-ink)" }}>
                                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar pago"}
                                            </Button>
                                        </div>
                                    </div>

                                    <div>
                                        <p className="mb-3 flex items-center gap-2 text-sm font-semibold cc-text-primary">
                                            <Receipt className="h-4 w-4" /> Agregar cargo
                                        </p>
                                        <div className="space-y-2">
                                            <input value={chargeLabel} onChange={e => setChargeLabel(e.target.value)} placeholder="Ej: Multa por ruidos molestos"
                                                className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} inputMode="numeric" placeholder="Monto"
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                                <select value={chargeKind} onChange={e => setChargeKind(e.target.value)}
                                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                                    <option value="fine">Multa</option>
                                                    <option value="extraordinary">Extraordinario</option>
                                                    <option value="service">Servicio</option>
                                                    <option value="other">Otro</option>
                                                </select>
                                            </div>
                                            <Button type="button" onClick={() => void submitCharge()} disabled={busy} className="w-full"
                                                style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}>
                                                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agregar cargo"}
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </section>
                )}
            </motion.div>
        </ErrorBoundary>
    );
}
