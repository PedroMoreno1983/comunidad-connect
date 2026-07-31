"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Download, Loader2, MessageCircle, Send, ShieldCheck } from "lucide-react";
import type {
    DataSubjectRequestRecord,
    DataSubjectRequestType,
    PrivacyConsentsResponse,
    PrivacyRequestsResponse,
} from "@/lib/types";

const requestLabels: Record<DataSubjectRequestType, string> = {
    access: "Acceso a mis datos",
    rectification: "Rectificación",
    deletion: "Supresión o eliminación",
    opposition: "Oposición al tratamiento",
    portability: "Portabilidad",
};

export function PrivacySettings() {
    const [requests, setRequests] = useState<DataSubjectRequestRecord[]>([]);
    const [requestType, setRequestType] = useState<DataSubjectRequestType>("access");
    const [details, setDetails] = useState("");
    const [whatsappEnabled, setWhatsappEnabled] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState("");

    const load = useCallback(async () => {
        try {
            const [requestsResponse, consentsResponse] = await Promise.all([
                fetch("/api/privacy/requests", { cache: "no-store" }),
                fetch("/api/privacy/consents", { cache: "no-store" }),
            ]);
            const requestData = await requestsResponse.json() as PrivacyRequestsResponse;
            const consentData = await consentsResponse.json() as PrivacyConsentsResponse;
            if (requestsResponse.ok) setRequests(requestData.requests || []);
            if (consentsResponse.ok) setWhatsappEnabled(consentData.whatsappEnabled === true);
            if (!requestsResponse.ok || !consentsResponse.ok) {
                setMessage(requestData.error || consentData.error || "No se pudo cargar toda la información.");
            }
        } catch (error) {
            console.error("[privacy settings] load failed", error);
            setMessage("No se pudo cargar la información. Revisa tu conexión e inténtalo nuevamente.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function submitRequest(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true);
        setMessage("");
        try {
            const response = await fetch("/api/privacy/requests", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ requestType, details }),
            });
            const data = await response.json() as PrivacyRequestsResponse;
            if (response.ok && data.request) {
                setRequests(current => [data.request as DataSubjectRequestRecord, ...current]);
                setDetails("");
                setMessage("Solicitud registrada. Puedes seguir su estado aquí.");
            } else {
                setMessage(data.error || "No se pudo registrar la solicitud.");
            }
        } catch {
            setMessage("No se pudo registrar la solicitud.");
        } finally {
            setSaving(false);
        }
    }

    async function updateWhatsapp(granted: boolean) {
        setSaving(true);
        setMessage("");
        try {
            const response = await fetch("/api/privacy/consents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ consentType: "whatsapp", granted }),
            });
            const data = await response.json() as PrivacyConsentsResponse;
            if (response.ok) {
                setWhatsappEnabled(granted);
                setMessage(granted ? "WhatsApp quedó activado." : "WhatsApp quedó desactivado.");
            } else {
                setMessage(data.error || "No se pudo guardar la preferencia.");
            }
        } catch {
            setMessage("No se pudo guardar la preferencia.");
        } finally {
            setSaving(false);
        }
    }

    return (
        <section id="privacidad" className="scroll-mt-24 space-y-5">
            <header className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cc-sage)" }}>
                    <ShieldCheck className="h-5 w-5" /> Privacidad y datos personales
                </div>
                <h2 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Tus datos, en el mismo perfil</h2>
                <p className="max-w-3xl text-sm leading-6 cc-text-secondary">
                    Descarga una copia, administra el consentimiento de WhatsApp o ejerce tus derechos de datos personales.
                </p>
                <Link href="/privacy" className="inline-flex text-sm font-semibold underline" style={{ color: "var(--cc-sage)" }}>
                    Leer la política de privacidad
                </Link>
            </header>

            {message && <p role="status" aria-live="polite" className="rounded-xl border p-4 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>{message}</p>}

            <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <Download className="mb-3 h-6 w-6" style={{ color: "var(--cc-sage)" }} />
                    <h3 className="text-lg font-semibold cc-text-primary">Descargar mis datos</h3>
                    <p className="mt-2 text-sm leading-6 cc-text-secondary">Obtén un archivo JSON con los datos asociados a tu cuenta.</p>
                    <a href="/api/privacy/export" className="mt-4 inline-flex min-h-11 items-center rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--cc-ink)" }}>
                        Descargar copia
                    </a>
                </article>

                <article className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <MessageCircle className="mb-3 h-6 w-6" style={{ color: "var(--cc-sage)" }} />
                    <h3 className="text-lg font-semibold cc-text-primary">Avisos por WhatsApp</h3>
                    <p className="mt-2 text-sm leading-6 cc-text-secondary">Este canal es opcional. Guardar un teléfono no lo activa automáticamente.</p>
                    <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold cc-text-primary">
                        <input type="checkbox" checked={whatsappEnabled} disabled={saving} onChange={event => void updateWhatsapp(event.target.checked)} />
                        Recibir avisos operativos por WhatsApp
                    </label>
                </article>
            </div>

            <article className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <h3 className="text-lg font-semibold cc-text-primary">Ejercer un derecho</h3>
                <form onSubmit={submitRequest} className="mt-4 space-y-4">
                    <div>
                        <label htmlFor="request-type" className="mb-2 block text-sm font-semibold cc-text-primary">Tipo de solicitud</label>
                        <select id="request-type" value={requestType} onChange={event => setRequestType(event.target.value as DataSubjectRequestType)} className="min-h-11 w-full rounded-xl border px-3 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            {Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label htmlFor="request-details" className="mb-2 block text-sm font-semibold cc-text-primary">Detalle</label>
                        <textarea id="request-details" value={details} onChange={event => setDetails(event.target.value)} rows={4} maxLength={2000} className="w-full rounded-xl border p-3 text-sm cc-text-primary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }} placeholder="Cuéntanos qué información necesitas o qué dato debe corregirse." />
                    </div>
                    <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-sage)" }}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Registrar solicitud
                    </button>
                </form>
            </article>

            <article className="rounded-2xl border p-5 shadow-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <h3 className="text-lg font-semibold cc-text-primary">Mis solicitudes</h3>
                {loading ? (
                    <div className="mt-4 flex items-center gap-2 text-sm cc-text-secondary"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
                ) : requests.length === 0 ? (
                    <p className="mt-3 text-sm cc-text-secondary">Aún no tienes solicitudes.</p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {requests.map(item => (
                            <article key={item.id} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)" }}>
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h4 className="text-sm font-semibold cc-text-primary">{requestLabels[item.request_type]}</h4>
                                    <span className="rounded-full px-3 py-1 text-xs font-semibold cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>{item.status}</span>
                                </div>
                                <p className="mt-2 text-xs cc-text-tertiary">Recibida el {new Date(item.received_at).toLocaleDateString("es-CL")}</p>
                            </article>
                        ))}
                    </div>
                )}
            </article>
        </section>
    );
}
