"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Loader2, Plus, Send, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";

const CATEGORIES = [
    { value: "electricity", label: "Electricidad" },
    { value: "water", label: "Agua" },
    { value: "salaries", label: "Remuneraciones" },
    { value: "maintenance", label: "Mantención" },
    { value: "security", label: "Seguridad" },
    { value: "other", label: "Otros" },
] as const;

interface CommunityExpense {
    id: string;
    category: string;
    label: string;
    amount: number;
    provider: string | null;
    prorate_method: "share" | "equal";
}

interface IssuedRun {
    id: string;
    total_amount: number;
    units_count: number;
    due_date: string;
    issued_at: string;
}

interface PreviewUnit {
    unitId: string;
    label: string;
    sharePermille: number | null;
    total: number;
}

interface Preview {
    unitCount: number;
    totalExpenses: number;
    totalCharged: number;
    fellBackToEqualSplit: boolean;
    warnings: string[];
    units: PreviewUnit[];
}

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const currentMonth = () => new Date().toISOString().slice(0, 7);
const defaultDueDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1, 5);
    return date.toISOString().slice(0, 10);
};

export default function EgresosPage() {
    const { toast } = useToast();
    const [month, setMonth] = useState(currentMonth);
    const [dueDate, setDueDate] = useState(defaultDueDate);
    const [expenses, setExpenses] = useState<CommunityExpense[]>([]);
    const [issuedRun, setIssuedRun] = useState<IssuedRun | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [issuing, setIssuing] = useState(false);

    const [label, setLabel] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState<string>("other");
    const [prorateMethod, setProrateMethod] = useState<"share" | "equal">("share");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [expensesRes, previewRes] = await Promise.all([
                fetch(`/api/admin/community-expenses?month=${month}`, { cache: "no-store" }),
                fetch(`/api/admin/billing?month=${month}`, { cache: "no-store" }),
            ]);
            const expensesData = await expensesRes.json();
            const previewData = await previewRes.json();
            if (!expensesRes.ok) throw new Error(expensesData.error || "No se pudieron cargar los egresos.");

            setExpenses(expensesData.expenses || []);
            setIssuedRun(expensesData.issuedRun || null);
            setPreview(previewRes.ok ? previewData : null);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo cargar el mes.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [month, toast]);

    useEffect(() => { void load(); }, [load]);

    async function addExpense(event: React.FormEvent) {
        event.preventDefault();
        const parsed = Number(amount.replace(/[^\d]/g, ""));
        if (!label.trim() || !Number.isFinite(parsed) || parsed <= 0) {
            toast({ title: "Datos incompletos", description: "Escribe una descripción y un monto mayor que cero.", variant: "destructive" });
            return;
        }

        setSaving(true);
        try {
            const response = await fetch("/api/admin/community-expenses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, label: label.trim(), amount: parsed, category, prorateMethod }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo registrar el egreso.");

            setLabel("");
            setAmount("");
            await load();
        } catch (error) {
            toast({
                title: "No se registró",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

    async function removeExpense(id: string) {
        try {
            const response = await fetch(`/api/admin/community-expenses?id=${id}`, { method: "DELETE" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo eliminar.");
            await load();
        } catch (error) {
            toast({
                title: "No se eliminó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        }
    }

    async function issue() {
        setIssuing(true);
        try {
            const response = await fetch("/api/admin/billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ month, dueDate }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo emitir.");

            const skipped = (data.skippedUnits || []).length;
            toast({
                title: "Gasto común emitido",
                description: `${data.issuedUnits} unidades por ${money(data.totalCharged)}. `
                    + `${data.notified} residentes notificados.`
                    + (skipped > 0 ? ` ${skipped} unidad(es) se omitieron por tener un cobro previo.` : ""),
                variant: "success",
            });
            await load();
        } catch (error) {
            toast({
                title: "No se emitió",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setIssuing(false);
        }
    }

    async function cancelRun() {
        if (!issuedRun) return;
        try {
            const response = await fetch(`/api/admin/billing?runId=${issuedRun.id}`, { method: "DELETE" });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo anular.");
            toast({ title: "Emisión anulada", description: `${month} vuelve a quedar editable.`, variant: "default" });
            await load();
        } catch (error) {
            toast({
                title: "No se anuló",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        }
    }

    const total = expenses.reduce((sum, item) => sum + Number(item.amount), 0);

    return (
        <ErrorBoundary name="Egresos y emisión">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6"
            >
                <div>
                    <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
                    </Link>
                    <header className="mt-4">
                        <Eyebrow className="mb-2">Gasto común</Eyebrow>
                        <DisplayHeading size={32}>Egresos y emisión del mes</DisplayHeading>
                        <p className="mt-2 text-sm leading-6 cc-text-secondary">
                            Carga los gastos del edificio, revisa cómo se reparten entre las
                            unidades y emite el cobro de todas de una vez.
                        </p>
                    </header>
                </div>

                <div className="flex flex-wrap items-end gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <label className="text-sm">
                        <span className="mb-1 block font-semibold cc-text-primary">Periodo</span>
                        <input
                            type="month"
                            value={month}
                            onChange={event => setMonth(event.target.value)}
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                        />
                    </label>
                    <label className="text-sm">
                        <span className="mb-1 block font-semibold cc-text-primary">Vence el</span>
                        <input
                            type="date"
                            value={dueDate}
                            onChange={event => setDueDate(event.target.value)}
                            className="rounded-lg border px-3 py-2 text-sm"
                            style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                        />
                    </label>
                    <div className="ml-auto text-right">
                        <p className="text-xs cc-text-tertiary">Total egresos del mes</p>
                        <p className="text-2xl font-bold cc-text-primary">{money(total)}</p>
                    </div>
                </div>

                {issuedRun && (
                    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-success-border bg-success-bg p-4">
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success-fg" />
                        <div className="flex-1">
                            <p className="font-semibold cc-text-primary">Gasto común de {month} ya emitido</p>
                            <p className="mt-1 text-sm cc-text-secondary">
                                {issuedRun.units_count} unidades por {money(issuedRun.total_amount)}, con vencimiento {issuedRun.due_date}.
                                Para corregir los egresos, primero anula la emisión.
                            </p>
                        </div>
                        <Button type="button" onClick={() => void cancelRun()} className="text-xs" style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}>
                            Anular emisión
                        </Button>
                    </div>
                )}

                {!issuedRun && (
                    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Agregar egreso
                        </h2>
                        <form onSubmit={addExpense} className="mt-4 grid gap-3 sm:grid-cols-[1fr_140px_160px_150px_auto]">
                            <input
                                value={label}
                                onChange={event => setLabel(event.target.value)}
                                placeholder="Ej: Cuenta de electricidad"
                                className="rounded-lg border px-3 py-2 text-sm"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                            />
                            <input
                                value={amount}
                                onChange={event => setAmount(event.target.value)}
                                inputMode="numeric"
                                placeholder="Monto"
                                className="rounded-lg border px-3 py-2 text-sm"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                            />
                            <select
                                value={category}
                                onChange={event => setCategory(event.target.value)}
                                className="rounded-lg border px-3 py-2 text-sm"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                            >
                                {CATEGORIES.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
                            </select>
                            <select
                                value={prorateMethod}
                                onChange={event => setProrateMethod(event.target.value as "share" | "equal")}
                                className="rounded-lg border px-3 py-2 text-sm"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                            >
                                <option value="share">Por alícuota</option>
                                <option value="equal">Partes iguales</option>
                            </select>
                            <Button type="submit" disabled={saving} className="text-white" style={{ background: "var(--cc-ink)" }}>
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                            </Button>
                        </form>
                    </section>
                )}

                <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="border-b px-5 py-4 font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", fontFamily: "var(--cc-font-display)" }}>
                        Egresos de {month}
                    </h2>
                    {loading ? (
                        <p className="p-6 text-center text-sm cc-text-secondary">Cargando…</p>
                    ) : expenses.length === 0 ? (
                        <p className="p-6 text-center text-sm cc-text-secondary">
                            Aún no hay egresos cargados para este mes.
                        </p>
                    ) : (
                        <ul className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                            {expenses.map(item => (
                                <li key={item.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-sm font-semibold cc-text-primary">{item.label}</p>
                                        <p className="text-xs cc-text-tertiary">
                                            {CATEGORIES.find(c => c.value === item.category)?.label || item.category}
                                            {" · "}
                                            {item.prorate_method === "equal" ? "Partes iguales" : "Por alícuota"}
                                        </p>
                                    </div>
                                    <span className="text-sm font-semibold cc-text-primary">{money(item.amount)}</span>
                                    {!issuedRun && (
                                        <button
                                            type="button"
                                            onClick={() => void removeExpense(item.id)}
                                            aria-label={`Eliminar ${item.label}`}
                                            className="rounded-lg p-2 cc-text-tertiary hover:bg-[var(--cc-paper-warm)]"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {preview && preview.units.length > 0 && total > 0 && (
                    <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="flex items-center gap-2 border-b px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                            <Calculator className="h-4 w-4 cc-text-tertiary" />
                            <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Cómo queda el reparto
                            </h2>
                        </div>

                        {preview.warnings.length > 0 && (
                            <div className="flex items-start gap-3 border-b border-warning-border bg-warning-bg p-4" style={{ borderColor: "var(--cc-line)" }}>
                                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-fg" />
                                <ul className="space-y-1 text-sm cc-text-secondary">
                                    {preview.warnings.map(warning => <li key={warning}>{warning}</li>)}
                                </ul>
                            </div>
                        )}

                        <div className="max-h-80 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0" style={{ background: "var(--cc-paper-warm)" }}>
                                    <tr>
                                        <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Unidad</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Alícuota</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">A cobrar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                    {preview.units.map(unit => (
                                        <tr key={unit.unitId}>
                                            <td className="px-5 py-2 cc-text-primary">{unit.label}</td>
                                            <td className="px-5 py-2 text-right cc-text-tertiary">
                                                {unit.sharePermille === null ? "—" : `${unit.sharePermille}‰`}
                                            </td>
                                            <td className="px-5 py-2 text-right font-semibold cc-text-primary">{money(unit.total)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="text-sm">
                                <p className="cc-text-secondary">
                                    {preview.unitCount} unidades · Total a cobrar{" "}
                                    <strong className="cc-text-primary">{money(preview.totalCharged)}</strong>
                                </p>
                                {preview.totalCharged === preview.totalExpenses ? (
                                    <p className="text-xs text-success-fg">Cuadra exactamente con los egresos del mes.</p>
                                ) : (
                                    <p className="text-xs text-danger-fg">
                                        Descuadre: egresos {money(preview.totalExpenses)} vs cobrado {money(preview.totalCharged)}.
                                    </p>
                                )}
                            </div>
                            {!issuedRun && (
                                <Button
                                    type="button"
                                    disabled={issuing || preview.totalCharged !== preview.totalExpenses}
                                    onClick={() => void issue()}
                                    className="text-white"
                                    style={{ background: "var(--cc-ink)" }}
                                >
                                    {issuing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    Emitir a {preview.unitCount} unidades
                                </Button>
                            )}
                        </div>
                    </section>
                )}
            </motion.div>
        </ErrorBoundary>
    );
}
