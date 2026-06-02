"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

const COOKIE_CONSENT_KEY = "convive-cookie-consent-v1";
const COOKIE_CONSENT_EVENT = "convive-cookie-consent-change";

function subscribe(callback: () => void) {
    window.addEventListener("storage", callback);
    window.addEventListener(COOKIE_CONSENT_EVENT, callback);
    return () => {
        window.removeEventListener("storage", callback);
        window.removeEventListener(COOKIE_CONSENT_EVENT, callback);
    };
}

function getSnapshot() {
    return window.localStorage.getItem(COOKIE_CONSENT_KEY) !== "accepted";
}

function getServerSnapshot() {
    return false;
}

export function CookieConsent() {
    const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

    if (!visible) return null;

    const accept = () => {
        window.localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
        window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
    };

    return (
        <div className="fixed bottom-4 left-4 right-4 z-[90] mx-auto max-w-4xl rounded-xl border border-[#E4D8CA] bg-[#FBF8F1] p-4 text-[#1A1611] shadow-2xl md:flex md:items-center md:justify-between md:gap-5">
            <div>
                <p className="text-sm font-bold">Privacidad y cookies</p>
                <p className="mt-1 text-xs leading-5 text-[#524A40]">
                    Usamos cookies necesarias y medicion agregada para operar Convive, mantener sesiones seguras y mejorar la experiencia.
                    Revisa la <Link href="/privacy" className="font-semibold text-[#B45F4B] underline">politica de privacidad</Link>.
                </p>
            </div>
            <button
                type="button"
                onClick={accept}
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg bg-[#1A1611] px-4 py-2 text-xs font-bold text-white md:mt-0 md:w-auto"
            >
                Entendido
            </button>
        </div>
    );
}
