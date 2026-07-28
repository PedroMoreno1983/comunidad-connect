"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Landmark, Loader2, Settings2, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";

interface Report {
    month: string;
    expenses: { total: number; byCategory: Array<{ category: string; total: number }> };
    charged: { gastoComun: number; otherCharges: number; total: number };
    collected: { total: number; byMethod: Array<{ method: string; total: number }> };
    collectionRate: number;
    result: number;
}

interface Fund {
    balance: number;
    totalContributions: number;
    totalWithdrawals: number;
    movements: Array<{ id: string; kind: string; amount: number; month: string; label: string }>;
}

interface Settings {
    lateInterestMonthlyRate: number;
    reserveFundRate: number;
}

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function RendicionPage() {
    const { toast } = useToast();
    const [month, setMonth] = useState(currentMonth);
    const [report, setReport] = useState<Report | null>(null);
    const [fund, setFund] = useState<Fund | null>(null);
    const [settings, setSettings] = useState<Settings | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);

    const [lateRate, setLateRate] = useState("0");
    const [reserveRate, setReserveRate] = useState("0");
    const [moveLabel, setMoveLabel] = useState("");
    const [moveAmount, setMoveAmount] = useState("");
    const [moveKind, setMoveKind] = useState<"contribution" | "withdrawal">("withdrawal");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/finance-report?month=${month}`, { cache: "no-store" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo cargar la rendición.");
            setReport(data.report);
            setFund(data.fund);
            setSettings(data.settings);
            setLateRate(String(data.settings.lateInterestMonthlyRate));
            setReserveRate(String(data.settings.reserveFundRate));
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [month, toast]);

    useEffect(() => { void load(); }, [load]);

    async function saveSettings() {
        setBusy(true);
        try {
            const response = await fetch("/api/admin/finance-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "update_settings",
                    lateInterestMonthlyRate: Number(lateRate),
                    reserveFundRate: Number(reserveRate),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo guardar.");
            toast({ title: "Configuración guardada", description: "Se aplicará en las próximas emisiones.", variant: "success" });
            await load();
        } catch (error) {
            toast({
                title: "No se guardó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function addMovement() {
        const amount = Number(moveAmount.replace(/[^\d]/g, ""));
        if (!moveLabel.trim() || !Number.isFinite(amount) || amount <= 0) {
            toast({ title: "Datos incompletos", description: "Escribe una descripción y un monto.", variant: "destructive" });
            return;
        }

        setBusy(true);
        try {
            const response = await fetch("/api/admin/finance-report", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: moveKind, amount, month, label: moveLabel.trim() }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo registrar.");
            toast({ title: "Movimiento registrado", description: `${money(amount)} en el fondo.`, variant: "success" });
            setMoveLabel("");
            setMoveAmount("");
            await load();
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

    return (
        <ErrorBoundary name="Rendición de cuentas">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <div>
                    <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
                    </Link>
                    <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <Eyebrow className="mb-2">Cierre del periodo</Eyebrow>
                            <DisplayHeading size={32}>Rendición de cuentas</DisplayHeading>
                            <p className="mt-2 text-sm leading-6 cc-text-secondary">
                                Qué se cobró, qué se recaudó y en qué se gastó. El informe que el comité revisa y firma.
                            </p>
                        </div>
                        <label className="text-sm">
                            <span className="mb-1 block font-semibold cc-text-primary">Periodo</span>
                            <input type="month" value={month} onChange={e => setMonth(e.target.value)}
                                className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                        </label>
                    </header>
                </div>

                {loading ? (
                    <p className="p-10 text-center text-sm cc-text-secondary">Cargando…</p>
                ) : !report ? null : (
                    <>
                        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                { label: "Cobrado", value: money(report.charged.total), hint: `Gasto común + cargos` },
                                { label: "Recaudado", value: money(report.collected.total), hint: `${report.collectionRate}% de lo cobrado` },
                                { label: "Egresos", value: money(report.expenses.total), hint: "del edificio" },
                                {
                                    label: "Resultado",
                                    value: money(report.result),
                                    hint: report.result >= 0 ? "recaudado sobre egresos" : "déficit del periodo",
                                },
                            ].map(card => (
                                <div key={card.label} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                    <p className="text-xs font-semibold uppercase tracking-wider cc-text-tertiary">{card.label}</p>
                                    <p className="mt-2 text-2xl font-bold cc-text-primary">{card.value}</p>
                                    <p className="mt-1 text-xs cc-text-tertiary">{card.hint}</p>
                                </div>
                            ))}
                        </section>

                        <div className="grid gap-6 md:grid-cols-2">
                            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", fontFamily: "var(--cc-font-display)" }}>
                                    <TrendingDown className="h-4 w-4" /> Egresos por categoría
                                </h2>
                                {report.expenses.byCategory.length === 0 ? (
                                    <p className="p-6 text-center text-sm cc-text-secondary">Sin egresos cargados este mes.</p>
                                ) : (
                                    <ul className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                        {report.expenses.byCategory.map(row => (
                                            <li key={row.category} className="flex items-center justify-between px-5 py-3 text-sm">
                                                <span className="cc-text-primary">{row.category}</span>
                                                <span className="font-semibold cc-text-primary">{money(row.total)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>

                            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", fontFamily: "var(--cc-font-display)" }}>
                                    <TrendingUp className="h-4 w-4" /> Recaudación por medio
                                </h2>
                                {report.collected.byMethod.length === 0 ? (
                                    <p className="p-6 text-center text-sm cc-text-secondary">Sin pagos registrados este mes.</p>
                                ) : (
                                    <ul className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                        {report.collected.byMethod.map(row => (
                                            <li key={row.method} className="flex items-center justify-between px-5 py-3 text-sm">
                                                <span className="cc-text-primary">{row.method}</span>
                                                <span className="font-semibold cc-text-primary">{money(row.total)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        </div>

                        {fund && (
                            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <h2 className="flex items-center gap-2 font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                        <Landmark className="h-4 w-4" /> Fondo de reserva
                                    </h2>
                                    <div className="text-right">
                                        <p className="text-xs cc-text-tertiary">Saldo acumulado</p>
                                        <p className="text-xl font-bold cc-text-primary">{money(fund.balance)}</p>
                                    </div>
                                </div>

                                <p className="px-5 pt-4 text-xs leading-5 cc-text-tertiary">
                                    Exigido por la Ley 21.442. Se alimenta con un porcentaje de cada emisión del
                                    gasto común y se lleva aparte de los egresos corrientes.
                                    Aportes: {money(fund.totalContributions)} · Retiros: {money(fund.totalWithdrawals)}
                                </p>

                                <div className="grid gap-2 p-5 sm:grid-cols-[1fr_140px_150px_auto]">
                                    <input value={moveLabel} onChange={e => setMoveLabel(e.target.value)} placeholder="Ej: Reparación de bomba de agua"
                                        className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                    <input value={moveAmount} onChange={e => setMoveAmount(e.target.value)} inputMode="numeric" placeholder="Monto"
                                        className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                    <select value={moveKind} onChange={e => setMoveKind(e.target.value as "contribution" | "withdrawal")}
                                        className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                        <option value="withdrawal">Uso del fondo</option>
                                        <option value="contribution">Aporte extra</option>
                                    </select>
                                    <Button type="button" onClick={() => void addMovement()} disabled={busy} className="text-white" style={{ background: "var(--cc-ink)" }}>
                                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
                                    </Button>
                                </div>

                                {fund.movements.length > 0 && (
                                    <ul className="divide-y border-t" style={{ borderColor: "var(--cc-line)" }}>
                                        {fund.movements.slice(0, 8).map(movement => (
                                            <li key={movement.id} className="flex items-center justify-between px-5 py-3 text-sm">
                                                <div>
                                                    <p className="cc-text-primary">{movement.label}</p>
                                                    <p className="text-xs cc-text-tertiary">{movement.month}</p>
                                                </div>
                                                <span className={`font-semibold ${movement.kind === "contribution" ? "text-success-fg" : "text-danger-fg"}`}>
                                                    {movement.kind === "contribution" ? "+" : "−"}{money(movement.amount)}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </section>
                        )}

                        {settings && (
                            <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <h2 className="flex items-center gap-2 font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    <Settings2 className="h-4 w-4" /> Configuración financiera
                                </h2>
                                <p className="mt-2 text-xs leading-5 cc-text-tertiary">
                                    Ambas van en 0 por defecto: sin una decisión explícita tuya, no se le cobra
                                    interés a nadie ni se desvía plata a un fondo aparte.
                                </p>
                                <div className="mt-4 grid gap-3 sm:grid-cols-[200px_200px_auto]">
                                    <label className="text-sm">
                                        <span className="mb-1 block cc-text-secondary">Interés por mora (% mensual)</span>
                                        <input value={lateRate} onChange={e => setLateRate(e.target.value)} inputMode="decimal"
                                            className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                    </label>
                                    <label className="text-sm">
                                        <span className="mb-1 block cc-text-secondary">Aporte al fondo (%)</span>
                                        <input value={reserveRate} onChange={e => setReserveRate(e.target.value)} inputMode="decimal"
                                            className="w-full rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                    </label>
                                    <div className="flex items-end">
                                        <Button type="button" onClick={() => void saveSettings()} disabled={busy} className="text-white" style={{ background: "var(--cc-ink)" }}>
                                            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
                                        </Button>
                                    </div>
                                </div>
                            </section>
                        )}
                    </>
                )}
            </motion.div>
        </ErrorBoundary>
    );
}
