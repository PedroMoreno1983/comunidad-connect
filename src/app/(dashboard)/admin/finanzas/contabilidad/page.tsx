"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminFinanceService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import type { FinancialStatements, JournalView } from "@/lib/types";
import { currentMonthInChile, todayInChile } from "@/lib/finance/chileDates";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = todayInChile;

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
    const [cutoffMonth, setCutoffMonth] = useState(currentMonthInChile);
    const [openingCash, setOpeningCash] = useState("0");
    const [appliedOpeningCash, setAppliedOpeningCash] = useState(0);
    const [statements, setStatements] = useState<FinancialStatements | null>(null);
    const [statementsLoading, setStatementsLoading] = useState(false);

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

    const loadStatements = useCallback(async () => {
        setStatementsLoading(true);
        try {
            const year = Number(cutoffMonth.slice(0, 4));
            setStatements(await AdminFinanceService.getFinancialStatements({
                year,
                cutoffMonth,
                openingCash: appliedOpeningCash,
            }));
        } catch (error) {
            toast({
                title: "No se armaron los estados",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setStatementsLoading(false);
        }
    }, [appliedOpeningCash, cutoffMonth, toast]);

    useEffect(() => { void loadStatements(); }, [loadStatements]);

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
                        Más abajo, el estado de resultado, el flujo de caja y la situación patrimonial se arman con la recaudación y los egresos.
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

                <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="flex flex-wrap items-end justify-between gap-3">
                        <div>
                            <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Estados financieros</h2>
                            <p className="mt-1 text-xs cc-text-tertiary">
                                Se arman con cobros, pagos y egresos. El libro de 4 cuentas no se toca: el saldo Banco (1100) se muestra para comparar.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-end gap-2">
                            <label className="text-xs cc-text-secondary">
                                Corte
                                <input type="month" value={cutoffMonth} onChange={event => setCutoffMonth(event.target.value)}
                                    className="mt-1 block rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                            </label>
                            <label className="text-xs cc-text-secondary">
                                Caja inicial
                                <input
                                    value={openingCash}
                                    onChange={event => setOpeningCash(event.target.value)}
                                    onBlur={() => setAppliedOpeningCash(Number(openingCash.replace(/[^\d]/g, "")) || 0)}
                                    inputMode="numeric"
                                    className="mt-1 block rounded-lg border px-3 py-2 text-sm"
                                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}
                                />
                            </label>
                        </div>
                    </div>
                    {statementsLoading || !statements ? (
                        <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Armando estados…</p>
                    ) : (
                        <>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <article className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <p className="text-xs font-semibold uppercase tracking-wider cc-text-tertiary">Resultado del año</p>
                                    <p className="mt-2 text-xl font-semibold cc-text-primary">{money(statements.income.result)}</p>
                                    <p className="mt-1 text-xs cc-text-secondary">Ingresos {money(statements.income.totalIncome)} · Egresos {money(statements.income.totalExpenses)}</p>
                                </article>
                                <article className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <p className="text-xs font-semibold uppercase tracking-wider cc-text-tertiary">Caja al corte</p>
                                    <p className="mt-2 text-xl font-semibold cc-text-primary">{money(statements.position.cash)}</p>
                                    <p className="mt-1 text-xs cc-text-secondary">Libro banco 1100: {money(statements.position.journalBank)}</p>
                                </article>
                                <article className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <p className="text-xs font-semibold uppercase tracking-wider cc-text-tertiary">Por cobrar</p>
                                    <p className="mt-2 text-xl font-semibold cc-text-primary">{money(statements.position.receivables)}</p>
                                    <p className="mt-1 text-xs cc-text-secondary">{statements.position.unitsWithDebt} unidades con saldo</p>
                                </article>
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold cc-text-primary">Estado de resultado</h3>
                                    <ul className="space-y-1 text-sm">
                                        {statements.income.lines.map(line => (
                                            <li key={line.label} className="flex justify-between gap-3 cc-text-secondary">
                                                <span>{line.label}</span><span>{money(line.total)}</span>
                                            </li>
                                        ))}
                                        {statements.income.expenseLines.map(line => (
                                            <li key={line.category} className="flex justify-between gap-3 cc-text-secondary">
                                                <span>Egreso {line.label}</span><span>−{money(line.total)}</span>
                                            </li>
                                        ))}
                                        {statements.income.reserveTransfer > 0 && (
                                            <li className="flex justify-between gap-3 cc-text-secondary">
                                                <span>Traspaso al fondo de reserva</span><span>−{money(statements.income.reserveTransfer)}</span>
                                            </li>
                                        )}
                                    </ul>
                                </div>
                                <div>
                                    <h3 className="mb-2 text-sm font-semibold cc-text-primary">Estado de situación</h3>
                                    <ul className="space-y-1 text-sm cc-text-secondary">
                                        <li className="flex justify-between gap-3"><span>Caja</span><span>{money(statements.position.cash)}</span></li>
                                        <li className="flex justify-between gap-3"><span>Cuentas por cobrar</span><span>{money(statements.position.receivables)}</span></li>
                                        <li className="flex justify-between gap-3"><span>Anticipos de unidades</span><span>{money(statements.position.advances)}</span></li>
                                        <li className="flex justify-between gap-3"><span>Fondo de reserva</span><span>{money(statements.position.reserveFund)}</span></li>
                                        <li className="flex justify-between gap-3 font-semibold cc-text-primary"><span>Excedente acumulado</span><span>{money(statements.position.accumulatedSurplus)}</span></li>
                                    </ul>
                                </div>
                            </div>
                            <div>
                                <h3 className="mb-2 text-sm font-semibold cc-text-primary">Flujo de caja</h3>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead style={{ background: "var(--cc-paper-warm)" }}>
                                            <tr>
                                                <th className="px-3 py-2 text-left font-semibold cc-text-secondary">Mes</th>
                                                <th className="px-3 py-2 text-right font-semibold cc-text-secondary">Entra</th>
                                                <th className="px-3 py-2 text-right font-semibold cc-text-secondary">Sale</th>
                                                <th className="px-3 py-2 text-right font-semibold cc-text-secondary">Cierre</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y" style={{ borderColor: "var(--cc-line)" }}>
                                            {statements.cashFlow.months.map(row => (
                                                <tr key={row.month}>
                                                    <td className="px-3 py-2">{row.month}</td>
                                                    <td className="px-3 py-2 text-right">{money(row.inflow)}</td>
                                                    <td className="px-3 py-2 text-right">{money(row.outflow)}</td>
                                                    <td className="px-3 py-2 text-right font-medium">{money(row.closing)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </section>
            </div>
        </ErrorBoundary>
    );
}
