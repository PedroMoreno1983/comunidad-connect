"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
    AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Copy, Loader2, Mail, Plus, Send, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import type { BillingPreview, CommunityExpense, FinanceDocumentReview, IssuedBillingRun } from "@/lib/types";
import { currentMonthInChile, nextMonthFifthInChile } from "@/lib/finance/chileDates";

const CATEGORIES = [
    { value: "electricity", label: "Electricidad" },
    { value: "water", label: "Agua" },
    { value: "salaries", label: "Remuneraciones" },
    { value: "maintenance", label: "Mantención" },
    { value: "security", label: "Seguridad" },
    { value: "other", label: "Otros" },
] as const;





const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const currentMonth = currentMonthInChile;
const defaultDueDate = nextMonthFifthInChile;

export default function EgresosPage() {
    const { toast } = useToast();
    const [month, setMonth] = useState(currentMonth);
    const [dueDate, setDueDate] = useState(defaultDueDate);
    const [expenses, setExpenses] = useState<CommunityExpense[]>([]);
    const [issuedRun, setIssuedRun] = useState<IssuedBillingRun | null>(null);
    const [preview, setPreview] = useState<BillingPreview | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [issuing, setIssuing] = useState(false);
    const [issueWarnings, setIssueWarnings] = useState<string[]>([]);

    const [label, setLabel] = useState("");
    const [amount, setAmount] = useState("");
    const [category, setCategory] = useState<string>("other");
    const [prorateMethod, setProrateMethod] = useState<"share" | "equal">("share");
    const [billingMode, setBillingMode] = useState<"proration" | "fixed">("proration");
    const [quotaAmount, setQuotaAmount] = useState("");
    const [quotaMethod, setQuotaMethod] = useState<"share" | "equal">("share");
    const [cashBalance, setCashBalance] = useState("");
    const [notifyByEmail, setNotifyByEmail] = useState(true);
    const [sendingNotices, setSendingNotices] = useState(false);
    const [documents, setDocuments] = useState<FinanceDocumentReview[]>([]);
    const [extracting, setExtracting] = useState(false);

    async function inspectDocuments(files: FileList) {
        setExtracting(true);
        const reviewMonth = month;
        const reviewProrateMethod = prorateMethod;
        const selected = Array.from(files).slice(0, 10);
        for (const file of selected) {
            const form = new FormData();
            form.append("action", "extract");
            form.append("file", file);
            let draft: FinanceDocumentReview;
            try {
                const response = await fetch("/api/admin/finance-documents", { method: "POST", body: form });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "No se pudo extraer.");
                draft = { ...result.draft, id: crypto.randomUUID(), file, month: reviewMonth, prorateMethod: reviewProrateMethod, status: "pending" };
            } catch (error) {
                draft = { id: crypto.randomUUID(), file, month: reviewMonth, prorateMethod: reviewProrateMethod, fileName: file.name, label: file.name.replace(/\.[^.]+$/, ""), amount: 0,
                    category: "other", provider: "", documentDate: "", documentNumber: "", status: "pending",
                    warnings: [error instanceof Error ? error.message : "Revisa e ingresa los datos manualmente."] };
            }
            setDocuments(current => [...current, draft]);
        }
        setExtracting(false);
    }

    function editDocument(id: string, changes: Partial<FinanceDocumentReview>) {
        setDocuments(current => current.map(item => item.id === id ? { ...item, ...changes } : item));
    }

    function discardDocument(id: string) {
        setDocuments(current => current.filter(item => item.id !== id || item.status === "saving"));
    }

    async function saveDocument(id: string) {
        const item = documents.find(document => document.id === id);
        if (!item || item.status === "saving" || !item.label.trim() || !Number.isFinite(item.amount) || item.amount <= 0) {
            if (item && item.status !== "saving") {
                toast({ title: "Revisa el respaldo", description: "Confirma concepto y monto mayor que cero.", variant: "destructive" });
            }
            return;
        }
        editDocument(id, { status: "saving" });
        try {
            const form = new FormData();
            form.append("action", "save"); form.append("file", item.file); form.append("month", item.month);
            form.append("label", item.label); form.append("amount", String(item.amount));
            form.append("category", item.category); form.append("provider", item.provider);
            form.append("documentDate", item.documentDate); form.append("documentNumber", item.documentNumber);
            form.append("prorateMethod", item.prorateMethod);
            const response = await fetch("/api/admin/finance-documents", { method: "POST", body: form });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || "No se pudo guardar el respaldo.");
            editDocument(id, { status: "saved" });
            await load();
        } catch (error) {
            editDocument(id, { status: "pending" });
            toast({ title: "Respaldo no guardado", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        }
    }

    const load = useCallback(async () => {
        setLoading(true);
        const parsedQuota = Number(quotaAmount.replace(/[^\d]/g, ""));
        const quotaQuery = billingMode === "fixed" && Number.isFinite(parsedQuota) && parsedQuota > 0
            ? `&quotaAmount=${parsedQuota}&quotaMethod=${quotaMethod}`
            : "";
        try {
            const [expensesRes, previewRes] = await Promise.all([
                fetch(`/api/admin/community-expenses?month=${month}`, { cache: "no-store" }),
                fetch(`/api/admin/billing?month=${month}${quotaQuery}`, { cache: "no-store" }),
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
    }, [month, toast, billingMode, quotaAmount, quotaMethod]);

    useEffect(() => { void load(); }, [load]);

    async function copyPreviousMonth() {
        const [year, mon] = month.split("-").map(Number);
        const previous = mon === 1
            ? `${year - 1}-12`
            : `${year}-${String(mon - 1).padStart(2, "0")}`;

        setSaving(true);
        try {
            const response = await fetch("/api/admin/community-expenses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "copy_from_month", fromMonth: previous, month }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudieron copiar los egresos.");

            toast({
                title: "Egresos copiados",
                description: `${data.copied} egreso(s) desde ${previous}.`
                    + (data.skipped > 0 ? ` ${data.skipped} ya existían y se omitieron.` : "")
                    + " Revisa los montos contra las boletas del mes.",
                variant: "success",
            });
            await load();
        } catch (error) {
            toast({
                title: "No se copiaron",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    }

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
            const parsedQuota = Number(quotaAmount.replace(/[^\d]/g, ""));
            const parsedCash = cashBalance.trim() === "" ? null : Number(cashBalance.replace(/[^\d-]/g, ""));
            const response = await fetch("/api/admin/billing", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month,
                    dueDate,
                    notifyByEmail,
                    declaredCashBalance: parsedCash !== null && Number.isFinite(parsedCash) ? parsedCash : null,
                    quotaAmount: billingMode === "fixed" && Number.isFinite(parsedQuota) && parsedQuota > 0 ? parsedQuota : undefined,
                    quotaMethod,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "No se pudo emitir.");

            const skipped = (data.skippedUnits || []).length;
            const emailed = Number(data.emailed || 0);
            const emailFailed = Number(data.emailFailed || 0);
            const warnings = Array.isArray(data.warnings) ? data.warnings.filter((value: unknown): value is string => typeof value === "string") : [];
            setIssueWarnings(warnings);
            toast({
                title: warnings.length > 0 ? "Gasto común emitido con avisos" : "Gasto común emitido",
                description: `${data.issuedUnits} unidades por ${money(data.totalCharged)}. `
                    + `${data.notified} residentes notificados en la app.`
                    + (notifyByEmail ? ` Correos: ${emailed} aceptados, ${emailFailed} fallidos.` : "")
                    + (skipped > 0 ? ` ${skipped} unidad(es) se omitieron por tener un cobro previo.` : ""),
                variant: warnings.length > 0 ? "default" : "success",
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
            setIssueWarnings([]);
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

    async function sendNotices() {
        setSendingNotices(true);
        try {
            const parsedCash = cashBalance.trim() === "" ? null : Number(cashBalance.replace(/[^\d-]/g, ""));
            const response = await fetch("/api/email/send-expenses", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    month,
                    attachPdf: true,
                    cashBalance: parsedCash !== null && Number.isFinite(parsedCash) ? parsedCash : undefined,
                }),
            });
            const data = await response.json() as { error?: string; sent?: number; failed?: number; total?: number };
            if (!response.ok) throw new Error(data.error || "No se pudieron enviar los avisos.");
            toast({
                title: (data.failed || 0) > 0 ? "Envío parcial" : "Avisos enviados",
                description: `${data.sent} correos aceptados de ${data.total}.`,
                variant: (data.failed || 0) > 0 ? "default" : "success",
            });
        } catch (error) {
            toast({
                title: "No se enviaron",
                description: error instanceof Error ? error.message : "Error inesperado.",
                variant: "destructive",
            });
        } finally {
            setSendingNotices(false);
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
                            unidades y emite el cobro de todas de una vez. Si hay lecturas de agua
                            consecutivas, el egreso de agua se reparte por m³ y no por alícuota.
                        </p>
                    </header>
                </div>

                <div className="flex flex-wrap items-end gap-4 rounded-2xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <label className="text-sm">
                        <span className="mb-1 block font-semibold cc-text-primary">Periodo</span>
                        <input
                            type="month"
                            value={month}
                            onChange={event => { setMonth(event.target.value); setIssueWarnings([]); }}
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
                    <label className="text-sm">
                        <span className="mb-1 block font-semibold cc-text-primary">Saldo de caja (art. 31)</span>
                        <input
                            value={cashBalance}
                            onChange={event => setCashBalance(event.target.value)}
                            inputMode="numeric"
                            placeholder="Opcional"
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
                        <div className="flex flex-wrap items-center gap-2">
                            <Button type="button" onClick={() => void sendNotices()} disabled={sendingNotices} className="text-xs" style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}>
                                {sendingNotices ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-2 h-3.5 w-3.5" />}
                                Reenviar boletas
                            </Button>
                            <Button type="button" onClick={() => void cancelRun()} className="text-xs" style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}>
                                Anular emisión
                            </Button>
                        </div>
                    </div>
                )}

                {issuedRun && issueWarnings.length > 0 && (
                    <section role="alert" className="rounded-2xl border border-warning-border bg-warning-bg p-4">
                        <p className="font-semibold text-warning-fg">La emisión requiere revisión</p>
                        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm cc-text-secondary">
                            {issueWarnings.map(warning => <li key={warning}>{warning}</li>)}
                        </ul>
                    </section>
                )}

                {!issuedRun && (
                    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <h2 className="font-semibold cc-text-primary">Cómo se cobra</h2>
                        <p className="mt-1 text-sm cc-text-secondary">
                            Prorrateo suma los egresos del mes. Cuota fija cobra un monto acordado y deja los egresos solo en la rendición; el agua, si hay lecturas, se suma por m³.
                        </p>
                        <div className="mt-4 flex flex-wrap gap-4">
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" name="billingMode" checked={billingMode === "proration"} onChange={() => setBillingMode("proration")} />
                                Prorrateo de egresos
                            </label>
                            <label className="flex items-center gap-2 text-sm">
                                <input type="radio" name="billingMode" checked={billingMode === "fixed"} onChange={() => setBillingMode("fixed")} />
                                Cuota fija
                            </label>
                        </div>
                        {billingMode === "fixed" && (
                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <input value={quotaAmount} onChange={event => setQuotaAmount(event.target.value)} inputMode="numeric" placeholder="Monto total de la cuota"
                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} />
                                <select value={quotaMethod} onChange={event => setQuotaMethod(event.target.value === "equal" ? "equal" : "share")}
                                    className="rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <option value="share">Repartir por alícuota</option>
                                    <option value="equal">Repartir en partes iguales</option>
                                </select>
                            </div>
                        )}
                        <label className="mt-4 flex items-center gap-2 text-sm cc-text-secondary">
                            <input type="checkbox" checked={notifyByEmail} onChange={event => setNotifyByEmail(event.target.checked)} />
                            Enviar boleta PDF por correo al emitir
                        </label>
                    </section>
                )}

                {!issuedRun && (
                    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <h2 className="font-semibold cc-text-primary">Cargar respaldos de egresos</h2>
                        <p className="mt-1 text-sm cc-text-secondary">Sube hasta 10 boletas, facturas o planillas a la vez. CoCo propone los datos; comprueba cada monto y concepto antes de registrarlo.</p>
                        <input className="mt-3 block w-full text-sm" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.txt,.csv"
                            disabled={extracting || saving} onChange={event => { if (event.target.files) void inspectDocuments(event.target.files); event.target.value = ""; }} />
                        {extracting && <p className="mt-2 text-sm cc-text-secondary"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Leyendo documentos…</p>}
                        <div className="mt-4 space-y-3">{documents.map(item => <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                            <p className="mb-2 text-sm font-semibold cc-text-primary">{item.fileName} {item.status === "saved" ? "· Registrado" : "· Pendiente de revisión"}</p>
                            {item.warnings.map(warning => <p key={warning} className="text-xs text-warning-fg">{warning}</p>)}
                            <div className="mt-2 grid gap-2 sm:grid-cols-4">
                                <input aria-label="Concepto" placeholder="Concepto" value={item.label} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { label: event.target.value })} className="rounded-lg border p-2 text-sm" />
                                <input aria-label="Monto" placeholder="Monto" inputMode="numeric" value={item.amount || ""} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { amount: Number(event.target.value.replace(/[^\d]/g, "")) })} className="rounded-lg border p-2 text-sm" />
                                <input aria-label="Proveedor" placeholder="Proveedor" value={item.provider} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { provider: event.target.value })} className="rounded-lg border p-2 text-sm" />
                                <select aria-label="Categoría" value={item.category} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { category: event.target.value })} className="rounded-lg border p-2 text-sm">{CATEGORIES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <label className="text-xs cc-text-secondary">Período <input type="month" value={item.month} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { month: event.target.value })} className="ml-1 rounded-lg border p-2 text-sm" /></label>
                                <label className="text-xs cc-text-secondary">Reparto <select value={item.prorateMethod} disabled={item.status !== "pending"} onChange={event => editDocument(item.id, { prorateMethod: event.target.value === "equal" ? "equal" : "share" })} className="ml-1 rounded-lg border p-2 text-sm"><option value="share">Por alícuota</option><option value="equal">En partes iguales</option></select></label>
                            </div>
                            {item.status !== "saved" && <div className="mt-2 flex gap-2"><Button type="button" onClick={() => void saveDocument(item.id)} disabled={item.status === "saving"}>Confirmar y registrar</Button>
                                <Button type="button" variant="ghost" onClick={() => discardDocument(item.id)} disabled={item.status === "saving"}>Descartar</Button></div>}
                        </div>)}</div>
                    </section>
                )}

                {!issuedRun && (
                    <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                Agregar egreso
                            </h2>
                            <Button
                                type="button"
                                onClick={() => void copyPreviousMonth()}
                                disabled={saving}
                                className="text-xs"
                                style={{ background: "transparent", color: "var(--cc-ink)", border: "1px solid var(--cc-line)" }}
                            >
                                <Copy className="mr-2 h-3.5 w-3.5" />
                                Copiar egresos del mes anterior
                            </Button>
                        </div>
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
                                            {item.prorate_method === "equal" ? "Partes iguales" : item.prorate_method === "consumption" ? "Por consumo de agua" : "Por alícuota"}
                                        </p>
                                        {item.document_url && <a href={`/api/finance-documents/${item.id}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-700 underline">Ver respaldo</a>}
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

                {preview && preview.units.length > 0 && preview.totalCharged > 0 && (
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
                        {preview.billingMode === "fixed" ? (
                            <p className="text-xs cc-text-tertiary">Cuota fija: el total a cobrar no tiene que coincidir con los egresos cargados.</p>
                        ) : preview.totalCharged === preview.totalExpenses ? (
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
