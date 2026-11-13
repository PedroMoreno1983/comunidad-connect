"use client";

import { useState } from "react";
import { BadgeCheck, Copy, Link2, Loader2, Pencil, ShieldOff } from "lucide-react";
import { ProviderProfileService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { ProviderProfileForm } from "@/components/services/ProviderProfileForm";
import type { ProviderAdminPanelProps, ProviderInviteLink } from "@/lib/types";

/**
 * Acciones de la administración sobre un proveedor: verificarlo, editar su
 * perfil y enviarle a un maestro sin cuenta el enlace con que gestiona su perfil
 * y responde sus solicitudes.
 */
export function ProviderAdminPanel({ provider, onChanged }: ProviderAdminPanelProps) {
    const { toast } = useToast();
    const [busy, setBusy] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [invite, setInvite] = useState<ProviderInviteLink | null>(null);

    const run = async (key: string, action: () => Promise<void>) => {
        setBusy(key);
        try {
            await action();
        } catch (error) {
            toast({ title: "No se pudo completar", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    const share = invite
        ? `Hola ${provider.name.split(" ")[0]}, este es tu enlace para gestionar tu perfil y responder las solicitudes de la comunidad: ${invite.url}`
        : "";
    const phoneDigits = provider.contactPhone.replace(/\D/g, "");

    return (
        <section className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-copper)", background: "var(--cc-paper-warm)" }}>
            <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--cc-copper)" }}>Administración</p>
            <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy !== null} onClick={() => void run("verify", async () => {
                    await ProviderProfileService.setVerified(provider.id, !provider.verified);
                    toast({ title: provider.verified ? "Verificación quitada" : "Proveedor verificado", variant: "success" });
                    onChanged();
                })} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm cc-text-primary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                    {provider.verified ? <ShieldOff className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" style={{ color: "var(--cc-sage)" }} />}
                    {provider.verified ? "Quitar verificación" : "Verificar proveedor"}
                </button>
                <button type="button" disabled={busy !== null} onClick={() => setEditing(value => !value)} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm cc-text-primary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                    <Pencil className="h-4 w-4" /> Editar perfil
                </button>
                <button type="button" disabled={busy !== null} onClick={() => void run("invite", async () => {
                    setInvite(await ProviderProfileService.createInvite(provider.id));
                })} className="inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm cc-text-primary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                    {busy === "invite" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                    Enviar enlace al maestro
                </button>
            </div>

            {invite && (
                <div className="mt-4 rounded-xl border p-3 text-sm" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="cc-text-secondary">
                        Con este enlace {provider.name.split(" ")[0]} edita su perfil y responde sus solicitudes, sin crear cuenta.
                        Vence el {new Date(invite.expiresAt).toLocaleDateString("es-CL")}; generar otro anula este.
                    </p>
                    <p className="mt-2 break-all font-mono text-xs cc-text-primary">{invite.url}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => void navigator.clipboard.writeText(invite.url).then(() => toast({ title: "Enlace copiado", variant: "success" }))} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                            <Copy className="h-3.5 w-3.5" /> Copiar
                        </button>
                        {phoneDigits.length >= 8 && (
                            <a href={`https://wa.me/${phoneDigits}?text=${encodeURIComponent(share)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                                Enviar por WhatsApp
                            </a>
                        )}
                    </div>
                </div>
            )}

            {editing && (
                <div className="mt-4">
                    <ProviderProfileForm
                        initial={provider}
                        onCancel={() => setEditing(false)}
                        onSubmit={async input => {
                            await ProviderProfileService.update(provider.id, input);
                            toast({ title: "Perfil actualizado", variant: "success" });
                            setEditing(false);
                            onChanged();
                        }}
                    />
                </div>
            )}
        </section>
    );
}
