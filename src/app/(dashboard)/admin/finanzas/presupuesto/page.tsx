"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Target } from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import type { BudgetComparison, BudgetLine } from "@/lib/finance/reportingService";

const CATEGORIES = [
    { value: "electricity", label: "Electricidad" },
    { value: "water", label: "Agua" },
    { value: "salaries", label: "Remuneraciones" },
    { value: "maintenance", label: "Mantención" },
    { value: "security", label: "Seguridad" },
    { value: "other", label: "Otros" },
] as const;

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;

export default function PresupuestoPage() {
    const { toast } = useToast();
    const [year, setYear] = useState(() => new Date().getFullYear());
    const [data, setData] = useState<BudgetComparison | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [drafts, setDrafts] = useState<Record<string, string>>({});

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/admin/budget?year=${year}`, { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "No se pudo cargar el presupuesto.");
            setData(payload);

            const next: Record<string, string> = {};
            for (const category of CATEGORIES) {
                const line = payload.lines.find((item: BudgetLine) => item.category === category.value);
                next[category.value] = String(line?.annualBudget ?? 0);
            }
            setDrafts(next);
        } catch (error) {
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [year, toast]);

    useEffect(() => { void load(); }, [load]);

    async function saveLine(category: string) {
        const annualAmount = Number((drafts[category] || "0").replace(/[^\d]/g, ""));
        setSaving(true);
        try {
            const response = await fetch("/api/admin/budget", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ year, category, annualAmount }),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "No se pudo guardar.");
            await load();
        } catch (error) {
            toast({
                title: "No se guardó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <ErrorBoundary name="Presupuesto anual">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <div>
                    <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
                    </Link>
                    <header className="mt-4 flex flex-wrap items-end justify-between gap-4">
                        <div>
                            <Eyebrow className="mb-2">Planificación</Eyebrow>
                            <DisplayHeading size={32}>Presupuesto anual</DisplayHeading>
                            <p className="mt-2 text-sm leading-6 cc-text-secondary">
                                Lo que la asamblea aprobó para el año, comparado con lo que efectivamente
                                se lleva gastado.
                            </p>
                        </div>
                        <label className="text-sm">
                            <span className="mb-1 block font-semibold cc-text-primary">Año</span>
                            <input type="number" value={year} min={2020} max={2100}
                                onChange={e => setYear(Number(e.target.value))}
                                className="w-28 rounded-lg border px-3 py-2 text-sm"
                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                        </label>
                    </header>
                </div>

                {data && (
                    <div className="rounded-2xl border p-4 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                        <p className="cc-text-secondary">
                            Van <strong className="cc-text-primary">{data.monthsElapsed}</strong> de 12 meses del año.
                            La comparación usa el presupuesto proporcional a ese avance, no el anual completo:
                            gastar el 25% en marzo no es una desviación.
                        </p>
                    </div>
                )}

                <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="flex items-center gap-2 border-b px-5 py-4 font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line)", fontFamily: "var(--cc-font-display)" }}>
                        <Target className="h-4 w-4" /> Presupuestado vs real
                    </h2>

                    {loading ? (
                        <p className="p-6 text-center text-sm cc-text-secondary">Cargando…</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead style={{ background: "var(--cc-paper-warm)" }}>
                                    <tr>
                                        <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Categoría</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Presupuesto anual</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Esperado a hoy</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Real a hoy</th>
                                        <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Desviación</th>
                                        <th className="px-5 py-2" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                    {CATEGORIES.map(category => {
                                        const line = data?.lines.find(item => item.category === category.value);
                                        const actual = line?.actualToDate ?? 0;
                                        const expected = line?.expectedToDate ?? 0;
                                        const variance = line?.variance ?? 0;
                                        return (
                                            <tr key={category.value}>
                                                <td className="px-5 py-2 font-medium cc-text-primary">{category.label}</td>
                                                <td className="px-5 py-2 text-right">
                                                    <input
                                                        value={drafts[category.value] ?? "0"}
                                                        onChange={e => setDrafts(prev => ({ ...prev, [category.value]: e.target.value }))}
                                                        inputMode="numeric"
                                                        className="w-32 rounded-lg border px-2 py-1 text-right text-sm"
                                                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                                    />
                                                </td>
                                                <td className="px-5 py-2 text-right cc-text-tertiary">{money(expected)}</td>
                                                <td className="px-5 py-2 text-right cc-text-primary">{money(actual)}</td>
                                                <td className="px-5 py-2 text-right">
                                                    {expected === 0 && actual === 0 ? (
                                                        <span className="text-xs cc-text-tertiary">—</span>
                                                    ) : (
                                                        <span className={`text-xs font-semibold ${variance > 0 ? "text-danger-fg" : "text-success-fg"}`}>
                                                            {variance > 0 ? "+" : ""}{money(variance)}
                                                            {expected > 0 && ` (${line?.variancePercent}%)`}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-5 py-2 text-right">
                                                    <button
                                                        type="button"
                                                        onClick={() => void saveLine(category.value)}
                                                        disabled={saving}
                                                        className="text-xs font-semibold underline cc-text-secondary"
                                                    >
                                                        Guardar
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                {data && (
                                    <tfoot>
                                        <tr style={{ background: "var(--cc-paper-warm)" }}>
                                            <td className="px-5 py-3 font-bold cc-text-primary">Total</td>
                                            <td className="px-5 py-3 text-right font-bold cc-text-primary">{money(data.totals.annualBudget)}</td>
                                            <td className="px-5 py-3 text-right cc-text-secondary">{money(data.totals.expectedToDate)}</td>
                                            <td className="px-5 py-3 text-right font-bold cc-text-primary">{money(data.totals.actualToDate)}</td>
                                            <td className="px-5 py-3 text-right">
                                                <span className={`text-xs font-bold ${data.totals.variance > 0 ? "text-danger-fg" : "text-success-fg"}`}>
                                                    {data.totals.variance > 0 ? "+" : ""}{money(data.totals.variance)}
                                                </span>
                                            </td>
                                            <td />
                                        </tr>
                                    </tfoot>
                                )}
                            </table>
                        </div>
                    )}

                    {saving && (
                        <p className="flex items-center justify-center gap-2 border-t px-5 py-3 text-xs cc-text-tertiary" style={{ borderColor: "var(--cc-line)" }}>
                            <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                        </p>
                    )}
                </section>
            </motion.div>
        </ErrorBoundary>
    );
}
