"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Copy, ScrollText } from "lucide-react";
import { OversightLinksService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { OversightLink } from "@/lib/types";

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };
const shortDate = (value: string) => new Date(value).toLocaleDateString("es-CL", { day: "2-digit", month: "short", year: "numeric" });

/**
 * Acceso de solo lectura a la rendición para un fiscalizador, auditor o el
 * comité de vigilancia, sin crearles cuenta. Vence solo y se puede revocar.
 */
export function OversightLinksCard() {
    const { toast } = useToast();
    const [links, setLinks] = useState<OversightLink[]>([]);
    const [label, setLabel] = useState("");
    const [days, setDays] = useState("30");
    const [newUrl, setNewUrl] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setLinks((await OversightLinksService.list()).links);
        } catch {
            // La rendición sigue usable aunque no carguen los accesos.
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function create(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await OversightLinksService.create({ label, days: Number(days) });
            setNewUrl(`${window.location.origin}/fiscalizador/${result.token}`);
            setLabel("");
            await load();
        } catch (error) {
            toast({ title: "No se creó el acceso", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    async function revoke(link: OversightLink) {
        setBusy(true);
        try {
            await OversightLinksService.revoke(link.id);
            await load();
        } catch (error) {
            toast({ title: "No se revocó", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    const now = Date.now();

    return (
        <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-center gap-3">
                <ScrollText className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                <h2 className="text-lg font-semibold cc-text-primary">Portal del fiscalizador</h2>
            </div>
            <p className="text-sm cc-text-secondary">
                Comparte la rendición de los últimos seis meses, el fondo de reserva y la morosidad agregada con quien deba revisar la administración.
                No muestra deudas por unidad ni datos personales, y cada visita queda registrada.
            </p>

            <form onSubmit={event => void create(event)} className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 text-sm cc-text-secondary">
                    ¿Para quién?
                    <input className={`${fieldClass} mt-1`} style={fieldStyle} value={label} onChange={event => setLabel(event.target.value)} placeholder="Comité de vigilancia 2026" required minLength={2} />
                </label>
                <label className="text-sm cc-text-secondary">
                    Vigencia
                    <select className={`${fieldClass} mt-1`} style={fieldStyle} value={days} onChange={event => setDays(event.target.value)}>
                        <option value="7">7 días</option>
                        <option value="30">30 días</option>
                        <option value="90">90 días</option>
                        <option value="180">180 días</option>
                    </select>
                </label>
                <button type="submit" disabled={busy} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--cc-paper)] disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                    Crear acceso
                </button>
            </form>

            {newUrl && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border p-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <span className="font-semibold cc-text-primary">Envía este enlace (no se vuelve a mostrar):</span>
                    <code className="break-all cc-text-primary">{newUrl}</code>
                    <button type="button" className="inline-flex items-center gap-1 underline" onClick={() => void navigator.clipboard.writeText(newUrl)}>
                        <Copy className="h-3 w-3" /> Copiar
                    </button>
                </div>
            )}

            {links.length > 0 && (
                <ul className="divide-y rounded-xl border text-sm" style={{ borderColor: "var(--cc-line)" }}>
                    {links.map(link => {
                        const active = !link.revokedAt && new Date(link.expiresAt).getTime() > now;
                        return (
                            <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                <div>
                                    <p className="font-medium cc-text-primary">{link.label}</p>
                                    <p className="text-xs cc-text-tertiary">
                                        {link.revokedAt ? "Revocado" : active ? `Vence el ${shortDate(link.expiresAt)}` : "Vencido"}
                                        {" · "}{link.viewCount} {link.viewCount === 1 ? "visita" : "visitas"}
                                    </p>
                                </div>
                                {active && (
                                    <button type="button" disabled={busy} onClick={() => void revoke(link)} className="text-xs underline cc-text-secondary">Revocar</button>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
