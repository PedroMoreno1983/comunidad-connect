"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2 } from "lucide-react";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { BuildingAddressPicker } from "@/components/auth/BuildingAddressPicker";
import { useToast } from "@/components/ui/Toast";
import { AuthProvidersService, NeighborInviteService } from "@/lib/api";
import type { GeocodeSuggestion, NeighborInvitePreview } from "@/lib/types";

const inputClass = "w-full px-4 py-3 rounded-xl border bg-[var(--cc-paper)] text-sm focus:outline-none focus:ring-2 focus:ring-[#9C5636] transition-all";

/**
 * Después de entrar con Google por primera vez: la cuenta existe pero no tiene
 * edificio. Se elige con el código de la administración o con la dirección
 * (si el edificio todavía no usa Convive).
 */
export default function WelcomePage() {
    const { toast } = useToast();
    const [email, setEmail] = useState("");
    const [mode, setMode] = useState<"code" | "address" | "invite">("code");
    // /bienvenida?invitacion=<código>: vino por la invitación de un vecino (Google).
    const [invite, setInvite] = useState<NeighborInvitePreview | null>(null);
    const [accessCode, setAccessCode] = useState("");
    const [address, setAddress] = useState<GeocodeSuggestion | null>(null);
    const [buildingName, setBuildingName] = useState("");
    const [needsBuildingName, setNeedsBuildingName] = useState(false);
    const [departmentNumber, setDepartmentNumber] = useState("");
    const [acceptTerms, setAcceptTerms] = useState(false);
    const [acceptPrivacy, setAcceptPrivacy] = useState(false);
    const [whatsappOptIn, setWhatsappOptIn] = useState(false);
    const [message, setMessage] = useState("");
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        void AuthProvidersService.currentEmail().then(setEmail);
        const invitation = new URLSearchParams(window.location.search).get("invitacion");
        if (invitation) {
            void NeighborInviteService.preview(invitation).then(preview => {
                if (!preview) return;
                setInvite(preview);
                setMode("invite");
            });
        }
    }, []);

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setMessage("");
        setLoading(true);
        try {
            const { ok, result } = await AuthProvidersService.joinCommunity({
                mode, accessCode, address, buildingName, departmentNumber, acceptTerms, acceptPrivacy, whatsappOptIn,
                inviteCode: invite?.code,
            });
            if (!ok && result.error === "Tu cuenta ya tiene un edificio.") {
                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                window.location.assign("/home");
                return;
            }
            if (!ok) {
                if (result.code === "BUILDING_NAME_REQUIRED") setNeedsBuildingName(true);
                setMessage(result.error || "No se pudo completar.");
                return;
            }
            // Recarga completa a propósito: el contexto de sesión tiene que volver a
            // leer el perfil, que recién quedó con edificio.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.assign("/home");
        } catch {
            toast({ title: "Error", description: "No se pudo completar. Intenta de nuevo.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--cc-ivory)" }}>
            <form onSubmit={submit} className="w-full max-w-[400px] space-y-5">
                <div>
                    <Eyebrow className="mb-2">BIENVENIDA</Eyebrow>
                    <DisplayHeading size={34}>
                        ¿Cuál es tu <br />
                        <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>edificio?</em>
                    </DisplayHeading>
                    {email && <p className="mt-2 text-xs text-slate-600">Entraste como {email}.</p>}
                </div>

                {mode === "invite" && invite && (
                    <p className="rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--cc-copper)", background: "var(--cc-copper-tint)" }}>
                        Te sumas a <strong>{invite.buildingName}</strong> por invitación de {invite.inviterFirstName}.
                    </p>
                )}

                {mode !== "invite" && (
                <div className="grid grid-cols-2 gap-1 rounded-xl border p-1 text-xs font-semibold" style={{ borderColor: "var(--cc-line-strong)" }} role="tablist">
                    {([["code", "Tengo código"], ["address", "Mi edificio no usa Convive"]] as const).map(([value, label]) => (
                        <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => { setMode(value); setMessage(""); }}
                            className="rounded-lg px-2 py-2 transition-colors"
                            style={mode === value ? { background: "var(--cc-ink)", color: "var(--cc-paper)" } : { color: "var(--cc-ink)" }}>
                            {label}
                        </button>
                    ))}
                </div>

                )}

                {mode === "invite" ? null : mode === "code" ? (
                    <label className="block space-y-1.5">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Código de invitación</span>
                        <input value={accessCode} onChange={event => setAccessCode(event.target.value.toUpperCase())} placeholder="INV-X93F" required
                            className={`${inputClass} font-mono uppercase tracking-[0.16em]`} style={{ borderColor: "var(--cc-line-strong)" }} />
                    </label>
                ) : (
                    <>
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Dirección del edificio</span>
                            <BuildingAddressPicker value={address} onChange={value => { setAddress(value); setNeedsBuildingName(false); setMessage(""); }} />
                        </div>
                        <label className="block space-y-1.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                                {needsBuildingName ? "Nombre del edificio" : "Nombre del edificio (si eres el primero)"}
                            </span>
                            <input value={buildingName} onChange={event => setBuildingName(event.target.value)} placeholder="Ej: Edificio Los Aromos" required={needsBuildingName}
                                className={inputClass} style={{ borderColor: needsBuildingName ? "var(--cc-copper)" : "var(--cc-line-strong)" }} />
                        </label>
                    </>
                )}

                <label className="block space-y-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Departamento / unidad</span>
                    <input value={departmentNumber} onChange={event => setDepartmentNumber(event.target.value)} placeholder="Ej: 501, 3B, 1201" required
                        className={inputClass} style={{ borderColor: "var(--cc-line-strong)" }} />
                </label>

                <div className="space-y-3 rounded-xl border p-4 text-xs text-slate-600" style={{ borderColor: "var(--cc-line-strong)" }}>
                    <label className="flex items-start gap-3">
                        <input type="checkbox" checked={acceptTerms} onChange={event => setAcceptTerms(event.target.checked)} required className="mt-0.5" />
                        <span>Acepto los <Link href="/terms" target="_blank" className="font-semibold underline">términos del servicio</Link>.</span>
                    </label>
                    <label className="flex items-start gap-3">
                        <input type="checkbox" checked={acceptPrivacy} onChange={event => setAcceptPrivacy(event.target.checked)} required className="mt-0.5" />
                        <span>Leí la <Link href="/privacy" target="_blank" className="font-semibold underline">política de privacidad</Link>.</span>
                    </label>
                    <label className="flex items-start gap-3">
                        <input type="checkbox" checked={whatsappOptIn} onChange={event => setWhatsappOptIn(event.target.checked)} className="mt-0.5" />
                        <span>Quiero recibir avisos por WhatsApp (opcional).</span>
                    </label>
                </div>

                {message && <p role="alert" className="rounded-xl border px-3 py-2 text-xs font-semibold" style={{ borderColor: "var(--cc-copper)", background: "var(--cc-copper-tint)" }}>{message}</p>}

                <button type="submit" disabled={loading || (mode === "address" && !address)}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                    style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : null}
                    Entrar a mi edificio <ArrowRight size={15} />
                </button>
                <Link href="/home" className="block text-center text-sm font-semibold underline">Volver a Inicio</Link>
            </form>
        </main>
    );
}
