"use client";

import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, CalendarClock, Check, Loader2, Pencil, X } from "lucide-react";
import { ProviderPortalService } from "@/lib/api";
import { ProviderProfileForm } from "@/components/services/ProviderProfileForm";
import { ProviderMediaManager } from "@/components/services/ProviderMediaManager";
import type { ProviderPortalClientProps, ProviderPortalData, ProviderPortalRequest, ServiceRequestStatus } from "@/lib/types";

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
    pending: "Nueva",
    accepted: "Aceptada",
    awaiting_confirmation: "Realizada, esperando confirmación del residente",
    completed: "Completada",
    cancelled: "Cancelada",
};

function formatDate(date: string, time: string) {
    const parsed = new Date(`${date}T12:00:00`);
    const day = Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });
    return `${day} a las ${time}`;
}

const card = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

/** Portal del maestro externo: su perfil y sus solicitudes, con el enlace que le envió la administración. */
export function ProviderPortalClient({ token }: ProviderPortalClientProps) {
    const [data, setData] = useState<ProviderPortalData | null>(null);
    const [loadError, setLoadError] = useState("");
    const [editing, setEditing] = useState(false);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState("");
    const [rescheduling, setRescheduling] = useState<string | null>(null);
    const [schedule, setSchedule] = useState({ date: "", time: "" });

    const load = useCallback(async () => {
        try {
            setData(await ProviderPortalService.load(token));
            setLoadError("");
        } catch (error) {
            setLoadError(error instanceof Error ? error.message : "No se pudo abrir el enlace.");
        }
    }, [token]);

    useEffect(() => { void load(); }, [load]);

    const respond = async (request: ProviderPortalRequest, status: ServiceRequestStatus, reschedule?: { date: string; time: string }) => {
        setBusy(request.id);
        setNotice("");
        try {
            await ProviderPortalService.updateRequest(token, request.id, status, reschedule);
            setRescheduling(null);
            setNotice(reschedule ? "Propusiste un nuevo horario: el residente lo verá en su solicitud." : "Solicitud actualizada.");
            await load();
        } catch (error) {
            setNotice(error instanceof Error ? error.message : "No se pudo actualizar.");
        } finally {
            setBusy(null);
        }
    };

    if (loadError) {
        return (
            <main className="mx-auto flex min-h-screen max-w-xl items-center px-4" style={{ background: "var(--cc-ivory)" }}>
                <div className="w-full rounded-2xl border p-8 text-center" style={card}>
                    <h1 className="text-xl font-semibold cc-text-primary">Portal del proveedor</h1>
                    <p className="mt-2 text-sm cc-text-secondary">{loadError}</p>
                </div>
            </main>
        );
    }
    if (!data) {
        return (
            <main className="flex min-h-screen items-center justify-center" style={{ background: "var(--cc-ivory)" }}>
                <Loader2 className="h-6 w-6 animate-spin cc-text-secondary" />
            </main>
        );
    }

    const open = data.requests.filter(request => ["pending", "accepted", "awaiting_confirmation"].includes(request.status));
    const closed = data.requests.filter(request => !open.includes(request));

    return (
        <main className="min-h-screen px-4 py-8" style={{ background: "var(--cc-ivory)" }}>
            <div className="mx-auto max-w-3xl space-y-5">
                <header className="rounded-2xl border p-5" style={card}>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--cc-copper)" }}>{data.communityName}</p>
                    <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold cc-text-primary">
                        {data.provider.name}
                        {data.provider.verified && <BadgeCheck className="h-5 w-5" style={{ color: "var(--cc-sage)" }} aria-label="Verificado" />}
                    </h1>
                    <p className="mt-1 text-sm cc-text-secondary">
                        Desde aquí editas tu perfil y respondes las solicitudes de los vecinos. Este enlace es personal: no lo compartas.
                        Vence el {new Date(data.expiresAt).toLocaleDateString("es-CL")}.
                    </p>
                    <button type="button" onClick={() => setEditing(value => !value)} className="mt-3 inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                        <Pencil className="h-4 w-4" /> {editing ? "Cerrar edición" : "Editar mi perfil"}
                    </button>
                    {editing && (
                        <div className="mt-4">
                            <ProviderProfileForm
                                initial={data.provider}
                                onCancel={() => setEditing(false)}
                                onSubmit={async input => {
                                    await ProviderPortalService.updateProfile(token, input);
                                    setEditing(false);
                                    setNotice("Perfil actualizado.");
                                    await load();
                                }}
                            />
                        </div>
                    )}
                </header>

                {notice && <p className="rounded-xl border px-4 py-3 text-sm cc-text-primary" style={card} role="status">{notice}</p>}

                <ProviderMediaManager
                    target={{ kind: "portal", token }}
                    photo={data.provider.photo}
                    workPhotos={data.workPhotos}
                    documents={data.documents}
                    onChanged={() => void load()}
                />

                <section className="space-y-3">
                    <h2 className="text-lg font-semibold cc-text-primary">Solicitudes abiertas ({open.length})</h2>
                    {open.length === 0 && <p className="text-sm cc-text-secondary">No tienes solicitudes abiertas. Te llegarán aquí cuando un vecino te pida un servicio.</p>}
                    {open.map(request => (
                        <article key={request.id} className="rounded-2xl border p-4" style={card}>
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                    <p className="text-sm font-semibold cc-text-primary">
                                        {data.network ? `${request.communityName} · ` : ""}{request.requesterName}{request.requesterUnit ? ` · ${request.requesterUnit}` : ""}
                                    </p>
                                    <p className="text-xs cc-text-secondary">{formatDate(request.preferredDate, request.preferredTime)}</p>
                                </div>
                                <span className="rounded-full px-3 py-1 text-xs font-semibold" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-copper)" }}>
                                    {STATUS_LABEL[request.status]}
                                </span>
                            </div>
                            <p className="mt-2 text-sm cc-text-primary">{request.description}</p>

                            {rescheduling === request.id ? (
                                <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void respond(request, "pending", schedule); }}>
                                    <label className="text-xs cc-text-secondary">Fecha
                                        <input required type="date" className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: "var(--cc-line-strong)" }} value={schedule.date} onChange={event => setSchedule({ ...schedule, date: event.target.value })} />
                                    </label>
                                    <label className="text-xs cc-text-secondary">Hora
                                        <input required type="time" className="mt-1 block rounded-lg border px-2 py-1.5 text-sm" style={{ borderColor: "var(--cc-line-strong)" }} value={schedule.time} onChange={event => setSchedule({ ...schedule, time: event.target.value })} />
                                    </label>
                                    <button type="submit" disabled={busy === request.id} className="rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--cc-copper)" }}>Proponer horario</button>
                                    <button type="button" onClick={() => setRescheduling(null)} className="rounded-lg border px-3 py-2 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line-strong)" }}>Cancelar</button>
                                </form>
                            ) : (
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {request.status === "pending" && (
                                        <button type="button" disabled={busy === request.id} onClick={() => void respond(request, "accepted")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--cc-sage)" }}>
                                            <Check className="h-3.5 w-3.5" /> Aceptar
                                        </button>
                                    )}
                                    {request.status === "accepted" && (
                                        <button type="button" disabled={busy === request.id} onClick={() => void respond(request, "awaiting_confirmation")} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50" style={{ background: "var(--cc-sage)" }}>
                                            <Check className="h-3.5 w-3.5" /> Marcar como realizado
                                        </button>
                                    )}
                                    {["pending", "accepted"].includes(request.status) && (
                                        <>
                                            <button type="button" disabled={busy === request.id} onClick={() => { setRescheduling(request.id); setSchedule({ date: request.preferredDate, time: request.preferredTime }); }} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs cc-text-primary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                                                <CalendarClock className="h-3.5 w-3.5" /> Proponer otro horario
                                            </button>
                                            <button type="button" disabled={busy === request.id} onClick={() => { if (window.confirm("¿Rechazar o cancelar esta solicitud?")) void respond(request, "cancelled"); }} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs cc-text-secondary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                                                <X className="h-3.5 w-3.5" /> Rechazar
                                            </button>
                                        </>
                                    )}
                                </div>
                            )}
                        </article>
                    ))}
                </section>

                {closed.length > 0 && (
                    <section className="space-y-2">
                        <h2 className="text-lg font-semibold cc-text-primary">Historial</h2>
                        {closed.map(request => (
                            <div key={request.id} className="flex flex-wrap justify-between gap-2 rounded-xl border px-4 py-3 text-sm" style={card}>
                                <span className="cc-text-primary">{request.requesterName} · {formatDate(request.preferredDate, request.preferredTime)}</span>
                                <span className="cc-text-secondary">{STATUS_LABEL[request.status]}</span>
                            </div>
                        ))}
                    </section>
                )}
            </div>
        </main>
    );
}
