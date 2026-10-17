"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { InvoicingService } from "@/lib/api";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useToast } from "@/components/ui/Toast";
import { documentTotals } from "@/lib/finance/taxDocumentBuilder";
import { todayInChile } from "@/lib/finance/chileDates";
import type { InvoicingEmitter, InvoicingSettingsView, TaxDocument, TaxDocumentItem, TaxDocumentReceiver, TaxDocumentType } from "@/lib/types";

const money = (value: number) => `$${Math.round(value).toLocaleString("es-CL")}`;
const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };
const cardStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

const EMPTY_EMITTER: InvoicingEmitter = { rut: "", businessName: "", activity: "", activityCode: "", address: "", commune: "", branchCode: "" };
const EMPTY_RECEIVER: TaxDocumentReceiver = { rut: "", businessName: "", activity: "", address: "", commune: "" };
const EMPTY_ITEM = { name: "", quantity: "1", unitPrice: "" };

const TYPE_LABELS: Record<TaxDocumentType, string> = { 33: "Factura afecta (33)", 34: "Factura exenta (34)" };

function Field({ label, value, onChange, placeholder, required = true, className = "" }: {
    label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; className?: string;
}) {
    return (
        <label className={`text-sm cc-text-secondary ${className}`}>
            {label}
            <input className={`${fieldClass} mt-1`} style={fieldStyle} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} required={required} />
        </label>
    );
}

export default function FacturacionPage() {
    const { toast } = useToast();
    const [settings, setSettings] = useState<InvoicingSettingsView | null>(null);
    const [documents, setDocuments] = useState<TaxDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [emitter, setEmitter] = useState<InvoicingEmitter>(EMPTY_EMITTER);
    const [environment, setEnvironment] = useState<"test" | "production">("test");
    const [apiKey, setApiKey] = useState("");
    const [editingSettings, setEditingSettings] = useState(false);
    const [type, setType] = useState<TaxDocumentType>(33);
    const [issueDate, setIssueDate] = useState(todayInChile);
    const [receiver, setReceiver] = useState<TaxDocumentReceiver>(EMPTY_RECEIVER);
    const [items, setItems] = useState([EMPTY_ITEM]);
    // Una clave por documento: si la emisión se reintenta, el proveedor no duplica.
    const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await InvoicingService.get();
            setSettings(data.settings);
            setDocuments(data.documents);
            if (data.settings.emitter) setEmitter({ ...EMPTY_EMITTER, ...data.settings.emitter });
            setEnvironment(data.settings.environment);
            setEditingSettings(!data.settings.configured);
        } catch (error) {
            toast({ title: "No se cargó la facturación", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    const parsedItems: TaxDocumentItem[] = useMemo(() => items.map(item => ({
        name: item.name,
        quantity: Number(item.quantity.replace(",", ".")) || 0,
        unitPrice: Number(item.unitPrice.replace(/[^\d]/g, "")) || 0,
    })), [items]);
    const totals = documentTotals({ type, items: parsedItems });

    async function saveSettings(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            const data = await InvoicingService.saveSettings({ environment, apiKey: apiKey || undefined, emitter });
            setSettings(data.settings);
            setApiKey("");
            setEditingSettings(false);
            toast({ title: "Emisor guardado", variant: "success" });
        } catch (error) {
            toast({ title: "No se guardó", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    async function issue(event: FormEvent) {
        event.preventDefault();
        if (settings?.environment === "production" && !window.confirm(`Vas a emitir ante el SII una ${TYPE_LABELS[type].toLowerCase()} por ${money(totals.total)} a ${receiver.businessName}. ¿Continuar?`)) return;
        setBusy(true);
        try {
            const { document } = await InvoicingService.issue({ type, issueDate, receiver, items: parsedItems }, idempotencyKey);
            toast({
                title: document.folio ? `Folio ${document.folio} emitido` : "Documento emitido",
                description: document.warnings.length ? `Aviso del SII: ${document.warnings.join(" ")}` : undefined,
                variant: "success",
            });
            setReceiver(EMPTY_RECEIVER);
            setItems([EMPTY_ITEM]);
            setIdempotencyKey(crypto.randomUUID());
            await load();
        } catch (error) {
            // La misma clave se conserva: reintentar no emite dos veces.
            toast({ title: "No se emitió", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    const setItem = (index: number, key: keyof typeof EMPTY_ITEM, value: string) =>
        setItems(prev => prev.map((item, i) => i === index ? { ...item, [key]: value } : item));

    return (
        <ErrorBoundary name="Facturación electrónica">
            <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
                <Link href="/admin/finanzas" className="inline-flex items-center gap-2 text-sm cc-text-tertiary hover:underline">
                    <ArrowLeft className="h-4 w-4" /> Finanzas
                </Link>
                <header>
                    <Eyebrow className="mb-2">SII</Eyebrow>
                    <DisplayHeading size={32}>Facturación electrónica</DisplayHeading>
                    <p className="mt-2 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Emite facturas afectas y exentas timbradas a través de OpenFactura. Úsala para honorarios de administración,
                        arriendo de espacios comunes (antenas, estacionamientos, publicidad) o servicios a terceros.
                    </p>
                </header>

                {loading ? (
                    <p className="flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</p>
                ) : (
                    <>
                        {settings && !settings.encryptionReady && (
                            <p className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                El servidor aún no tiene la clave de cifrado para guardar credenciales. Avisa a soporte antes de configurar el emisor.
                            </p>
                        )}

                        {editingSettings ? (
                            <form onSubmit={event => void saveSettings(event)} className="space-y-4 rounded-2xl border p-5" style={cardStyle}>
                                <h2 className="font-semibold cc-text-primary">Emisor</h2>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label="RUT" value={emitter.rut} onChange={value => setEmitter(prev => ({ ...prev, rut: value }))} placeholder="76.795.561-8" />
                                    <Field label="Razón social" className="sm:col-span-2" value={emitter.businessName} onChange={value => setEmitter(prev => ({ ...prev, businessName: value }))} />
                                    <Field label="Giro" className="sm:col-span-2" value={emitter.activity} onChange={value => setEmitter(prev => ({ ...prev, activity: value }))} />
                                    <Field label="Código actividad SII" value={emitter.activityCode} onChange={value => setEmitter(prev => ({ ...prev, activityCode: value }))} placeholder="682000" />
                                    <Field label="Dirección" className="sm:col-span-2" value={emitter.address} onChange={value => setEmitter(prev => ({ ...prev, address: value }))} />
                                    <Field label="Comuna" value={emitter.commune} onChange={value => setEmitter(prev => ({ ...prev, commune: value }))} />
                                    <Field label="Código sucursal SII" required={false} value={emitter.branchCode || ""} onChange={value => setEmitter(prev => ({ ...prev, branchCode: value }))} placeholder="Opcional" />
                                    <label className="text-sm cc-text-secondary">
                                        Ambiente
                                        <select className={`${fieldClass} mt-1`} style={fieldStyle} value={environment} onChange={event => setEnvironment(event.target.value as "test" | "production")}>
                                            <option value="test">Pruebas (sin valor tributario)</option>
                                            <option value="production">Producción (SII)</option>
                                        </select>
                                    </label>
                                    <Field
                                        label={settings?.apiKeyHint ? `API key OpenFactura (actual …${settings.apiKeyHint})` : "API key OpenFactura"}
                                        required={!settings?.configured}
                                        value={apiKey}
                                        onChange={setApiKey}
                                        placeholder={settings?.configured ? "Déjala vacía para mantenerla" : ""}
                                    />
                                </div>
                                <div className="flex gap-3">
                                    <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cc-paper)] disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>Guardar emisor</button>
                                    {settings?.configured && <button type="button" className="text-sm underline cc-text-secondary" onClick={() => setEditingSettings(false)}>Cancelar</button>}
                                </div>
                            </form>
                        ) : settings?.emitter && (
                            <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-5" style={cardStyle}>
                                <div>
                                    <p className="font-semibold cc-text-primary">{settings.emitter.businessName} · {settings.emitter.rut}</p>
                                    <p className="text-sm cc-text-secondary">
                                        {settings.environment === "production" ? "Emitiendo en producción ante el SII" : "Ambiente de pruebas: los documentos no tienen valor tributario"}
                                    </p>
                                </div>
                                <button type="button" className="text-sm underline cc-text-secondary" onClick={() => setEditingSettings(true)}>Editar emisor</button>
                            </section>
                        )}

                        {settings?.configured && (
                            <form onSubmit={event => void issue(event)} className="space-y-4 rounded-2xl border p-5" style={cardStyle}>
                                <div className="flex flex-wrap items-end gap-3">
                                    <h2 className="mr-auto font-semibold cc-text-primary">Nuevo documento</h2>
                                    <label className="text-sm cc-text-secondary">
                                        Tipo
                                        <select className={`${fieldClass} mt-1`} style={fieldStyle} value={type} onChange={event => setType(Number(event.target.value) as TaxDocumentType)}>
                                            <option value={33}>{TYPE_LABELS[33]}</option>
                                            <option value={34}>{TYPE_LABELS[34]}</option>
                                        </select>
                                    </label>
                                    <label className="text-sm cc-text-secondary">
                                        Fecha
                                        <input className={`${fieldClass} mt-1`} style={fieldStyle} type="date" value={issueDate} onChange={event => setIssueDate(event.target.value)} required />
                                    </label>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-3">
                                    <Field label="RUT receptor" value={receiver.rut} onChange={value => setReceiver(prev => ({ ...prev, rut: value }))} />
                                    <Field label="Razón social" className="sm:col-span-2" value={receiver.businessName} onChange={value => setReceiver(prev => ({ ...prev, businessName: value }))} />
                                    <Field label="Giro" value={receiver.activity} onChange={value => setReceiver(prev => ({ ...prev, activity: value }))} />
                                    <Field label="Dirección" value={receiver.address} onChange={value => setReceiver(prev => ({ ...prev, address: value }))} />
                                    <Field label="Comuna" value={receiver.commune} onChange={value => setReceiver(prev => ({ ...prev, commune: value }))} />
                                </div>

                                <div className="space-y-2">
                                    {items.map((item, index) => (
                                        <div key={index} className="grid items-end gap-2 sm:grid-cols-[1fr_90px_140px_32px]">
                                            <Field label={index === 0 ? "Descripción" : ""} value={item.name} onChange={value => setItem(index, "name", value)} placeholder="Honorarios de administración octubre" />
                                            <Field label={index === 0 ? "Cantidad" : ""} value={item.quantity} onChange={value => setItem(index, "quantity", value)} />
                                            <Field label={index === 0 ? (type === 33 ? "Precio neto" : "Precio") : ""} value={item.unitPrice} onChange={value => setItem(index, "unitPrice", value)} />
                                            <button type="button" aria-label="Quitar ítem" disabled={items.length === 1} onClick={() => setItems(prev => prev.filter((_, i) => i !== index))} className="mb-2 cc-text-tertiary disabled:opacity-30">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => setItems(prev => [...prev, EMPTY_ITEM])} className="inline-flex items-center gap-1 text-sm underline cc-text-secondary">
                                        <Plus className="h-4 w-4" /> Agregar ítem
                                    </button>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4" style={{ borderColor: "var(--cc-line)" }}>
                                    <p className="text-sm cc-text-secondary">
                                        {type === 33 ? <>Neto {money(totals.net)} · IVA {money(totals.tax)} · </> : <>Exento · </>}
                                        <strong className="cc-text-primary">Total {money(totals.total)}</strong>
                                    </p>
                                    <button type="submit" disabled={busy || totals.total <= 0} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cc-paper)] disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                                        {busy && <Loader2 className="h-4 w-4 animate-spin" />} Emitir
                                    </button>
                                </div>
                            </form>
                        )}

                        {documents.length > 0 && (
                            <section className="overflow-x-auto rounded-2xl border" style={cardStyle}>
                                <table className="w-full text-sm">
                                    <thead style={{ background: "var(--cc-paper-warm)" }}>
                                        <tr>
                                            {["Folio", "Tipo", "Receptor", "Fecha", "Total", ""].map(head => (
                                                <th key={head} className="px-4 py-2 text-left font-semibold cc-text-secondary">{head}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {documents.map(document => (
                                            <tr key={document.id} className="border-t align-top" style={{ borderColor: "var(--cc-line)" }}>
                                                <td className="px-4 py-2 cc-text-primary">
                                                    {document.folio ?? "—"}
                                                    {document.environment === "test" && <span className="ml-2 text-xs cc-text-tertiary">prueba</span>}
                                                </td>
                                                <td className="px-4 py-2 cc-text-secondary">{document.type}</td>
                                                <td className="px-4 py-2 cc-text-primary">{document.receiver.businessName}</td>
                                                <td className="px-4 py-2 cc-text-secondary">{document.issueDate}</td>
                                                <td className="px-4 py-2 cc-text-primary">{money(document.totals.total)}</td>
                                                <td className="px-4 py-2">
                                                    {document.hasPdf ? (
                                                        <a href={`/api/admin/invoicing/${document.id}/pdf`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline">
                                                            <FileText className="h-3.5 w-3.5" /> PDF
                                                        </a>
                                                    ) : (
                                                        <span className="text-xs cc-text-tertiary">{document.status === "failed" ? `Rechazado: ${document.error ?? ""}` : document.error ?? "Pendiente"}</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        )}
                    </>
                )}
            </div>
        </ErrorBoundary>
    );
}
