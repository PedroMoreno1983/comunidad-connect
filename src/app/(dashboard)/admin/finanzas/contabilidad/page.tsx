"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminFinanceService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import type { JournalView } from "@/lib/types";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = () => new Date().toISOString().slice(0, 10);

const FALLBACK_ACCOUNTS = [
    { code: "1100", name: "Banco" },
    { code: "4100", name: "Ingresos por gastos comunes" },
    { code: "5100", name: "Remuneraciones" },
    { code: "5200", name: "Gastos de operación" },
];

const SOURCE_LABEL: Record<string, string> = {
    manual: "Manual",
    agreement: "Convenio",
    payroll: "Remuneración",
};

interface DraftLine {
    code: string;
    side: "debit" | "credit";
    amount: string;
}

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

export default function ContabilidadPage() {
    const { toast } = useToast();
    const [journal, setJournal] = useState<JournalView | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [entryDate, setEntryDate] = useState(today);
    const [memo, setMemo] = useState("");
    const [lines, setLines] = useState<DraftLine[]>([
        { code: "5200", side: "debit", amount: "" },
        { code: "1100", side: "credit", amount: "" },
    ]);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setJournal(await AdminFinanceService.getJournal());
        } catch (error) {
            toast({
                title: "No se cargó el libro",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    const accounts = journal?.accounts.length
        ? journal.accounts.map(account => ({ code: account.code, name: account.name }))
        : FALLBACK_ACCOUNTS;

    function updateLine(index: number, patch: Partial<DraftLine>) {
        setLines(current => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
    }

    async function saveEntry(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await AdminFinanceService.postJournalEntry({
                entryDate,
                memo,
                lines: lines.map(line => {
                    const amount = Number(line.amount.replace(/[^\d]/g, "")) || 0;
                    return {
                        code: line.code,
                        debit: line.side === "debit" ? amount : 0,
                        credit: line.side === "credit" ? amount : 0,
                    };
                }),
            });
            toast({ title: "Asiento guardado", description: "El debe y el haber quedaron cuadrados.", variant: "success" });
            setMemo("");
            setLines([
                { code: "5200", side: "debit", amount: "" },
                { code: "1100", side: "credit", amount: "" },
            ]);
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

    return (
        <ErrorBoundary name="Contabilidad">
            <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Finanzas
                </Link>
                <header>
                    <Eyebrow className="mb-2">Libro diario</Eyebrow>
                    <DisplayHeading size={32}>Contabilidad</DisplayHeading>
                    <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Cada asiento queda con el debe igual al haber. Los convenios y las remuneraciones escriben los suyos solos.
                    </p>
                </header>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando libro…</p>
                ) : (
                    <section className="grid gap-3 sm:grid-cols-2">
                        {(journal?.accounts || []).map(account => (
                            <article key={account.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <p className="text-xs font-semibold cc-text-tertiary">{account.code} · {account.name}</p>
                                <p className="mt-2 text-2xl font-semibold cc-text-primary">{money(account.balance)}</p>
                                <p className="mt-1 text-xs cc-text-secondary">Debe {money(account.debit)} · Haber {money(account.credit)}</p>
                            </article>
                        ))}
                    </section>
                )}

                <form onSubmit={event => void saveEntry(event)} className="space-y-3 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="text-sm cc-text-secondary">
                            Fecha
                            <input className={`${fieldClass} mt-1`} style={fieldStyle} type="date" value={entryDate} onChange={event => setEntryDate(event.target.value)} required />
                        </label>
                        <label className="text-sm cc-text-secondary">
                            Glosa
                            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={memo} onChange={event => setMemo(event.target.value)} placeholder="Pago de aseo" required />
                        </label>
                    </div>
                    {lines.map((line, index) => (
                        <div key={`${line.code}-${index}`} className="grid gap-3 sm:grid-cols-3">
                            <select className={fieldClass} style={fieldStyle} value={line.code} onChange={event => updateLine(index, { code: event.target.value })}>
                                {accounts.map(account => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
                            </select>
                            <select className={fieldClass} style={fieldStyle} value={line.side} onChange={event => updateLine(index, { side: event.target.value === "credit" ? "credit" : "debit" })}>
                                <option value="debit">Debe</option>
                                <option value="credit">Haber</option>
                            </select>
                            <input className={fieldClass} style={fieldStyle} inputMode="numeric" value={line.amount} onChange={event => updateLine(index, { amount: event.target.value })} placeholder="Monto" />
                        </div>
                    ))}
                    <div className="flex flex-wrap gap-3">
                        {lines.length < 6 && (
                            <button type="button" className="text-sm font-semibold underline cc-text-secondary" onClick={() => setLines(current => [...current, { code: "5200", side: "debit", amount: "" }])}>
                                Agregar línea
                            </button>
                        )}
                        <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                            Guardar asiento
                        </button>
                    </div>
                </form>

                <section className="space-y-3">
                    {(journal?.entries || []).map(entry => {
                        const names = new Map((journal?.accounts || []).map(account => [account.id, `${account.code} ${account.name}`]));
                        return (
                            <article key={entry.id} className="rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <p className="text-sm font-semibold cc-text-primary">{entry.entry_date} · {entry.memo}</p>
                                <p className="text-xs cc-text-tertiary">{SOURCE_LABEL[entry.source] || entry.source}</p>
                                <ul className="mt-2 space-y-1 text-sm cc-text-secondary">
                                    {(entry.journal_lines || []).map(line => (
                                        <li key={line.id} className="flex justify-between gap-3">
                                            <span>{names.get(line.account_id) || "Cuenta"}</span>
                                            <span>{Number(line.debit) > 0 ? `Debe ${money(line.debit)}` : `Haber ${money(line.credit)}`}</span>
                                        </li>
                                    ))}
                                </ul>
                            </article>
                        );
                    })}
                </section>
            </div>
        </ErrorBoundary>
    );
}
