"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Loader2, Mail, ShieldCheck } from "lucide-react";
import { CommercialService } from "@/lib/api";
import type { CommercialLeadFormProps, CommercialLeadResponse } from "@/lib/types";

export function CommercialLeadForm({ source }: CommercialLeadFormProps) {
    const [adminName, setAdminName] = useState("");
    const [adminEmail, setAdminEmail] = useState("");
    const [condoName, setCondoName] = useState("");
    const [message, setMessage] = useState("");
    const [website, setWebsite] = useState("");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CommercialLeadResponse | null>(null);
    const [error, setError] = useState("");

    async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setLoading(true);
        setError("");

        try {
            const response = await CommercialService.submitLead({
                adminName,
                adminEmail,
                condoName,
                message,
                source,
                website,
            });
            setResult(response);
        } catch (submissionError) {
            setError(submissionError instanceof Error ? submissionError.message : "No se pudo registrar la solicitud.");
        } finally {
            setLoading(false);
        }
    }

    if (result) {
        return (
            <div className="rounded-3xl border p-7 sm:p-9" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }} aria-live="polite">
                <div className="flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                    <CheckCircle2 className="h-6 w-6" />
                </div>
                <h2 className="mt-6 text-2xl font-semibold">Solicitud comercial registrada</h2>
                <p className="mt-3 text-sm leading-6" style={{ color: "var(--cc-ink-muted)" }}>
                    {result.emailSent
                        ? `La confirmacion fue enviada a ${adminEmail} y el equipo comercial ya recibio el aviso.`
                        : "La solicitud quedo guardada de forma segura. La confirmacion por correo esta pendiente y el equipo puede recuperarla desde el registro comercial."}
                </p>
                <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                    <Link href="/onboarding" className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                        Activar con CoCo <ArrowRight className="h-4 w-4" />
                    </Link>
                    <button type="button" onClick={() => setResult(null)} className="rounded-xl border px-5 py-3 text-sm font-semibold" style={{ borderColor: "var(--cc-line-strong)" }}>
                        Enviar otra solicitud
                    </button>
                </div>
            </div>
        );
    }

    return (
        <form onSubmit={handleSubmit} className="rounded-3xl border p-7 sm:p-9" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                    <Mail className="h-5 w-5" />
                </div>
                <div>
                    <h2 className="text-2xl font-semibold">Coordina el siguiente paso</h2>
                    <p className="mt-1 text-sm leading-6" style={{ color: "var(--cc-ink-muted)" }}>
                        La solicitud queda registrada y recibirás confirmación por correo. No depende de una bandeja temporal.
                    </p>
                </div>
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                    Nombre
                    <input value={adminName} onChange={(event) => setAdminName(event.target.value)} required maxLength={120} autoComplete="name" placeholder="Nombre administrador" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm font-medium normal-case tracking-normal outline-none focus:ring-2" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }} />
                </label>
                <label className="text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                    Correo
                    <input type="email" value={adminEmail} onChange={(event) => setAdminEmail(event.target.value)} required maxLength={180} autoComplete="email" placeholder="admin@condominio.cl" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm font-medium normal-case tracking-normal outline-none focus:ring-2" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }} />
                </label>
            </div>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                Comunidad
                <input value={condoName} onChange={(event) => setCondoName(event.target.value)} required maxLength={160} autoComplete="organization" placeholder="Edificio o condominio" className="mt-2 w-full rounded-xl border px-4 py-3 text-sm font-medium normal-case tracking-normal outline-none focus:ring-2" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }} />
            </label>

            <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: "var(--cc-ink-tertiary)" }}>
                Qué necesitas resolver
                <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} rows={4} placeholder="Unidades, procesos actuales y prioridad de implementación" className="mt-2 w-full resize-none rounded-xl border px-4 py-3 text-sm font-medium normal-case tracking-normal outline-none focus:ring-2" style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper-warm)" }} />
            </label>

            <label className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden="true">
                Sitio web
                <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex={-1} autoComplete="off" />
            </label>

            {error && (
                <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
                    {error}
                </p>
            )}

            <button type="submit" disabled={loading} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60" style={{ background: "var(--cc-sage)" }}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                {loading ? "Registrando solicitud..." : "Solicitar recorrido y propuesta"}
            </button>
            <p className="mt-3 text-center text-xs leading-5" style={{ color: "var(--cc-ink-tertiary)" }}>
                Registro persistente, confirmación de entrega y seguimiento comercial trazable.
            </p>
        </form>
    );
}
