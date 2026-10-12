"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2 } from "lucide-react";
import { AdminFinanceService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import type {
    CommunityEmployeeRecord,
    PayrollCalculation,
    PayrollContractType,
    PayrollEmployeeInput,
    PayrollHealthSystem,
    PayrollRunRecord,
} from "@/lib/types";
import { currentMonthInChile, todayInChile } from "@/lib/finance/chileDates";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const digits = (value: string) => Number(value.replace(/[^\d]/g, "")) || 0;
const today = todayInChile;
const currentMonth = currentMonthInChile;

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };
const cardStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

const CONTRACT_LABELS: Record<PayrollContractType, string> = {
    indefinido: "Indefinido",
    plazo_fijo: "Plazo fijo",
    indefinido_11: "Indefinido, 11 años o más",
};

const AFP_LABELS: Record<string, string> = {
    capital: "Capital", cuprum: "Cuprum", habitat: "Habitat", planvital: "PlanVital",
    provida: "ProVida", modelo: "Modelo", uno: "Uno",
};

interface FormState {
    id?: string;
    fullName: string;
    roleTitle: string;
    monthlyAmount: string;
    calculation: PayrollCalculation;
    rut: string;
    afp: string;
    healthSystem: PayrollHealthSystem;
    isapreName: string;
    isaprePlanUf: string;
    contractType: PayrollContractType;
    gratification: boolean;
    taxableBonus: string;
    mealAllowance: string;
    transportAllowance: string;
    familyDependents: string;
}

const EMPTY_FORM: FormState = {
    fullName: "", roleTitle: "", monthlyAmount: "", calculation: "chile", rut: "", afp: "",
    healthSystem: "fonasa", isapreName: "", isaprePlanUf: "", contractType: "indefinido",
    gratification: true, taxableBonus: "", mealAllowance: "", transportAllowance: "", familyDependents: "",
};

function formFromEmployee(person: CommunityEmployeeRecord): FormState {
    return {
        id: person.id,
        fullName: person.full_name,
        roleTitle: person.role_title,
        monthlyAmount: String(person.monthly_amount),
        calculation: person.calculation,
        rut: person.rut || "",
        afp: person.afp || "",
        healthSystem: person.health_system,
        isapreName: person.isapre_name || "",
        isaprePlanUf: person.isapre_plan_uf ? String(person.isapre_plan_uf) : "",
        contractType: person.contract_type,
        gratification: person.gratification,
        taxableBonus: person.taxable_bonus ? String(person.taxable_bonus) : "",
        mealAllowance: person.meal_allowance ? String(person.meal_allowance) : "",
        transportAllowance: person.transport_allowance ? String(person.transport_allowance) : "",
        familyDependents: person.family_dependents ? String(person.family_dependents) : "",
    };
}

function inputFromForm(form: FormState, active = true): PayrollEmployeeInput {
    return {
        id: form.id,
        fullName: form.fullName,
        roleTitle: form.roleTitle,
        monthlyAmount: digits(form.monthlyAmount),
        active,
        calculation: form.calculation,
        rut: form.rut,
        afp: form.afp,
        healthSystem: form.healthSystem,
        isapreName: form.isapreName,
        isaprePlanUf: form.healthSystem === "isapre" ? Number(form.isaprePlanUf.replace(",", ".")) || null : null,
        contractType: form.contractType,
        gratification: form.gratification,
        taxableBonus: digits(form.taxableBonus),
        mealAllowance: digits(form.mealAllowance),
        transportAllowance: digits(form.transportAllowance),
        familyDependents: digits(form.familyDependents),
    };
}

export default function RemuneracionesPage() {
    const { toast } = useToast();
    const [employees, setEmployees] = useState<CommunityEmployeeRecord[]>([]);
    const [runs, setRuns] = useState<PayrollRunRecord[]>([]);
    const [afps, setAfps] = useState<string[]>([]);
    const [indicatorsMonth, setIndicatorsMonth] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [form, setForm] = useState<FormState>(EMPTY_FORM);
    const [month, setMonth] = useState(currentMonth);
    const [paidAt, setPaidAt] = useState(today);
    const [reference, setReference] = useState("");

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await AdminFinanceService.getPayroll();
            setEmployees(data.employees);
            setRuns(data.runs);
            setAfps(data.afps);
            setIndicatorsMonth(data.indicatorsMonth);
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
            await AdminFinanceService.saveEmployee(inputFromForm(form));
            toast({
                title: form.id ? "Persona actualizada" : "Persona guardada",
                description: "Queda incluida en la próxima liquidación.",
                variant: "success",
            });
            setForm(EMPTY_FORM);
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
            await AdminFinanceService.saveEmployee(inputFromForm(formFromEmployee(person), active));
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
            const stale = data.run.indicatorsMonth && data.run.indicatorsMonth !== month
                ? ` Se usaron los indicadores de ${data.run.indicatorsMonth}; Previred aún no publica ${month}.`
                : "";
            toast({
                title: "Liquidación armada",
                description: `${data.run.month}: costo total ${money(data.run.total)}.${stale}`,
                variant: "success",
            });
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

    const legal = form.calculation === "chile";

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
                        Calcula la liquidación legal de cada persona (AFP, salud, cesantía, impuesto único y aportes del empleador),
                        descarga el PDF para firma y márcala pagada. El costo total entra al libro y a los egresos del mes.
                    </p>
                    {indicatorsMonth && (
                        <p className="mt-2 text-xs cc-text-tertiary">Indicadores previsionales cargados hasta {indicatorsMonth} (Previred).</p>
                    )}
                </header>

                <form onSubmit={event => void saveEmployee(event)} className="space-y-4 rounded-2xl border p-5" style={cardStyle}>
                    <div className="flex flex-wrap gap-2 text-sm">
                        {(["chile", "fixed"] as const).map(mode => (
                            <button
                                key={mode}
                                type="button"
                                onClick={() => set("calculation", mode)}
                                className="rounded-full border px-3 py-1 font-semibold"
                                style={form.calculation === mode
                                    ? { background: "var(--cc-ink)", color: "white", borderColor: "var(--cc-ink)" }
                                    : { borderColor: "var(--cc-line)" }}
                            >
                                {mode === "chile" ? "Liquidación legal" : "Monto fijo (honorarios o externo)"}
                            </button>
                        ))}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                        <label className="text-sm cc-text-secondary sm:col-span-2">
                            Nombre
                            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={form.fullName} onChange={e => set("fullName", e.target.value)} required />
                        </label>
                        <label className="text-sm cc-text-secondary">
                            Cargo
                            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={form.roleTitle} onChange={e => set("roleTitle", e.target.value)} placeholder="Conserje" required />
                        </label>
                        <label className="text-sm cc-text-secondary">
                            {legal ? "Sueldo base" : "Monto mensual"}
                            <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={form.monthlyAmount} onChange={e => set("monthlyAmount", e.target.value)} required />
                        </label>
                    </div>

                    {legal && (
                        <div className="grid gap-3 sm:grid-cols-4">
                            <label className="text-sm cc-text-secondary">
                                RUT
                                <input className={`${fieldClass} mt-1`} style={fieldStyle} value={form.rut} onChange={e => set("rut", e.target.value)} placeholder="12.345.678-5" />
                            </label>
                            <label className="text-sm cc-text-secondary">
                                AFP
                                <select className={`${fieldClass} mt-1`} style={fieldStyle} value={form.afp} onChange={e => set("afp", e.target.value)} required>
                                    <option value="">Elige…</option>
                                    {afps.map(afp => <option key={afp} value={afp}>{AFP_LABELS[afp] || afp}</option>)}
                                </select>
                            </label>
                            <label className="text-sm cc-text-secondary">
                                Salud
                                <select className={`${fieldClass} mt-1`} style={fieldStyle} value={form.healthSystem} onChange={e => set("healthSystem", e.target.value as PayrollHealthSystem)}>
                                    <option value="fonasa">Fonasa</option>
                                    <option value="isapre">Isapre</option>
                                </select>
                            </label>
                            <label className="text-sm cc-text-secondary">
                                Contrato
                                <select className={`${fieldClass} mt-1`} style={fieldStyle} value={form.contractType} onChange={e => set("contractType", e.target.value as PayrollContractType)}>
                                    {Object.entries(CONTRACT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                                </select>
                            </label>
                            {form.healthSystem === "isapre" && (
                                <>
                                    <label className="text-sm cc-text-secondary sm:col-span-2">
                                        Isapre
                                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={form.isapreName} onChange={e => set("isapreName", e.target.value)} />
                                    </label>
                                    <label className="text-sm cc-text-secondary sm:col-span-2">
                                        Plan (UF)
                                        <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="decimal" value={form.isaprePlanUf} onChange={e => set("isaprePlanUf", e.target.value)} required />
                                    </label>
                                </>
                            )}
                            <label className="text-sm cc-text-secondary">
                                Bonos imponibles
                                <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={form.taxableBonus} onChange={e => set("taxableBonus", e.target.value)} placeholder="0" />
                            </label>
                            <label className="text-sm cc-text-secondary">
                                Colación
                                <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={form.mealAllowance} onChange={e => set("mealAllowance", e.target.value)} placeholder="0" />
                            </label>
                            <label className="text-sm cc-text-secondary">
                                Movilización
                                <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={form.transportAllowance} onChange={e => set("transportAllowance", e.target.value)} placeholder="0" />
                            </label>
                            <label className="text-sm cc-text-secondary">
                                Cargas familiares
                                <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={form.familyDependents} onChange={e => set("familyDependents", e.target.value)} placeholder="0" />
                            </label>
                            <label className="flex items-center gap-2 text-sm cc-text-secondary sm:col-span-4">
                                <input type="checkbox" checked={form.gratification} onChange={e => set("gratification", e.target.checked)} />
                                Gratificación legal mensual (25% del sueldo, con tope de 4,75 ingresos mínimos al año)
                            </label>
                        </div>
                    )}

                    <div className="flex gap-3">
                        <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                            {form.id ? "Guardar cambios" : "Agregar persona"}
                        </button>
                        {form.id && (
                            <button type="button" className="text-sm underline cc-text-secondary" onClick={() => setForm(EMPTY_FORM)}>Cancelar</button>
                        )}
                    </div>
                </form>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
                ) : (
                    <section className="overflow-x-auto rounded-2xl border" style={cardStyle}>
                        <table className="w-full text-sm">
                            <thead style={{ background: "var(--cc-paper-warm)" }}>
                                <tr>
                                    <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Persona</th>
                                    <th className="px-5 py-2 text-left font-semibold cc-text-secondary">Cálculo</th>
                                    <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Sueldo</th>
                                    <th className="px-5 py-2 text-right font-semibold cc-text-secondary">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {employees.length === 0 ? (
                                    <tr><td colSpan={4} className="px-5 py-6 text-center cc-text-secondary">Todavía no hay personal cargado.</td></tr>
                                ) : employees.map(person => (
                                    <tr key={person.id} className="border-t" style={{ borderColor: "var(--cc-line)" }}>
                                        <td className="px-5 py-2">
                                            <button type="button" className="text-left font-medium cc-text-primary hover:underline" onClick={() => setForm(formFromEmployee(person))}>
                                                {person.full_name}
                                            </button>
                                            <div className="text-xs cc-text-tertiary">{person.role_title}</div>
                                        </td>
                                        <td className="px-5 py-2 cc-text-secondary">
                                            {person.calculation === "chile"
                                                ? `Legal · ${AFP_LABELS[person.afp || ""] || person.afp || "sin AFP"} · ${person.health_system === "isapre" ? "Isapre" : "Fonasa"}`
                                                : "Monto fijo"}
                                        </td>
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

                <section className="flex flex-wrap items-end gap-3 rounded-2xl border p-5" style={cardStyle}>
                    <label className="text-sm cc-text-secondary">
                        Mes
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} type="month" value={month} onChange={e => setMonth(e.target.value)} />
                    </label>
                    <button type="button" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }} onClick={() => void createRun()}>
                        Calcular liquidaciones
                    </button>
                    <label className="text-sm cc-text-secondary">
                        Fecha de pago
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} type="date" value={paidAt} onChange={e => setPaidAt(e.target.value)} />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Comprobante
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={reference} onChange={e => setReference(e.target.value)} placeholder="Opcional" />
                    </label>
                </section>

                <div className="space-y-4">
                    {runs.map(run => {
                        const netTotal = run.payroll_lines.reduce((sum, line) => sum + (line.net_amount ?? line.amount), 0);
                        const contributions = run.payroll_lines.reduce((sum, line) => {
                            const slip = line.breakdown;
                            return slip?.calculation === "chile"
                                ? sum + slip.afp!.amount + slip.health.amount + slip.unemploymentWorker + slip.incomeTax + slip.employer.total - slip.familyAllowance
                                : sum;
                        }, 0);
                        return (
                            <article key={run.id} className="rounded-2xl border p-5" style={cardStyle}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <h2 className="font-semibold cc-text-primary">{run.month}</h2>
                                        <p className="text-sm cc-text-secondary">
                                            Costo total {money(run.total_amount)} · {run.status === "paid" ? `Pagada ${run.paid_at || ""}` : "Borrador"}
                                        </p>
                                        <p className="text-xs cc-text-tertiary">
                                            Líquidos a transferir {money(netTotal)}
                                            {contributions > 0 && ` · Previred e impuesto ${money(contributions)}`}
                                            {run.indicators_month && ` · Indicadores ${run.indicators_month}`}
                                        </p>
                                    </div>
                                    {run.status === "draft" && (
                                        <button type="button" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }} onClick={() => void payRun(run.id)}>
                                            Marcar pagada
                                        </button>
                                    )}
                                </div>
                                <ul className="mt-3 divide-y text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                                    {run.payroll_lines.map(line => (
                                        <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                                            <span>{line.full_name} · {line.role_title}</span>
                                            <span className="flex items-center gap-4">
                                                {line.breakdown?.calculation === "chile" ? (
                                                    <>
                                                        <span>Líquido {money(line.net_amount ?? 0)}</span>
                                                        <span className="cc-text-tertiary">Costo {money(line.amount)}</span>
                                                        <a
                                                            href={`/api/admin/payroll/lines/${line.id}/pdf`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-1 text-xs font-semibold underline"
                                                        >
                                                            <FileText className="h-3.5 w-3.5" /> PDF
                                                        </a>
                                                    </>
                                                ) : (
                                                    <span>{money(line.amount)}</span>
                                                )}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                                {run.expense_note && <p className="mt-3 text-xs cc-text-tertiary">{run.expense_note}</p>}
                            </article>
                        );
                    })}
                </div>
            </div>
        </ErrorBoundary>
    );
}
