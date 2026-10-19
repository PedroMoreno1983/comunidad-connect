"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Fingerprint, LogOut, ScanFace } from "lucide-react";
import { useAuth } from "@/lib/authContext";
import { Brand } from "@/components/cc/Brand";
import { Button } from "@/components/cc/Button";
import {
    biometricLabel,
    initialLockState,
    isBiometricLockEnabled,
    onAppPause,
    onAppResume,
    onVerifyFailure,
    onVerifyStart,
    onVerifySuccess,
    setBiometricLockEnabled,
} from "@/lib/native/biometricLock";
import { checkBiometricAvailability, isNativeApp, listenAppLifecycle, nativePlatform, verifyBiometric } from "@/lib/native/biometricBridge";
import type { BiometricKind, BiometricLockGateProps, BiometricLockState } from "@/lib/native/types";

/**
 * Pide Face ID o huella al abrir la app nativa y al volver del fondo, si la
 * persona activó el bloqueo en su perfil. En web no hace nada.
 */
export function BiometricLockGate({ userId }: BiometricLockGateProps) {
    const { logout } = useAuth();
    const [state, setState] = useState<BiometricLockState>(() => initialLockState(false));
    const [kind, setKind] = useState<BiometricKind>("biometric");
    const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");
    const [message, setMessage] = useState("");
    const [unavailable, setUnavailable] = useState(false);
    const autoPrompted = useRef(false);
    const verifying = useRef(false);

    // Al abrir la app: bloquea si el ajuste está activo en este teléfono.
    useEffect(() => {
        if (!isNativeApp() || !isBiometricLockEnabled(userId)) return;
        let active = true;
        void checkBiometricAvailability().then(result => {
            if (!active) return;
            setPlatform(nativePlatform());
            setKind(result.kind);
            setUnavailable(!result.available);
            if (!result.available && result.reason) setMessage(result.reason);
            setState(current => ({ ...current, locked: true }));
        });
        return () => { active = false; };
    }, [userId]);

    // Pausa y regreso de la app.
    useEffect(() => {
        if (!isNativeApp()) return;
        let stop: (() => void) | null = null;
        let cancelled = false;
        void listenAppLifecycle({
            onPause: () => setState(current => onAppPause(current, Date.now())),
            onResume: () => setState(current => onAppResume(current, Date.now(), isBiometricLockEnabled(userId))),
        }).then(unsubscribe => {
            if (cancelled) unsubscribe();
            else stop = unsubscribe;
        });
        return () => {
            cancelled = true;
            stop?.();
        };
    }, [userId]);

    const unlock = useCallback(async () => {
        if (verifying.current) return;
        verifying.current = true;
        setMessage("");
        setState(current => onVerifyStart(current));
        const result = await verifyBiometric("Desbloquea tu comunidad");
        verifying.current = false;
        if (result.ok) {
            setUnavailable(false);
            setState(current => onVerifySuccess(current, Date.now()));
            return;
        }
        if (result.reason === "unavailable") setUnavailable(true);
        setMessage(result.message);
        setState(current => onVerifyFailure(current, Date.now()));
    }, []);

    // Al quedar bloqueada, pide la biometría una vez sin que la persona toque nada.
    useEffect(() => {
        if (!state.locked) {
            autoPrompted.current = false;
            return;
        }
        if (autoPrompted.current || unavailable) return;
        autoPrompted.current = true;
        const timer = window.setTimeout(() => { void unlock(); }, 250);
        return () => window.clearTimeout(timer);
    }, [state.locked, unavailable, unlock]);

    const signOut = async () => {
        // Al salir se apaga el bloqueo en este teléfono: se vuelve a entrar con la clave.
        setBiometricLockEnabled(userId, false);
        setState(initialLockState(false));
        await logout();
    };

    if (!state.locked) return null;

    const label = biometricLabel(kind, platform);
    const Icon = kind === "fingerprint" ? Fingerprint : ScanFace;

    return (
        <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="biometric-lock-title"
            className="fixed inset-0 z-[10000] flex flex-col items-center justify-center px-8 text-center"
            style={{ background: "var(--cc-ivory)", color: "var(--cc-ink)" }}
        >
            <Brand size={18} withMark />
            <div
                className="mt-10 grid place-items-center"
                style={{ width: 72, height: 72, borderRadius: 22, background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}
            >
                <Icon size={34} />
            </div>
            <h1 id="biometric-lock-title" className="mt-6 text-[26px] leading-tight tracking-[-0.02em]" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>
                Tu comunidad te espera
            </h1>
            <p className="mt-2 max-w-xs text-[14px] leading-6" style={{ color: "var(--cc-ink-muted)" }}>
                {unavailable ? "Para entrar, vuelve a iniciar sesión con tu correo y clave." : `Desbloquea con ${label} para seguir.`}
            </p>
            {message && (
                <p role="status" className="mt-3 max-w-xs text-[13px] leading-5" style={{ color: "var(--cc-ink-tertiary)" }}>{message}</p>
            )}
            <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
                {!unavailable && (
                    <Button variant="copper" size="lg" block disabled={state.verifying} onClick={() => { void unlock(); }}>
                        <Icon size={17} /> {state.verifying ? "Verificando…" : `Desbloquear con ${label}`}
                    </Button>
                )}
                <Button variant="ghost" size="md" block onClick={() => { void signOut(); }}>
                    <LogOut size={15} /> Cerrar sesión
                </Button>
            </div>
        </div>
    );
}
