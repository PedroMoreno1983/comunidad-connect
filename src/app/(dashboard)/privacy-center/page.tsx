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

export default function PrivacyCenterPage() {
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
      console.error("[privacy center] load failed", error);
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
    const response = await fetch("/api/privacy/requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requestType, details }),
    });
    const data = await response.json() as PrivacyRequestsResponse;
    if (response.ok && data.request) {
      setRequests(current => [data.request as DataSubjectRequestRecord, ...current]);
      setDetails("");
      setMessage("Solicitud registrada. Puedes seguir su estado en esta página.");
    } else {
      setMessage(data.error || "No se pudo registrar la solicitud.");
    }
    setSaving(false);
  }

  async function updateWhatsapp(granted: boolean) {
    setSaving(true);
    setMessage("");
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
    setSaving(false);
  }

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 py-8 sm:px-6">
      <header className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
          <ShieldCheck className="h-5 w-5" /> Privacidad y datos personales
        </div>
        <h1 className="text-3xl font-bold text-slate-950">Centro de privacidad</h1>
        <p className="max-w-3xl text-sm leading-6 text-slate-600">
          Descarga una copia de tus datos, administra WhatsApp o ejerce tus derechos de acceso,
          rectificación, supresión, oposición y portabilidad.
        </p>
        <Link href="/privacy" className="inline-flex text-sm font-semibold text-emerald-700 underline">
          Leer la política de privacidad
        </Link>
      </header>

      {message && <p role="status" aria-live="polite" className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">{message}</p>}

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <Download className="mb-3 h-6 w-6 text-emerald-700" />
          <h2 className="text-lg font-bold">Descargar mis datos</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Obtén un archivo JSON estructurado con los datos asociados a tu cuenta.</p>
          <a href="/api/privacy/export" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
            Descargar copia
          </a>
        </article>

        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <MessageCircle className="mb-3 h-6 w-6 text-emerald-700" />
          <h2 className="text-lg font-bold">Avisos por WhatsApp</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">Este canal es opcional. Tu teléfono no lo activa automáticamente.</p>
          <label className="mt-4 flex min-h-11 items-center gap-3 text-sm font-semibold">
            <input
              type="checkbox"
              checked={whatsappEnabled}
              disabled={saving}
              onChange={event => void updateWhatsapp(event.target.checked)}
            />
            Recibir avisos operativos por WhatsApp
          </label>
        </article>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Ejercer un derecho</h2>
        <form onSubmit={submitRequest} className="mt-4 space-y-4">
          <div>
            <label htmlFor="request-type" className="mb-2 block text-sm font-semibold">Tipo de solicitud</label>
            <select id="request-type" value={requestType} onChange={event => setRequestType(event.target.value as DataSubjectRequestType)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3 text-sm">
              {Object.entries(requestLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="request-details" className="mb-2 block text-sm font-semibold">Detalle</label>
            <textarea id="request-details" value={details} onChange={event => setDetails(event.target.value)} rows={4} maxLength={2000} className="w-full rounded-xl border border-slate-300 p-3 text-sm" placeholder="Cuéntanos qué información necesitas o qué dato debe corregirse." />
          </div>
          <button type="submit" disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Registrar solicitud
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Mis solicitudes</h2>
        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Cargando…</div>
        ) : requests.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">Aún no tienes solicitudes.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {requests.map(item => (
              <article key={item.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-bold">{requestLabels[item.request_type]}</h3>
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{item.status}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">Recibida el {new Date(item.received_at).toLocaleDateString("es-CL")}</p>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
