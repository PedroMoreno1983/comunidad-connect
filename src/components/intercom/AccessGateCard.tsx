"use client";

import { useEffect, useState, type FormEvent } from "react";
import { DoorOpen, KeyRound } from "lucide-react";
import { AccessGateService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };

/**
 * Conecta el portón o la barrera: al dejar pasar una visita aprobada, la
 * plataforma hace un POST firmado a esta dirección. El secreto se ve una vez.
 */
export function AccessGateCard() {
    const { toast } = useToast();
    const [url, setUrl] = useState("");
    const [saved, setSaved] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        AccessGateService.get()
            .then(data => { setSaved(data.url); setUrl(data.url || ""); })
            .catch(() => undefined);
    }, []);

    async function save(event: FormEvent, nextUrl: string | null) {
        event.preventDefault();
        setBusy(true);
        try {
            const data = await AccessGateService.save(nextUrl);
            setSaved(data.url);
            setUrl(data.url || "");
            setSecret(data.secret);
            toast({ title: data.url ? "Portón conectado" : "Portón desconectado", variant: "success" });
        } catch (error) {
            toast({ title: "No se guardó", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    return (
        <section className="space-y-3 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-center gap-3">
                <DoorOpen className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                <h2 className="text-lg font-semibold cc-text-primary">Portón automático</h2>
            </div>
            <p className="text-sm cc-text-secondary">
                Cuando conserjería deja pasar una visita aprobada por el citófono digital, enviamos un POST firmado
                (cabeceras <code>X-CoCo-Timestamp</code> y <code>X-CoCo-Signature</code>, HMAC-SHA256 de
                <code> timestamp.cuerpo</code>) al controlador del portón.
            </p>
            <form onSubmit={event => void save(event, url.trim() || null)} className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm cc-text-secondary">
                    Dirección del controlador
                    <input className={`${fieldClass} mt-1`} style={fieldStyle} value={url} onChange={event => setUrl(event.target.value)} placeholder="https://porton.mi-edificio.cl/abrir" />
                </label>
                <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cc-paper)] disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                    {saved ? "Guardar y generar clave nueva" : "Conectar"}
                </button>
                {saved && (
                    <button type="button" disabled={busy} onClick={event => void save(event, null)} className="text-sm underline cc-text-secondary">
                        Desconectar
                    </button>
                )}
            </form>
            {secret && (
                <p className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <KeyRound className="h-4 w-4" /> Clave para verificar la firma (cópiala ahora, no se vuelve a mostrar):
                    <code className="break-all font-semibold cc-text-primary">{secret}</code>
                </p>
            )}
        </section>
    );
}
