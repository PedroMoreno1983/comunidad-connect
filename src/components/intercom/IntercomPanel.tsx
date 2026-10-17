"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { BellRing, Check, DoorOpen, Loader2, Phone, X } from "lucide-react";
import { IntercomService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { IntercomCall, IntercomCallStatus, IntercomVisitKind, UnitRow } from "@/lib/types";

const KIND_LABELS: Record<IntercomVisitKind, string> = {
    visit: "Visita",
    delivery: "Delivery",
    service: "Servicio técnico",
    other: "Otro",
};

const STATUS_LABELS: Record<IntercomCallStatus, string> = {
    ringing: "Sonando…",
    approved: "Aprobada",
    rejected: "Rechazada",
    cancelled: "Cancelada",
    expired: "Sin respuesta",
    admitted: "Ingresó",
};

const STATUS_COLORS: Record<IntercomCallStatus, string> = {
    ringing: "var(--cc-copper)",
    approved: "var(--cc-success, #2f7d4f)",
    rejected: "var(--cc-danger, #b3402d)",
    cancelled: "var(--cc-ink-faint)",
    expired: "var(--cc-ink-faint)",
    admitted: "var(--cc-success, #2f7d4f)",
};

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

/**
 * Citófono digital de conserjería: pregunta a la unidad antes de dejar pasar.
 * Mientras alguna llamada espera respuesta o ingreso, la lista se refresca sola.
 */
export function IntercomPanel({ units, onAdmitted }: { units: UnitRow[]; onAdmitted?: () => void }) {
    const { toast } = useToast();
    const [calls, setCalls] = useState<IntercomCall[]>([]);
    const [unitId, setUnitId] = useState("");
    const [visitorName, setVisitorName] = useState("");
    const [visitKind, setVisitKind] = useState<IntercomVisitKind>("visit");
    const [busy, setBusy] = useState(false);
    // Teléfonos de la unidad, para llamar a la antigua si nadie contesta en la app.
    const [phones, setPhones] = useState<Record<string, { name: string; phone: string }[]>>({});

    const load = useCallback(async () => {
        try {
            const data = await IntercomService.getCalls();
            setCalls(data.calls);
        } catch {
            // El citófono no debe tumbar la página de visitas.
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const waiting = calls.some(call => call.status === "ringing" || (call.status === "approved" && !call.admitted));
    useEffect(() => {
        if (!waiting) return;
        const timer = setInterval(() => void load(), 2500);
        return () => clearInterval(timer);
    }, [waiting, load]);

    async function ring(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await IntercomService.call({ unitId, visitorName, visitKind });
            setPhones(prev => ({ ...prev, [result.call.id]: result.phones }));
            setCalls(prev => [result.call, ...prev]);
            setVisitorName("");
            toast({
                title: result.reachableInApp ? "Llamando a la unidad" : "La unidad no tiene residentes en la app",
                description: result.reachableInApp
                    ? `Le sonó a ${result.reachableInApp} persona(s). Espera la respuesta aquí.`
                    : "Llama por teléfono para confirmar la visita.",
                variant: result.reachableInApp ? "success" : "destructive",
            });
        } catch (error) {
            toast({ title: "No se pudo llamar", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    async function act(call: IntercomCall, action: "cancel" | "admit") {
        setBusy(true);
        try {
            const { call: updated } = await IntercomService.act(call.id, action);
            setCalls(prev => prev.map(item => item.id === updated.id ? updated : item));
            if (action === "admit") {
                onAdmitted?.();
                toast({
                    title: "Ingreso registrado",
                    description: updated.gateStatus === "opened"
                        ? "El portón recibió la orden de abrir."
                        : updated.gateStatus === "failed"
                            ? "Quedó en la bitácora, pero el portón no respondió: ábrelo a mano."
                            : "Quedó en la bitácora.",
                    variant: updated.gateStatus === "failed" ? "destructive" : "success",
                });
            }
        } catch (error) {
            toast({ title: "No se pudo completar", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                <h2 className="text-lg font-semibold cc-text-primary">Citófono digital</h2>
            </div>
            <p className="text-sm cc-text-secondary">
                Pregunta a la unidad desde aquí: al residente le suena en la app y responde con un toque.
            </p>

            <form onSubmit={event => void ring(event)} className="grid gap-3 sm:grid-cols-4">
                <label className="text-sm cc-text-secondary">
                    Unidad
                    <select className={`${fieldClass} mt-1`} style={fieldStyle} value={unitId} onChange={event => setUnitId(event.target.value)} required>
                        <option value="">Elige…</option>
                        {units.map(unit => <option key={unit.id} value={unit.id}>{unit.number}</option>)}
                    </select>
                </label>
                <label className="text-sm cc-text-secondary sm:col-span-2">
                    ¿Quién llega?
                    <input className={`${fieldClass} mt-1`} style={fieldStyle} value={visitorName} onChange={event => setVisitorName(event.target.value)} placeholder="Nombre o empresa" required minLength={2} />
                </label>
                <label className="text-sm cc-text-secondary">
                    Tipo
                    <select className={`${fieldClass} mt-1`} style={fieldStyle} value={visitKind} onChange={event => setVisitKind(event.target.value as IntercomVisitKind)}>
                        {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <div className="sm:col-span-4">
                    <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cc-paper)] disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                        Llamar a la unidad
                    </button>
                </div>
            </form>

            {calls.length > 0 && (
                <ul className="divide-y rounded-xl border" style={{ borderColor: "var(--cc-line)" }}>
                    {calls.slice(0, 8).map(call => (
                        <li key={call.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                            <div>
                                <p className="font-medium cc-text-primary">{call.visitorName} · Unidad {call.unitNumber ?? "?"}</p>
                                <p className="text-xs cc-text-tertiary">
                                    {KIND_LABELS[call.visitKind]} · {new Date(call.createdAt).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                                {call.status === "expired" && (phones[call.id]?.length ?? 0) > 0 && (
                                    <p className="mt-1 flex flex-wrap gap-3 text-xs cc-text-secondary">
                                        {phones[call.id].map(contact => (
                                            <a key={contact.phone} href={`tel:${contact.phone}`} className="inline-flex items-center gap-1 underline">
                                                <Phone className="h-3 w-3" /> {contact.name}
                                            </a>
                                        ))}
                                    </p>
                                )}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs font-semibold" style={{ color: STATUS_COLORS[call.status] }}>
                                    {call.status === "ringing" && <Loader2 className="mr-1 inline h-3 w-3 animate-spin" />}
                                    {STATUS_LABELS[call.status]}
                                </span>
                                {call.status === "ringing" && (
                                    <button type="button" disabled={busy} onClick={() => void act(call, "cancel")} className="inline-flex items-center gap-1 text-xs underline cc-text-secondary">
                                        <X className="h-3 w-3" /> Cancelar
                                    </button>
                                )}
                                {call.status === "approved" && !call.admitted && (
                                    <button type="button" disabled={busy} onClick={() => void act(call, "admit")} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--cc-paper)]" style={{ background: "var(--cc-ink)" }}>
                                        <DoorOpen className="h-3.5 w-3.5" /> Dejar pasar
                                    </button>
                                )}
                                {call.status === "admitted" && <Check className="h-4 w-4" style={{ color: STATUS_COLORS.admitted }} />}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
