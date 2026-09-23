"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminFinanceService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import type { CommunityEmployeeRecord, PayrollRunRecord } from "@/lib/types";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

export default function RemuneracionesPage() {
    const { toast } = useToast();
    const [employees, setEmployees] = useState<CommunityEmployeeRecord[]>([]);
    const [runs, setRuns] = useState<PayrollRunRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [fullName, setFullName] = useState("");
    const [roleTitle, setRoleTitle] = useState("");
    const [monthlyAmount, setMonthlyAmount] = useState("");
    const [month, setMonth] = useState(currentMonth);
    const [paidAt, setPaidAt] = useState(today);
    const [reference, setReference] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await AdminFinanceService.getPayroll();
            setEmployees(data.employees);
            setRuns(data.runs);
        } catch (error) {
            toast({
                title: "No se cargó la remuneración",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    async function saveEmployee(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            await AdminFinanceService.saveEmployee({
                fullName,
                roleTitle,
                monthlyAmount: Number(monthlyAmount.replace(/[^\d]/g, "")),
                active: true,
            });
            toast({ title: "Persona guardada", description: "Queda incluida en la próxima liquidación.", variant: "success" });
            setFullName("");
            setRoleTitle("");
            setMonthlyAmount("");
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

    async function setActive(person: CommunityEmployeeRecord, active: boolean) {
        setBusy(true);
        try {
            await AdminFinanceService.saveEmployee({
                id: person.id,
                fullName: person.full_name,
                roleTitle: person.role_title,
                monthlyAmount: person.monthly_amount,
                active,
            });
            await load();
        } catch (error) {
            toast({
                title: "No se actualizó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function createRun() {
        setBusy(true);
        try {
            const data = await AdminFinanceService.createPayrollRun(month);
            toast({ title: "Liquidación armada", description: `${data.run.month} por ${money(data.run.total)}.`, variant: "success" });
            await load();
        } catch (error) {
            toast({
                title: "No se armó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function payRun(runId: string) {
        setBusy(true);
        try {
            const result = await AdminFinanceService.payPayrollRun({ runId, paidAt, reference });
            toast({ title: "Remuneración pagada", description: result.expenseNote, variant: "success" });
            setReference("");
            await load();
        } catch (error) {
            toast({
                title: "No se pagó",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <ErrorBoundary name="Remuneraciones">
            <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Finanzas
                </Link>
                <header>
                    <Eyebrow className="mb-2">Personal</Eyebrow>
                    <DisplayHeading size={32}>Remuneraciones</DisplayHeading>
                    <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Arma la liquidación del mes y márcala pagada. El asiento entra al libro y, si el gasto común de ese mes sigue abierto, también a los egresos.
                    </p>
                </header>

                <form onSubmit={event => void saveEmployee(event)} className="grid gap-3 rounded-2xl border p-5 sm:grid-cols-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <label className="text-sm cc-text-secondary sm:col-span-2">
                        Nombre
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={fullName} onChange={event => setFullName(event.target.value)} required />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Cargo
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={roleTitle} onChange={event => setRoleTitle(event.target.value)} placeholder="Conserje" required />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Sueldo mensual
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={monthlyAmount} onChange={event => setMonthlyAmount(event.target.value)} required />
                    </label>
                    <div className="sm:col-span-4">
                        <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                            Agregar persona
                        </button>
                    </div>
                </form>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
                ) : (
                    <section className="overflow-x-auto rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <table className="w-full text-sm">
                            <thead style={{ background: "var(--cc-paper-warm)" }}>
                                <tr>
                                    <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Persona</th>
                                    <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Cargo</th>
                                    <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Mensual</th>
                                    <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <tr><td colSpan={4} className="px-5 py-6 text-center cc-text-secondary">Todavía no hay personal cargado.</td></tr>
                                ) : employees.map(person => (
                                    <tr key={person.id} className="border-t" style={{ borderColor: "var(--cc-line)" }}>
                                        <td className="px-5 py-2 font-medium cc-text-primary">{person.full_name}</td>
                                        <td className="px-5 py-2 cc-text-secondary">{person.role_title}</td>
                                        <td className="px-5 py-2 text-right cc-text-primary">{money(person.monthly_amount)}</td>
                                        <td className="px-5 py-2 text-right">
                                            <button type="button" disabled={busy} className="text-xs font-semibold underline cc-text-secondary" onClick={() => void setActive(person, !person.active)}>
                                                {person.active ? "Activa" : "Inactiva"}
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>
                )}

                <section className="flex flex-wrap items-end gap-3 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <label className="text-sm cc-text-secondary">
                        Mes
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} type="month" value={month} onChange={event => setMonth(event.target.value)} />
                    </label>
                    <button type="button" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }} onClick={() => void createRun()}>
                        Armar liquidación
                    </button>
                    <label className="text-sm cc-text-secondary">
                        Fecha de pago
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} type="date" value={paidAt} onChange={event => setPaidAt(event.target.value)} />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Comprobante
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={reference} onChange={event => setReference(event.target.value)} placeholder="Opcional" />
                    </label>
                </section>

                <div className="space-y-4">
                    {runs.map(run => (
                        <article key={run.id} className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h2 className="font-semibold cc-text-primary">{run.month}</h2>
                                    <p className="text-sm cc-text-secondary">{money(run.total_amount)} · {run.status === "paid" ? `Pagada ${run.paid_at || ""}` : "Borrador"}</p>
                                </div>
                                {run.status === "draft" && (
                                    <button type="button" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }} onClick={() => void payRun(run.id)}>
                                        Marcar pagada
                                    </button>
                                )}
                            </div>
                            <ul className="mt-3 space-y-1 text-sm cc-text-secondary">
                                {(run.payroll_lines || []).map(line => (
                                    <li key={line.id} className="flex justify-between gap-3">
                                        <span>{line.full_name} · {line.role_title}</span>
                                        <span>{money(line.amount)}</span>
                                    </li>
                                ))}
                            </ul>
                            {run.expense_note && <p className="mt-3 text-xs cc-text-tertiary">{run.expense_note}</p>}
                        </article>
                    ))}
                </div>
            </div>
        </ErrorBoundary>
    );
}
