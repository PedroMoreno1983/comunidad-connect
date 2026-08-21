"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Wand2, Plus, Check, Undo2, EyeOff, Trash2 } from "lucide-react";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import type { MatchSuggestion } from "@/lib/finance/reconciliation";
import type { ReconciliationView } from "@/lib/finance/reconciliationService";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = () => new Date().toISOString().slice(0, 10);

export default function ConciliacionPage() {
    const { toast } = useToast();
    const [data, setData] = useState<ReconciliationView | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState({ txnDate: today(), amount: "", description: "", reference: "" });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await fetch("/api/admin/bank-reconciliation", { cache: "no-store" });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "No se pudo cargar la conciliación.");
            setData(payload);
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    const suggestionByTxn = useMemo(() => {
        const map = new Map<string, MatchSuggestion>();
        for (const suggestion of data?.suggestions ?? []) map.set(suggestion.transactionId, suggestion);
        return map;
    }, [data]);

    async function post(body: Record<string, unknown>, okMessage?: string) {
        setBusy(true);
        try {
            const response = await fetch("/api/admin/bank-reconciliation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || "No se pudo procesar.");
            if (okMessage) toast({ title: okMessage, variant: "success" });
            await load();
            return payload;
        } catch (error) {
            toast({ title: "No se pudo", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    async function addTransaction(event: React.FormEvent) {
        event.preventDefault();
        const amount = Number(form.amount.replace(/[^\d-]/g, ""));
        if (!Number.isFinite(amount) || amount === 0) {
            toast({ title: "Monto inválido", description: "Usa un monto distinto de cero (negativo para egresos).", variant: "destructive" });
            return;
        }
        const result = await post({
            action: "import",
            rows: [{ txnDate: form.txnDate, amount, description: form.description, reference: form.reference }],
        });
        if (result) {
            if (result.imported > 0) toast({ title: "Movimiento agregado", variant: "success" });
            else toast({ title: "Ese movimiento ya estaba cargado", variant: "default" });
            setForm({ txnDate: today(), amount: "", description: "", reference: "" });
        }
    }

    async function autoReconcile() {
        const result = await post({ action: "auto" });
        if (result) {
            toast({
                title: result.applied > 0 ? `${result.applied} movimiento(s) conciliado(s)` : "Nada que conciliar automáticamente",
                description: result.suggested > result.applied ? `${result.suggested - result.applied} sugerencia(s) quedaron por resolver a mano.` : undefined,
                variant: result.applied > 0 ? "success" : "default",
            });
        }
    }

    const statusChip = (status: string) => {
        const map: Record<string, { bg: string; fg: string; label: string }> = {
            matched: { bg: "var(--cc-success-bg)", fg: "var(--cc-success-fg)", label: "Conciliado" },
            pending: { bg: "var(--cc-warning-bg)", fg: "var(--cc-warning-fg)", label: "Pendiente" },
            ignored: { bg: "var(--cc-paper-warm)", fg: "var(--cc-ink-tertiary)", label: "Ignorado" },
        };
        const s = map[status] || map.pending;
        return <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>{s.label}</span>;
    };

    return (
        <ErrorBoundary name="Conciliación bancaria">
            <div className="mx-auto max-w-6xl space-y-7 px-4 py-8 sm:px-6">
                <div>
                    <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm font-semibold cc-text-secondary transition-colors hover:text-brand-700">
                        <ArrowLeft className="h-4 w-4" /> Volver a Finanzas
                    </Link>
                    <div className="mt-3 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
                        <div>
                            <Eyebrow>Recaudación</Eyebrow>
                            <DisplayHeading size={32} className="mt-2">Conciliación bancaria</DisplayHeading>
                            <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                                Cruza los movimientos de la cartola del banco con los pagos que registraste. Detecta depósitos sin imputar y confirma que la caja cuadra.
                            </p>
                        </div>
                        <Button variant="outline" onClick={autoReconcile} disabled={busy || loading}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                            Conciliar automáticamente
                        </Button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex items-center gap-3 p-12 text-sm cc-text-secondary"><Loader2 className="h-5 w-5 animate-spin" /> Cargando…</div>
                ) : data ? (
                    <>
                        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                            {[
                                { label: "Movimientos", value: data.summary.totalTransactions },
                                { label: "Conciliados", value: data.summary.matched },
                                { label: "Pendientes", value: data.summary.pending },
                                { label: "Depósitos sin imputar", value: data.summary.unexplainedDeposits, alert: data.summary.unexplainedDeposits > 0 },
                            ].map(card => (
                                <div key={card.label} className="rounded-xl border p-4" style={{ borderColor: card.alert ? "var(--cc-warning-border)" : "var(--cc-line)", background: "var(--cc-paper)" }}>
                                    <p className="text-3xl font-semibold" style={{ fontFamily: "var(--cc-font-display)", color: card.alert ? "var(--cc-warning-fg)" : "var(--cc-ink)" }}>{card.value}</p>
                                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.1em] cc-text-tertiary">{card.label}</p>
                                </div>
                            ))}
                        </section>

                        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <h2 className="mb-3 font-semibold cc-text-primary">Agregar movimiento de la cartola</h2>
                            <form onSubmit={addTransaction} className="grid gap-3 sm:grid-cols-[130px_120px_1fr_130px_auto]">
                                <input type="date" value={form.txnDate} onChange={e => setForm({ ...form, txnDate: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                <input inputMode="numeric" placeholder="Monto" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                <input placeholder="Glosa / descripción" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                <input placeholder="N° operación" value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} className="h-10 rounded-lg border px-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                <Button type="submit" disabled={busy}><Plus className="mr-1.5 h-4 w-4" /> Agregar</Button>
                            </form>
                            <p className="mt-2 text-xs cc-text-tertiary">Monto positivo para ingresos (abonos), negativo para egresos. La conciliación cruza los ingresos contra tus pagos registrados.</p>
                        </section>

                        <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="border-b p-4" style={{ borderColor: "var(--cc-line)" }}>
                                <h2 className="font-semibold cc-text-primary">Movimientos</h2>
                            </div>
                            {data.transactions.length === 0 ? (
                                <p className="p-8 text-center text-sm cc-text-tertiary">No hay movimientos cargados. Agrega los de tu cartola arriba.</p>
                            ) : (
                                <div className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                    {data.transactions.map(txn => {
                                        const suggestion = suggestionByTxn.get(txn.id);
                                        const isInflow = txn.amount > 0;
                                        return (
                                            <div key={txn.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold cc-text-primary" style={{ color: isInflow ? "var(--cc-ink)" : "var(--cc-danger-fg, #b4402f)" }}>{isInflow ? "+" : ""}{money(txn.amount)}</span>
                                                        {statusChip(txn.status)}
                                                    </div>
                                                    <p className="mt-0.5 truncate text-sm cc-text-secondary">{txn.txnDate} · {txn.description || "Sin glosa"}{txn.reference ? ` · ${txn.reference}` : ""}</p>
                                                    {suggestion && txn.status === "pending" && (
                                                        <p className="mt-1 text-xs" style={{ color: "var(--cc-success-fg)" }}>
                                                            Sugerencia: pago de {data.unmatchedPayments.find(p => p.id === suggestion.paymentId)?.unitLabel ?? "unidad"}{suggestion.referenceMatch ? " (referencia coincide)" : ` (${suggestion.dayGap} día(s) de diferencia)`}
                                                        </p>
                                                    )}
                                                </div>
                                                <div className="flex flex-none items-center gap-2">
                                                    {txn.status === "matched" ? (
                                                        <Button variant="ghost" size="sm" onClick={() => post({ action: "unmatch", transactionId: txn.id }, "Conciliación deshecha")} disabled={busy}>
                                                            <Undo2 className="mr-1.5 h-4 w-4" /> Deshacer
                                                        </Button>
                                                    ) : txn.status === "ignored" ? (
                                                        <Button variant="ghost" size="sm" onClick={() => post({ action: "unignore", transactionId: txn.id })} disabled={busy}>Reactivar</Button>
                                                    ) : isInflow ? (
                                                        <>
                                                            {suggestion && (
                                                                <Button size="sm" onClick={() => post({ action: "match", transactionId: txn.id, paymentId: suggestion.paymentId }, "Conciliado")} disabled={busy}>
                                                                    <Check className="mr-1.5 h-4 w-4" /> Conciliar
                                                                </Button>
                                                            )}
                                                            <select
                                                                defaultValue=""
                                                                onChange={e => { if (e.target.value) post({ action: "match", transactionId: txn.id, paymentId: e.target.value }, "Conciliado"); }}
                                                                disabled={busy}
                                                                className="h-9 rounded-lg border px-2 text-xs"
                                                                style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                                            >
                                                                <option value="">Elegir pago…</option>
                                                                {data.unmatchedPayments.map(p => (
                                                                    <option key={p.id} value={p.id}>{p.unitLabel} · {money(p.amount)} · {p.paidAt}</option>
                                                                ))}
                                                            </select>
                                                            <Button variant="ghost" size="sm" onClick={() => post({ action: "ignore", transactionId: txn.id })} disabled={busy} title="Ignorar">
                                                                <EyeOff className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    ) : (
                                                        <Button variant="ghost" size="sm" onClick={() => post({ action: "ignore", transactionId: txn.id })} disabled={busy} title="Ignorar">
                                                            <EyeOff className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            if (busy) return;
                                                            setBusy(true);
                                                            try {
                                                                const r = await fetch(`/api/admin/bank-reconciliation?id=${txn.id}`, { method: "DELETE" });
                                                                const p = await r.json();
                                                                if (!r.ok) throw new Error(p.error || "No se pudo eliminar.");
                                                                await load();
                                                            } catch (error) {
                                                                toast({ title: "No se eliminó", description: error instanceof Error ? error.message : "Error", variant: "destructive" });
                                                            } finally { setBusy(false); }
                                                        }}
                                                        title="Eliminar movimiento"
                                                        className="rounded-lg p-2 cc-text-tertiary transition-colors hover:text-[var(--cc-danger-fg,#b4402f)]"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </section>

                        {data.unmatchedPayments.length > 0 && (
                            <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <h2 className="mb-1 font-semibold cc-text-primary">Pagos registrados sin conciliar ({data.unmatchedPayments.length})</h2>
                                <p className="mb-3 text-xs cc-text-tertiary">Pagos que ya cargaste pero que todavía no aparecen cruzados con un movimiento del banco.</p>
                                <div className="flex flex-wrap gap-2">
                                    {data.unmatchedPayments.map(p => (
                                        <span key={p.id} className="rounded-lg border px-3 py-1.5 text-xs" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                            <b>{p.unitLabel}</b> · {money(p.amount)} · {p.paidAt}{p.reference ? ` · ${p.reference}` : ""}
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                ) : null}
            </div>
        </ErrorBoundary>
    );
}
