"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Code2, KeyRound } from "lucide-react";
import { ApiKeysService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { ApiKeyScope, CommunityApiKey } from "@/lib/types";

const SCOPE_LABELS: Record<ApiKeyScope, string> = {
    units: "Unidades",
    finance: "Finanzas (cobros, pagos, saldos, rendición)",
    access: "Accesos (bitácora de visitas)",
};

const fieldClass = "w-full rounded-xl border px-3 py-2 text-sm cc-text-primary";
const fieldStyle = { borderColor: "var(--cc-line)", background: "var(--cc-paper)" };
const formatDate = (value: string | null) => value ? new Date(value).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" }) : "Nunca";

/** Claves de solo lectura para conectar contabilidad, bancos o control de acceso. */
export function ApiKeysCard() {
    const { toast } = useToast();
    const [keys, setKeys] = useState<CommunityApiKey[]>([]);
    const [name, setName] = useState("");
    const [scopes, setScopes] = useState<ApiKeyScope[]>(["finance"]);
    const [secret, setSecret] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            setKeys((await ApiKeysService.list()).keys);
        } catch {
            // Sin claves cargadas la tarjeta igual permite crear una.
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    async function create(event: FormEvent) {
        event.preventDefault();
        setBusy(true);
        try {
            const result = await ApiKeysService.create({ name, scopes });
            setSecret(result.secret);
            setName("");
            await load();
        } catch (error) {
            toast({ title: "No se creó la clave", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    async function revoke(key: CommunityApiKey) {
        if (!window.confirm(`¿Revocar la clave "${key.name}"? Los sistemas que la usan dejarán de funcionar.`)) return;
        setBusy(true);
        try {
            await ApiKeysService.revoke(key.id);
            await load();
        } catch (error) {
            toast({ title: "No se revocó", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
        } finally {
            setBusy(false);
        }
    }

    const toggle = (scope: ApiKeyScope) => setScopes(prev => prev.includes(scope) ? prev.filter(item => item !== scope) : [...prev, scope]);

    return (
        <section className="space-y-4 rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Code2 className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                    <h2 className="text-lg font-semibold cc-text-primary">API pública</h2>
                </div>
                <Link href="/developers" className="text-sm underline cc-text-secondary">Ver documentación</Link>
            </div>
            <p className="text-sm cc-text-secondary">
                Claves de solo lectura para conectar el sistema contable, el banco o el control de acceso. Nunca exponen correos, teléfonos ni RUT.
            </p>

            <form onSubmit={event => void create(event)} className="space-y-3">
                <label className="block text-sm cc-text-secondary">
                    Nombre de la clave
                    <input className={`${fieldClass} mt-1`} style={fieldStyle} value={name} onChange={event => setName(event.target.value)} placeholder="Contabilidad estudio Pérez" required minLength={2} />
                </label>
                <fieldset className="flex flex-wrap gap-4 text-sm cc-text-secondary">
                    {(Object.keys(SCOPE_LABELS) as ApiKeyScope[]).map(scope => (
                        <label key={scope} className="flex items-center gap-2">
                            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggle(scope)} />
                            {SCOPE_LABELS[scope]}
                        </label>
                    ))}
                </fieldset>
                <button type="submit" disabled={busy || !scopes.length} className="rounded-xl px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                    Crear clave
                </button>
            </form>

            {secret && (
                <div className="space-y-1 rounded-xl border p-3 text-xs cc-text-secondary" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                    <p className="flex items-center gap-2 font-semibold cc-text-primary"><KeyRound className="h-4 w-4" /> Cópiala ahora: no se vuelve a mostrar.</p>
                    <code className="block break-all cc-text-primary">{secret}</code>
                </div>
            )}

            {keys.length > 0 && (
                <ul className="divide-y rounded-xl border text-sm" style={{ borderColor: "var(--cc-line)" }}>
                    {keys.map(key => (
                        <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div>
                                <p className="font-medium cc-text-primary">{key.name} <code className="text-xs cc-text-tertiary">cc_live_{key.prefix}_…</code></p>
                                <p className="text-xs cc-text-tertiary">{key.scopes.join(", ")} · último uso: {formatDate(key.lastUsedAt)}</p>
                            </div>
                            {key.revokedAt ? (
                                <span className="text-xs cc-text-tertiary">Revocada</span>
                            ) : (
                                <button type="button" disabled={busy} onClick={() => void revoke(key)} className="text-xs underline cc-text-secondary">Revocar</button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
