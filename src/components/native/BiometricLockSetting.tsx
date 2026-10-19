"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { biometricLabel, isBiometricLockEnabled, setBiometricLockEnabled } from "@/lib/native/biometricLock";
import { checkBiometricAvailability, isNativeApp, nativePlatform, verifyBiometric } from "@/lib/native/biometricBridge";
import type { BiometricAvailability, BiometricLockSettingProps } from "@/lib/native/types";

/**
 * Ajuste opcional del perfil: pedir Face ID o huella al abrir la app y al
 * volver a ella. Solo aparece en la app nativa.
 */
export function BiometricLockSetting({ userId }: BiometricLockSettingProps) {
    const [native, setNative] = useState(false);
    const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
    const [enabled, setEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");

    useEffect(() => {
        if (!isNativeApp()) return;
        let active = true;
        void checkBiometricAvailability().then(result => {
            if (!active) return;
            setNative(true);
            setAvailability(result);
            setEnabled(isBiometricLockEnabled(userId));
        });
        return () => { active = false; };
    }, [userId]);

    if (!native || !availability) return null;

    const label = biometricLabel(availability.kind, nativePlatform());

    const toggle = async () => {
        setMessage("");
        if (enabled) {
            setBiometricLockEnabled(userId, false);
            setEnabled(false);
            return;
        }
        setBusy(true);
        // Se verifica antes de activar: así nadie queda con un bloqueo que su teléfono no puede abrir.
        const result = await verifyBiometric(`Activa el bloqueo con ${label}`);
        setBusy(false);
        if (!result.ok) {
            setMessage(result.message);
            return;
        }
        setBiometricLockEnabled(userId, true);
        setEnabled(true);
        setMessage(`Listo. Te pediremos ${label} al abrir la app y al volver a ella.`);
    };

    return (
        <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between gap-4">
                <div>
                    <p className="text-sm font-medium text-[var(--cc-ink)]">Bloqueo con {label}</p>
                    <p className="text-xs text-[var(--cc-ink-tertiary)] mt-0.5">
                        {availability.available
                            ? "Opcional. Pide tu biometría al abrir la app o al volver a ella, para que tu cuenta quede solo en tus manos."
                            : availability.reason}
                    </p>
                </div>
                <button
                    type="button"
                    role="switch"
                    aria-checked={enabled}
                    aria-label={`Bloqueo con ${label}`}
                    onClick={() => { void toggle(); }}
                    disabled={busy || (!availability.available && !enabled)}
                    className={`relative h-5.5 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-[var(--cc-sage)]" : "bg-[var(--cc-line-strong)]"}`}
                >
                    {busy
                        ? <Loader2 className="absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 animate-spin text-[var(--cc-ink-muted)]" />
                        : <span className={`absolute top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-all ${enabled ? "right-0.5" : "left-0.5"}`} />}
                </button>
            </div>
            {message && <p role="status" className="mt-2 text-xs text-[var(--cc-ink-muted)]">{message}</p>}
        </div>
    );
}
