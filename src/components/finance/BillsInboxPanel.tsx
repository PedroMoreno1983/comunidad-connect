"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Inbox, Loader2, Mail } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { BillsInboxService } from "@/lib/api";
import { formatFinanceDate } from "@/lib/finance/chileDates";
import type { InboundBillDocument, InboundBillRegisterInput } from "@/lib/types";

type Edit = InboundBillRegisterInput;

/**
 * Bandeja de boletas que llegan solas por correo: la dirección de la comunidad,
 * cómo configurarla en cada empresa, y cada boleta leída por la IA para
 * registrarla como egreso en un clic.
 */
export function BillsInboxPanel({ month, categories, onRegistered }: {
    month: string;
    categories: ReadonlyArray<{ value: string; label: string }>;
    onRegistered: () => void;
}) {
    const { toast } = useToast();
    const [address, setAddress] = useState<string | null>(null);
    const [items, setItems] = useState<InboundBillDocument[]>([]);
    const [edits, setEdits] = useState<Record<string, Edit>>({});
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const data = await BillsInboxService.list();
            setAddress(data.address);
            setItems(data.items);
            setEdits(Object.fromEntries(data.items.map(item => [item.id, {
                month: item.draft?.suggestedMonth || month,
                label: item.draft?.label || item.subject || item.fileName,
                amount: item.draft?.amount || 0,
                category: item.draft?.category || "other",
                provider: item.draft?.provider || "",
                prorateMethod: item.draft?.suggestedProrateMethod || "share",
            }])));
        } catch {
            setItems([]);
        } finally {
            setLoading(false);
        }
    }, [month]);

    useEffect(() => { void load(); }, [load]);

    const edit = (id: string, changes: Partial<Edit>) => setEdits(current => ({ ...current, [id]: { ...current[id], ...changes } }));

    async function register(item: InboundBillDocument) {
        const values = edits[item.id];
        if (!values?.label.trim() || !(values.amount > 0)) {
            toast({ title: "Revisa la boleta", description: "Confirma concepto y monto mayor que cero.", variant: "destructive" });
            return;
        }
        setBusy(item.id);
        try {
            await BillsInboxService.register(item.id, values);
            setItems(current => current.filter(entry => entry.id !== item.id));
            toast({ title: "Egreso registrado", description: `${values.label} quedó en ${values.month} con la boleta como respaldo.`, variant: "success" });
            onRegistered();
        } catch (error) {
            toast({ title: "No se registró", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    }

    async function discard(item: InboundBillDocument) {
        setBusy(item.id);
        try {
            await BillsInboxService.discard(item.id);
            setItems(current => current.filter(entry => entry.id !== item.id));
        } catch (error) {
            toast({ title: "No se descartó", description: error instanceof Error ? error.message : "", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    }

    const input = "rounded-lg border p-2 text-sm";

    return (
        <section id="bandeja" className="scroll-mt-24 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--cc-bg-elevated)" }}>
                    <Inbox className="h-5 w-5 cc-text-secondary" />
                </span>
                <div>
                    <h2 className="font-semibold cc-text-primary">Boletas que llegan solas por correo</h2>
                    <p className="mt-1 text-sm cc-text-secondary">
                        Inscribe esta dirección como correo de la boleta electrónica de cada cuenta común (Enel, CGE, Aguas Andinas, Metrogas…), o reenvía ahí las boletas automáticamente desde tu correo. CoCo las lee y quedan aquí para registrarlas en un clic.
                    </p>
                </div>
            </div>

            {address ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <Mail className="h-4 w-4 cc-text-tertiary" />
                    <span className="break-all font-mono text-sm cc-text-primary">{address}</span>
                    <button type="button" className="ml-auto flex items-center gap-1 text-xs font-semibold text-copper hover:underline"
                        onClick={() => void navigator.clipboard.writeText(address).then(() => toast({ title: "Dirección copiada" }), () => undefined)}>
                        <Copy className="h-3.5 w-3.5" /> Copiar
                    </button>
                </div>
            ) : !loading && (
                <p className="mt-4 rounded-lg p-3 text-sm cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                    La recepción de boletas por correo se está activando. Mientras tanto, súbelas abajo en &ldquo;Boletas de luz, agua y gas&rdquo;.
                </p>
            )}

            {loading ? (
                <p className="mt-4 text-sm cc-text-secondary"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Revisando la bandeja…</p>
            ) : items.length === 0 ? (
                address && <p className="mt-4 text-sm cc-text-tertiary">No hay boletas por revisar.</p>
            ) : (
                <div className="mt-4 space-y-3">
                    {items.map(item => {
                        const values = edits[item.id];
                        return (
                            <div key={item.id} className="rounded-xl border p-3" style={{ borderColor: "var(--cc-line)" }}>
                                <p className="text-sm font-semibold cc-text-primary">{item.subject || item.fileName}</p>
                                <p className="text-xs cc-text-tertiary">De {item.from || "remitente desconocido"} · {formatFinanceDate(item.receivedAt)} · {item.fileName}</p>
                                {item.status === "failed" && <p className="mt-1 text-xs text-warning-fg">No se pudo procesar: {item.error}</p>}
                                {item.draft?.warnings.map(warning => <p key={warning} className="mt-1 text-xs text-warning-fg">{warning}</p>)}
                                {item.draft?.utility && (
                                    <p className="mt-1 text-xs cc-text-secondary">
                                        N° de cliente {item.draft.utility.customerNumber}
                                        {item.draft.utility.servicePeriod && ` · Consumo de ${item.draft.utility.servicePeriod}`}
                                        {item.draft.utility.dueDate && ` · Vence ${formatFinanceDate(item.draft.utility.dueDate)}`}
                                    </p>
                                )}
                                {item.status === "pending" && values && (
                                    <>
                                        <div className="mt-2 grid gap-2 sm:grid-cols-4">
                                            <input aria-label="Concepto" value={values.label} onChange={event => edit(item.id, { label: event.target.value })} className={input} />
                                            <input aria-label="Monto" inputMode="numeric" value={values.amount || ""} onChange={event => edit(item.id, { amount: Number(event.target.value.replace(/[^\d]/g, "")) })} className={input} />
                                            <select aria-label="Categoría" value={values.category} onChange={event => edit(item.id, { category: event.target.value })} className={input}>
                                                {categories.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                                            </select>
                                            <input aria-label="Mes" type="month" value={values.month} onChange={event => edit(item.id, { month: event.target.value })} className={input} />
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            <Button type="button" size="sm" disabled={busy === item.id} onClick={() => void register(item)}>Registrar egreso</Button>
                                            <Button type="button" size="sm" variant="ghost" disabled={busy === item.id} onClick={() => void discard(item)}>Descartar</Button>
                                        </div>
                                    </>
                                )}
                                {item.status === "failed" && (
                                    <Button type="button" size="sm" variant="ghost" className="mt-2" disabled={busy === item.id} onClick={() => void discard(item)}>Quitar de la bandeja</Button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}
