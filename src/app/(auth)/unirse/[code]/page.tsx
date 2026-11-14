"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { AuthProvidersService, NeighborInviteService } from "@/lib/api";
import type { NeighborInvitePreview } from "@/lib/types";

/**
 * Invitación de un vecino por WhatsApp. El enlace ya trae el edificio: quien
 * lo abre entra con Google o con su correo y solo indica su departamento.
 */
export default function JoinByInvitePage({ params }: { params: Promise<{ code: string }> }) {
    const { code } = use(params);
    const [preview, setPreview] = useState<NeighborInvitePreview | null | undefined>(undefined);
    const [googleEnabled, setGoogleEnabled] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);

    useEffect(() => {
        let cancelled = false;
        void NeighborInviteService.preview(code).then(result => { if (!cancelled) setPreview(result); });
        void AuthProvidersService.settings().then(settings => { if (!cancelled) setGoogleEnabled(settings.google); });
        return () => { cancelled = true; };
    }, [code]);

    const continueWithGoogle = async () => {
        setGoogleLoading(true);
        const { error } = await AuthProvidersService.signInWithGoogle(`/bienvenida?invitacion=${encodeURIComponent(code)}`);
        if (error) setGoogleLoading(false);
    };

    return (
        <main className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--cc-ivory)" }}>
            <div className="w-full max-w-[380px] space-y-6">
                {preview === undefined ? (
                    <p className="flex items-center gap-2 text-sm text-slate-600"><Loader2 size={16} className="animate-spin" /> Abriendo la invitación…</p>
                ) : preview === null ? (
                    <div className="space-y-3">
                        <DisplayHeading size={30}>Esta invitación ya no es válida</DisplayHeading>
                        <p className="text-sm text-slate-600">Pide a tu vecino que te la mande de nuevo, o súmate con la dirección de tu edificio.</p>
                        <Link href="/signup?modo=edificio" className="inline-flex items-center gap-1.5 text-sm font-semibold underline" style={{ color: "var(--cc-copper)" }}>
                            Sumarme con la dirección <ArrowRight size={14} />
                        </Link>
                    </div>
                ) : (
                    <>
                        <div>
                            <Eyebrow className="mb-2">INVITACIÓN</Eyebrow>
                            <DisplayHeading size={32}>
                                {preview.inviterFirstName} te invita a <br />
                                <em style={{ color: "var(--cc-copper)", fontStyle: "italic" }}>{preview.buildingName}</em>
                            </DisplayHeading>
                            <p className="mt-3 text-sm leading-relaxed text-slate-600">
                                Tus vecinos ya usan Convive para el supermercado, el marketplace entre vecinos, maestros de confianza y CoCo.
                                Entra en un minuto: solo te vamos a pedir tu departamento.
                            </p>
                        </div>
                        <div className="space-y-2">
                            {googleEnabled && (
                                <button type="button" onClick={() => void continueWithGoogle()} disabled={googleLoading}
                                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-50"
                                    style={{ background: "var(--cc-ink)", color: "var(--cc-paper)" }}>
                                    {googleLoading ? <Loader2 size={16} className="animate-spin" /> : null}
                                    Continuar con Google
                                </button>
                            )}
                            <Link href={`/signup?invitacion=${encodeURIComponent(preview.code)}`}
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold"
                                style={googleEnabled
                                    ? { borderColor: "var(--cc-line-strong)", color: "var(--cc-ink)" }
                                    : { background: "var(--cc-ink)", color: "var(--cc-paper)", borderColor: "var(--cc-ink)" }}>
                                <Mail size={16} /> Crear cuenta con mi correo
                            </Link>
                            <Link href="/login" className="block pt-1 text-center text-xs font-semibold text-slate-500">¿Ya tienes cuenta? Entrar</Link>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
