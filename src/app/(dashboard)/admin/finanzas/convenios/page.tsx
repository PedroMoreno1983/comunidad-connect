"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminFinanceService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import type { FinanceCommitteeResidentOption, FinanceUnitOption, PaymentAgreement } from "@/lib/types";
import { todayInChile } from "@/lib/finance/chileDates";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const today = todayInChile;

const STATUS_LABEL: Record<PaymentAgreement["status"], string> = {
    pending_committee: "Pendiente del comité",
    active: "Vigente",
    completed: "Cumplido",
    cancelled: "Cerrado",
    rejected: "Rechazado por el comité",
};

const METHODS = [
    { value: "transfer", label: "Transferencia" },
    { value: "cash", label: "Efectivo" },
    { value: "check", label: "Cheque" },
    { value: "card", label: "Tarjeta" },
    { value: "other", label: "Otro" },
];

function unitLabel(unit: FinanceUnitOption) {
    return unit.tower && unit.tower !== "A" ? `${unit.tower}-${unit.number}` : unit.number;
}

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

export default function ConveniosPage() {
    const { toast } = useToast();
    const [agreements, setAgreements] = useState<PaymentAgreement[]>([]);
    const [units, setUnits] = useState<FinanceUnitOption[]>([]);
    const [reviewers, setReviewers] = useState<FinanceCommitteeResidentOption[]>([]);
    const [reviewerId, setReviewerId] = useState("");
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [unitId, setUnitId] = useState("");
    const [title, setTitle] = useState("");
    const [totalAmount, setTotalAmount] = useState("");
    const [installmentCount, setInstallmentCount] = useState("3");
    const [notes, setNotes] = useState("");
    const [openId, setOpenId] = useState<string | null>(null);
    const [payDate, setPayDate] = useState(today);
    const [payMethod, setPayMethod] = useState("transfer");
    const [payReference, setPayReference] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await AdminFinanceService.getPaymentAgreements();
            setAgreements(data.agreements);
            setUnits(data.units);
            setReviewers(data.reviewers);
            setReviewerId(current => current || data.reviewers[0]?.id || "");
            setUnitId(current => current || data.units[0]?.id || "");
        } catch (error) {
            toast({
                title: "No se cargaron los convenios",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    async function createAgreement(event: FormEvent) {
        event.preventDefault();
        const amount = Number(totalAmount.replace(/[^\d]/g, ""));
        setBusy(true);
        try {
            await AdminFinanceService.createPaymentAgreement({
                unitId,
                title,
                totalAmount: amount,
                installmentCount: Number(installmentCount),
                // La primera cuota vence al firmar: el servidor fija las fechas.
                startDate: today(),
                notes,
                reviewerId: reviewers.length ? reviewerId : undefined,
            });
            toast({ title: reviewers.length ? "Convenio enviado al comité" : "Convenio abierto", description: reviewers.length ? "El integrante designado debe aprobarlo. El convenio se firma ese día y ahí vence la primera cuota." : "Quedó firmado hoy: la primera cuota vence hoy y, si se paga en el acto, la unidad queda habilitada para votar en asambleas.", variant: "success" });
            setTitle("");
            setTotalAmount("");
            setNotes("");
            await load();
        } catch (error) {
            toast({
                title: "No se abrió",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    async function payInstallment(installmentId: string) {
        setBusy(true);
        try {
            const result = await AdminFinanceService.payAgreementInstallment({
                installmentId,
                paidAt: payDate,
                method: payMethod,
                reference: payReference,
            });
            toast({ title: "Cuota registrada", description: result.warnings.length
                ? result.warnings.join(" ") : "El pago quedó en cobranza y en el libro.",
                variant: result.warnings.length ? "destructive" : "success" });
            setPayReference("");
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

    async function cancel(agreementId: string) {
        setBusy(true);
        try {
            await AdminFinanceService.cancelPaymentAgreement(agreementId);
            toast({ title: "Convenio cerrado", description: "Las cuotas pendientes dejan de cobrarse por este acuerdo.", variant: "success" });
            await load();
        } catch (error) {
            toast({
                title: "No se cerró",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setBusy(false);
        }
    }

    return (
        <ErrorBoundary name="Convenios de pago">
            <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Finanzas
                </Link>
                <header>
                    <Eyebrow className="mb-2">Morosidad</Eyebrow>
                    <DisplayHeading size={32}>Convenios de pago</DisplayHeading>
                    <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Reparte una deuda en cuotas y registra cada pago cuando ya lo recibiste por transferencia, efectivo, cheque u otro medio.
                    </p>
                </header>

                {!loading && reviewers.length === 0 && <p className="rounded-xl border border-warning-border bg-warning-bg p-3 text-sm cc-text-secondary">
                    No hay integrantes del comité designados. Los convenios nuevos se activarán sin revisión. <Link href="/admin/finanzas/comite" className="underline">Configurar comité</Link>
                </p>}

                <form onSubmit={event => void createAgreement(event)} className="grid gap-3 rounded-2xl border p-5 sm:grid-cols-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <label className="text-sm cc-text-secondary">
                        Unidad
                        <select className={`${fieldClass} mt-1`} style={fieldStyle} value={unitId} onChange={event => setUnitId(event.target.value)}>
                            {units.map(unit => (
                                <option key={unit.id} value={unit.id}>{unitLabel(unit) || "Unidad"}</option>
                            ))}
                        </select>
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Título
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={title} onChange={event => setTitle(event.target.value)} placeholder="Deuda marzo a junio" required />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Monto total
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" value={totalAmount} onChange={event => setTotalAmount(event.target.value)} placeholder="150000" required />
                    </label>
                    <label className="text-sm cc-text-secondary">
                        Cuotas
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} inputMode="numeric" min={2} max={36} value={installmentCount} onChange={event => setInstallmentCount(event.target.value)} required />
                    </label>
                    <p className="text-sm cc-text-secondary sm:col-span-2">
                        La primera cuota vence al firmar el convenio{reviewers.length > 0 ? " (el día en que el comité lo aprueba)" : " (hoy)"}; las siguientes, el día 5 de cada mes, con al menos 15 días entre la primera y la segunda. Al firmar se paga la primera cuota y la unidad queda habilitada para votar en asambleas.
                    </p>
                    <label className="text-sm cc-text-secondary">
                        Nota
                        <input className={`${fieldClass} mt-1`} style={fieldStyle} value={notes} onChange={event => setNotes(event.target.value)} placeholder="Acordado con el comité" />
                    </label>
                    {reviewers.length > 0 && <label className="text-sm cc-text-secondary">Integrante que revisará
                        <select className={`${fieldClass} mt-1`} style={fieldStyle} value={reviewerId} onChange={event => setReviewerId(event.target.value)}>
                            {reviewers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
                        </select>
                    </label>}
                    <div className="sm:col-span-2">
                        <button type="submit" disabled={busy || !unitId} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                            {reviewers.length > 0 ? "Enviar convenio al comité" : "Abrir convenio"}
                        </button>
                    </div>
                </form>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando convenios…</p>
                ) : agreements.length === 0 ? (
                    <p className="rounded-2xl border p-6 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>Todavía no hay convenios en esta comunidad.</p>
                ) : agreements.map(agreement => (
                    <article key={agreement.id} className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <button type="button" className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left" onClick={() => setOpenId(current => current === agreement.id ? null : agreement.id)}>
                            <span>
                                <span className="block font-semibold cc-text-primary">{agreement.unitLabel} · {agreement.title}</span>
                                <span className="mt-1 block text-sm cc-text-secondary">{money(agreement.paidAmount)} de {money(agreement.totalAmount)} · {STATUS_LABEL[agreement.status]}</span>
                                {agreement.committeeReviewNote && <span className="mt-1 block text-xs cc-text-tertiary">Comité: {agreement.committeeReviewNote}</span>}
                            </span>
                            <span className="text-xs font-semibold cc-text-tertiary">{agreement.installmentCount} cuotas</span>
                        </button>
                        {openId === agreement.id && (
                            <div className="border-t px-5 py-4" style={{ borderColor: "var(--cc-line)" }}>
                                <ul className="space-y-3">
                                    {agreement.installments.map(installment => (
                                        <li key={installment.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                                            <span className="cc-text-primary">Cuota {installment.sequence} · {installment.dueDate} · {money(installment.amount)}</span>
                                            {installment.status === "paid" ? (
                                                <span className="text-xs font-semibold" style={{ color: "var(--cc-sage)" }}>Pagada {installment.paidAt}</span>
                                            ) : agreement.status === "active" ? (
                                                <button type="button" disabled={busy} className="text-xs font-semibold underline cc-text-secondary" onClick={() => void payInstallment(installment.id)}>
                                                    Registrar pago
                                                </button>
                                            ) : (
                                                <span className="text-xs cc-text-tertiary">Pendiente</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                {(agreement.status === "active" || agreement.status === "pending_committee") && (
                                    <div className="mt-4 flex flex-wrap items-end gap-3">
                                        <label className="text-xs cc-text-secondary">
                                            Fecha del pago
                                            <input className={`${fieldClass} mt-1`} style={fieldStyle} type="date" value={payDate} onChange={event => setPayDate(event.target.value)} />
                                        </label>
                                        <label className="text-xs cc-text-secondary">
                                            Medio
                                            <select className={`${fieldClass} mt-1`} style={fieldStyle} value={payMethod} onChange={event => setPayMethod(event.target.value)}>
                                                {METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
                                            </select>
                                        </label>
                                        <label className="text-xs cc-text-secondary">
                                            Comprobante
                                            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={payReference} onChange={event => setPayReference(event.target.value)} placeholder="Opcional" />
                                        </label>
                                        <button type="button" disabled={busy} className="text-xs font-semibold underline cc-text-tertiary" onClick={() => void cancel(agreement.id)}>
                                            {agreement.status === "pending_committee" ? "Anular solicitud" : "Cerrar convenio"}
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                    </article>
                ))}
            </div>
        </ErrorBoundary>
    );
}
