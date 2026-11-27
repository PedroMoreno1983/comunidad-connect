"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BellOff, BellRing, Check, Copy, Droplets, ExternalLink, Flame, FileUp, Loader2, Lock, Plus, Route, Smartphone, Trash2, Wifi, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { useToast } from "@/components/ui/Toast";
import { UtilityAccountsService } from "@/lib/api";
import { todayInChile, formatFinanceDate } from "@/lib/finance/chileDates";
import {
    UTILITY_PROVIDERS, UTILITY_SERVICES, UTILITY_SERVICE_LABELS, daysBetween, findUtilityProvider, nextDueDate, normalizeCustomerNumber,
} from "@/lib/utilities/providers";
import type { PersonalBillService, ResidentUtilityAccount } from "@/lib/types";

const SERVICE_ICONS: Record<PersonalBillService, typeof Zap> = {
    electricity: Zap, water: Droplets, gas: Flame, internet: Wifi, highway: Route, mobile: Smartphone,
};
const field = "w-full rounded-lg border px-3 py-2 text-sm";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" };

/** Estado de la cuenta para el próximo vencimiento. */
function dueStatus(account: ResidentUtilityAccount, today: string) {
    if (account.billDueDate) {
        return { dueDate: account.billDueDate, days: daysBetween(today, account.billDueDate),
            paid: account.lastPaidBillDueDate === account.billDueDate, period: account.billDueDate.slice(0, 7) };
    }
    if (!account.dueDay) {
        const paid = account.lastPaidPeriod === today.slice(0, 7);
        return { dueDate: null, days: null, paid, period: today.slice(0, 7) };
    }
    const dueDate = nextDueDate(account.dueDay, today);
    const period = dueDate.slice(0, 7);
    return { dueDate, days: daysBetween(today, dueDate), paid: account.lastPaidPeriod === period, period };
}

export function PersonalBills({ canReceiveReminders }: { canReceiveReminders: boolean }) {
    const { toast } = useToast();
    const [accounts, setAccounts] = useState<ResidentUtilityAccount[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [saving, setSaving] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const [service, setService] = useState<PersonalBillService>("electricity");
    const [provider, setProvider] = useState("enel");
    const [customerNumber, setCustomerNumber] = useState("");
    const [dueDay, setDueDay] = useState("");
    const [alias, setAlias] = useState("");
    const [editing, setEditing] = useState<ResidentUtilityAccount | null>(null);
    const [billDueDate, setBillDueDate] = useState("");
    const [billAmount, setBillAmount] = useState("");
    const [readingBill, setReadingBill] = useState(false);
    const [billMessage, setBillMessage] = useState("");
    const formRef = useRef<HTMLFormElement>(null);
    const today = todayInChile();

    const load = useCallback(async () => {
        try {
            setAccounts(await UtilityAccountsService.list());
        } catch (error) {
            toast({ title: "No pudimos cargar tus servicios", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    useEffect(() => {
        if (showForm) formRef.current?.scrollIntoView({ block: "nearest" });
    }, [showForm, editing]);

    const providersForService = useMemo(() => UTILITY_PROVIDERS.filter(item => item.service === service)
        .sort((a, b) => a.name.localeCompare(b.name, "es-CL")), [service]);
    const selectedProvider = findUtilityProvider(provider);

    function chooseService(next: PersonalBillService) {
        setService(next);
        chooseProvider(UTILITY_PROVIDERS.find(item => item.service === next)?.id ?? "");
    }

    function chooseProvider(next: string) {
        if (next === provider) return;
        setProvider(next);
        setCustomerNumber("");
        setBillDueDate("");
        setBillAmount("");
        setBillMessage("");
    }

    function openForm(account: ResidentUtilityAccount | null = null) {
        setEditing(account);
        setService(account?.service ?? "electricity");
        setProvider(account?.provider ?? "enel");
        setCustomerNumber(account?.customerNumber ?? "");
        setDueDay(account?.dueDay?.toString() ?? "");
        setAlias(account?.alias ?? "");
        setBillDueDate(account?.billDueDate ?? "");
        setBillAmount(account?.billAmount?.toString() ?? "");
        setBillMessage("");
        setShowForm(true);
    }

    async function readBill(file: File) {
        setReadingBill(true);
        setBillMessage("");
        try {
            const bill = await UtilityAccountsService.readBill(file);
            const usesCustomerNumber = /^(n°|código)/i.test(selectedProvider?.customerNumberLabel ?? "");
            const idOnBill = bill.customerNumber;
            if (usesCustomerNumber && idOnBill && customerNumber && normalizeCustomerNumber(customerNumber) !== idOnBill) {
                setBillMessage("El número de esta boleta no coincide con la cuenta. Verifica que elegiste el archivo correcto.");
                return;
            }
            const acceptsCustomerNumber = usesCustomerNumber || selectedProvider?.customerNumberLabel.includes("código de cliente");
            if (acceptsCustomerNumber && idOnBill && !customerNumber) setCustomerNumber(idOnBill);
            setBillDueDate(bill.dueDate ?? "");
            setBillAmount(bill.amount?.toString() ?? "");
            setBillMessage("Revisa los datos leídos y completa los campos que hayan quedado vacíos antes de guardar.");
        } catch (error) {
            setBillMessage(error instanceof Error ? error.message : "No pudimos leer la boleta.");
        } finally {
            setReadingBill(false);
        }
    }

    async function addAccount(event: React.FormEvent) {
        event.preventDefault();
        setSaving(true);
        try {
            const bill = { billDueDate: billDueDate || null, billAmount: billAmount === "" ? null : Number(billAmount) };
            const account = editing
                ? await UtilityAccountsService.update(editing.id, bill)
                : await UtilityAccountsService.create({
                    service, provider, customerNumber, alias, dueDay: dueDay ? Number(dueDay) : null, remindersEnabled: canReceiveReminders, ...bill,
                });
            setAccounts(current => editing ? current.map(item => item.id === account.id ? account : item) : [...current, account]);
            setShowForm(false);
            toast({ title: editing ? "Boleta actualizada" : "Cuenta guardada",
                description: canReceiveReminders && (account.billDueDate || account.dueDay) ? "Te avisaremos antes del vencimiento." : undefined });
        } catch (error) {
            toast({ title: "No se guardó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setSaving(false);
        }
    }

    async function update(account: ResidentUtilityAccount, changes: Parameters<typeof UtilityAccountsService.update>[1]) {
        setBusyId(account.id);
        try {
            const updated = await UtilityAccountsService.update(account.id, changes);
            setAccounts(current => current.map(item => item.id === updated.id ? updated : item));
        } catch (error) {
            toast({ title: "No se guardó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setBusyId(null);
        }
    }

    async function remove(account: ResidentUtilityAccount) {
        if (!window.confirm("¿Quitar esta cuenta de tus servicios?")) return;
        setBusyId(account.id);
        try {
            await UtilityAccountsService.remove(account.id);
            setAccounts(current => current.filter(item => item.id !== account.id));
        } catch (error) {
            toast({ title: "No se quitó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setBusyId(null);
        }
    }

    async function copyIdentifier(account: ResidentUtilityAccount) {
        const target = findUtilityProvider(account.provider);
        if (!target) return;
        try {
            await navigator.clipboard.writeText(account.customerNumber);
            toast({ title: "Dato de pago copiado", description: `Pégalo en el portal de ${target.name}.` });
        } catch {
            toast({ title: `Tu ${target.customerNumberLabel.toLowerCase()}: ${account.customerNumber}`, description: `Escríbelo en el portal de ${target.name}.` });
        }
    }

    return (
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-6 sm:py-10 md:px-8">
            <div className="space-y-2">
                <Eyebrow>Pagos personales</Eyebrow>
                <DisplayHeading size={32}>Cuentas</DisplayHeading>
                <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                    Organiza tus cuentas de agua, luz, gas, internet, autopistas y celular. Consulta el monto y paga en el portal de cada proveedor.
                </p>
                <p className="flex items-center gap-1.5 text-xs cc-text-tertiary">
                    <Lock className="h-3.5 w-3.5" /> Solo tú ves estas cuentas. La administración no tiene acceso.
                </p>
            </div>

            {loading ? (
                <p className="text-sm cc-text-secondary"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Cargando…</p>
            ) : accounts.length === 0 && !showForm ? (
                <EmptyState
                    icon={<Zap className="h-6 w-6" />}
                    title="Aún no registras servicios"
                    description="Elige un servicio y guarda el dato que pide la empresa para pagar."
                    action={<Button type="button" onClick={() => openForm()} disabled={saving || readingBill} leadingIcon={<Plus className="h-4 w-4" />}>Agregar cuenta</Button>}
                />
            ) : (
                <div className="space-y-3">
                    {accounts.map(account => {
                        const target = findUtilityProvider(account.provider);
                        const Icon = SERVICE_ICONS[account.service];
                        const status = dueStatus(account, today);
                        const urgent = !status.paid && status.days !== null && status.days <= 3;
                        return (
                            <article key={account.id} className="rounded-2xl border p-4 sm:p-5" style={{ borderColor: urgent ? "var(--cc-warning-fg)" : "var(--cc-line)", background: "var(--cc-paper)" }}>
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-start gap-3">
                                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--cc-bg-elevated)" }}>
                                            <Icon className="h-5 w-5 cc-text-secondary" />
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-semibold cc-text-primary">
                                                {UTILITY_SERVICE_LABELS[account.service]} · {target?.name ?? account.provider}
                                                {account.alias && <span className="font-normal cc-text-secondary"> · {account.alias}</span>}
                                            </p>
                                            <p className="break-all text-sm cc-text-secondary">{target?.customerNumberLabel ?? "N° de cliente"} {account.customerNumber}</p>
                                            <p className="mt-1 text-sm" style={{ color: status.paid ? "var(--cc-success-fg)" : urgent ? "var(--cc-warning-fg)" : "var(--cc-text-secondary)" }}>
                                                {status.paid
                                                    ? (status.dueDate ? `Marcada como pagada (vence ${formatFinanceDate(status.dueDate)})` : "Marcada como pagada este mes")
                                                    : status.dueDate
                                                        ? status.days === 0 ? "Vence hoy" : status.days !== null && status.days < 0
                                                            ? `Venció el ${formatFinanceDate(status.dueDate)}` : `Vence ${formatFinanceDate(status.dueDate)} · en ${status.days} ${status.days === 1 ? "día" : "días"}`
                                                        : "Sin fecha de vencimiento"}
                                            </p>
                                            {(account.billDueDate || account.billAmount != null) && (
                                                <p className="mt-1 text-sm cc-text-secondary">
                                                    Datos de la boleta guardada
                                                    {account.billAmount != null && ` · $${account.billAmount.toLocaleString("es-CL")}`}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {target && (
                                            <a href={target.payUrl} target="_blank" rel="noopener noreferrer"
                                                onClick={() => void copyIdentifier(account)}
                                                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold underline">
                                                Ir a pagar en {target.name} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                            </a>
                                        )}
                                        <Button type="button" size="sm" variant="outline" disabled={busyId === account.id}
                                            onClick={() => void update(account, account.billDueDate
                                                ? { paidBillDueDate: status.paid ? null : account.billDueDate }
                                                : { paidPeriod: status.paid ? null : status.period })}
                                            leadingIcon={status.paid ? undefined : <Check className="h-3.5 w-3.5" />}>
                                            {status.paid ? "Deshacer pagada" : "Ya pagué"}
                                        </Button>
                                    </div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                                    <button type="button" className="flex items-center gap-1 hover:underline" disabled={saving || readingBill}
                                        onClick={() => openForm(account)}>
                                        <FileUp className="h-3.5 w-3.5" /> {account.billDueDate || account.billAmount != null ? "Actualizar boleta" : "Cargar boleta"}
                                    </button>
                                    {target?.billUrl && (
                                        <a href={target.billUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                            <ExternalLink className="h-3.5 w-3.5" /> Pedir copia en {target.name}
                                        </a>
                                    )}
                                    {!account.billDueDate && <label className="flex items-center gap-1.5">
                                        Vence el día
                                        <input type="number" min={1} max={31} defaultValue={account.dueDay ?? ""} disabled={busyId === account.id}
                                            onBlur={event => {
                                                const value = event.target.value ? Number(event.target.value) : null;
                                                if (value !== account.dueDay) void update(account, { dueDay: value });
                                            }}
                                            className="w-16 rounded-lg border px-2 py-1 text-sm" style={fieldStyle} />
                                    </label>}
                                    {canReceiveReminders && <button type="button" className="flex items-center gap-1 hover:underline" disabled={busyId === account.id}
                                        onClick={() => void update(account, { remindersEnabled: !account.remindersEnabled })}>
                                        {account.remindersEnabled ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
                                        {account.remindersEnabled ? "Aviso activado" : "Aviso desactivado"}
                                    </button>}
                                    <button type="button" className="flex items-center gap-1 hover:underline" onClick={() => void copyIdentifier(account)}>
                                        <Copy className="h-3.5 w-3.5" /> Copiar dato de pago
                                    </button>
                                    <button type="button" className="ml-auto flex items-center gap-1 hover:underline" style={{ color: "var(--cc-danger-fg)" }} disabled={busyId === account.id} onClick={() => void remove(account)}>
                                        <Trash2 className="h-3.5 w-3.5" /> Quitar
                                    </button>
                                </div>
                            </article>
                        );
                    })}

                    {!showForm && (
                        <Button type="button" variant="outline" onClick={() => openForm()} disabled={saving || readingBill} leadingIcon={<Plus className="h-4 w-4" />}>Agregar cuenta</Button>
                    )}
                </div>
            )}

            {showForm && (
                <form ref={formRef} onSubmit={addAccount} className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="font-semibold cc-text-primary">{editing ? `Boleta de ${selectedProvider?.name ?? "esta cuenta"}` : "Agregar cuenta"}</h2>
                    {!editing && <>
                    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Servicio">
                        {UTILITY_SERVICES.map(option => {
                            const Icon = SERVICE_ICONS[option];
                            const active = option === service;
                            return (
                                <button key={option} type="button" role="radio" aria-checked={active} disabled={readingBill} onClick={() => chooseService(option)}
                                    className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm"
                                    style={{ borderColor: active ? "var(--cc-brand-500)" : "var(--cc-line)", color: active ? "var(--cc-brand-500)" : undefined }}>
                                    <Icon className="h-4 w-4" /> {UTILITY_SERVICE_LABELS[option]}
                                </button>
                            );
                        })}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs cc-text-secondary">Empresa
                            <select value={provider} disabled={readingBill} onChange={event => chooseProvider(event.target.value)} className={field} style={fieldStyle}>
                                {providersForService.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                            </select>
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">{selectedProvider?.customerNumberLabel ?? "N° de cliente"}
                            <input required disabled={readingBill} value={customerNumber} onChange={event => setCustomerNumber(event.target.value)} placeholder={selectedProvider?.customerNumberLabel ?? "Aparece en tu boleta"} autoComplete="off" maxLength={40}
                                className={field} style={fieldStyle} />
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Día habitual de vencimiento (opcional)
                            <input type="number" min={1} max={31} value={dueDay} onChange={event => setDueDay(event.target.value)} placeholder="Ej: 25"
                                className={field} style={fieldStyle} />
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Nombre (opcional)
                            <input value={alias} maxLength={60} onChange={event => setAlias(event.target.value)} placeholder="Ej: Depto, bodega"
                                className={field} style={fieldStyle} />
                        </label>
                    </div>
                    {selectedProvider && (
                        <details className="rounded-lg border p-3 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                            <summary className="cursor-pointer font-semibold">¿Dónde encuentro el dato para pagar?</summary>
                            <p className="mt-2">{selectedProvider.customerNumberLabel === "RUT del titular"
                                ? "Usa el RUT de la persona titular del servicio."
                                : "Busca el dato en una boleta anterior, en el correo de facturación o en la sucursal virtual de la empresa. También puedes leer el PDF más abajo."}</p>
                            <a href={selectedProvider.lookupUrl ?? selectedProvider.payUrl} target="_blank" rel="noopener noreferrer"
                                className="mt-1 inline-block font-semibold underline">
                                {selectedProvider.lookupUrl ? "Ver ayuda o buscar en" : "Abrir el portal de"} {selectedProvider.name}
                            </a>
                        </details>
                    )}
                    {selectedProvider?.billUrl && (
                        <a href={selectedProvider.billUrl} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold underline">
                            Pedir copia de la boleta en {selectedProvider.name}
                        </a>
                    )}
                    </>}
                    <label className="block space-y-1 text-sm" style={{ color: "var(--cc-ink)" }}>
                        <span className="font-semibold">Leer boleta PDF</span>
                        <input type="file" accept=".pdf,application/pdf" disabled={readingBill || saving}
                            onChange={event => {
                                const file = event.currentTarget.files?.[0];
                                event.currentTarget.value = "";
                                if (file) void readBill(file);
                            }} className={`block ${field}`} style={fieldStyle} />
                        <span className="block text-xs cc-text-secondary">Usa el PDF original de la empresa (hasta 3 MB). Se guardan los datos que confirmes.</span>
                    </label>
                    {readingBill && <p role="status" className="text-sm">Leyendo boleta…</p>}
                    {billMessage && <p role="status" className="text-sm cc-text-secondary">{billMessage}</p>}
                    <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1 text-xs cc-text-secondary">Vencimiento de esta boleta
                            <input type="date" value={billDueDate} disabled={readingBill} onChange={event => setBillDueDate(event.target.value)}
                                className={field} style={fieldStyle} />
                        </label>
                        <label className="space-y-1 text-xs cc-text-secondary">Total de esta boleta ($)
                            <input type="number" min={0} max={2147483647} step={1} value={billAmount} disabled={readingBill}
                                onChange={event => setBillAmount(event.target.value)} className={field} style={fieldStyle} />
                        </label>
                    </div>
                    <div className="flex gap-2">
                        <Button type="submit" disabled={saving || readingBill || !customerNumber.trim()}>{saving ? "Guardando…" : "Guardar"}</Button>
                        <Button type="button" variant="ghost" disabled={readingBill || saving} onClick={() => setShowForm(false)}>Cancelar</Button>
                    </div>
                </form>
            )}

            <p className="text-xs cc-text-tertiary">
                Paga en el portal externo. Al volver, puedes marcar «Ya pagué» para llevar tu registro.
            </p>
        </div>
    );
}
