"use client";

import { useEffect, useState } from "react";
import { Loader2, ScanFace } from "lucide-react";
import { PasskeyService } from "@/lib/api";
import { isNativeApp } from "@/lib/native/biometricBridge";
import type { PasskeyCredential } from "@/lib/types";

export function WebPasskeySetting() {
    const [supported, setSupported] = useState(false);
    const [passkeys, setPasskeys] = useState<PasskeyCredential[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        const canUsePasskeys = !isNativeApp()
            && window.isSecureContext
            && typeof window.PublicKeyCredential !== "undefined";
        setSupported(canUsePasskeys);
        if (!canUsePasskeys) return;
        let active = true;
        void PasskeyService.list().then(items => {
            if (active) setPasskeys(items);
        }).catch(() => {
            if (active) setMessage("No pudimos consultar tus llaves de acceso.");
        });
        return () => { active = false; };
    }, []);

    if (!supported) return null;

    const register = async () => {
        setBusy(true);
        setMessage("");
        try {
            await PasskeyService.register();
            setPasskeys(await PasskeyService.list());
            setMessage("Listo. La próxima vez podrás entrar con Face ID, huella o PIN.");
        } catch (error) {
            setMessage(error instanceof Error ? error.message : "No pudimos crear la llave de acceso.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-xl border bg-[var(--cc-paper)] p-4 shadow-sm" style={{ borderColor: "var(--cc-line)" }}>
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <p className="text-sm font-medium text-[var(--cc-ink)]">Acceso con Face ID, huella o PIN</p>
                    <p className="mt-0.5 text-xs text-[var(--cc-ink-tertiary)]">
                        Crea una llave de acceso en este dispositivo para entrar a la plataforma web sin contraseña.
                    </p>
                    {passkeys.length > 0 && (
                        <p className="mt-2 text-xs text-[var(--cc-sage)]" role="status">
                            {passkeys.length} {passkeys.length === 1 ? "llave de acceso activa" : "llaves de acceso activas"}
                        </p>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => { void register(); }}
                    disabled={busy}
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-xs font-semibold disabled:opacity-50"
                    style={{ borderColor: "var(--cc-line-strong)", color: "var(--cc-ink)" }}
                >
                    {busy ? <Loader2 size={15} className="animate-spin" /> : <ScanFace size={15} />}
                    {passkeys.length ? "Agregar otra llave" : "Activar acceso facial"}
                </button>
            </div>
            {message && <p role="status" className="mt-2 text-xs text-[var(--cc-ink-muted)]">{message}</p>}
        </div>
    );
}
