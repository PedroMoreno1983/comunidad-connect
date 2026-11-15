"use client";

import { useEffect } from "react";
import { listenNativeOAuthReturn } from "@/lib/native/oauthBridge";

/** En la app nativa: recibe la vuelta de Google y termina el inicio de sesión. No dibuja nada. */
export function NativeOAuthReturn() {
    useEffect(() => {
        let stop: (() => void) | undefined;
        let cancelled = false;
        void listenNativeOAuthReturn(path => { window.location.href = path; }).then(remove => {
            if (cancelled) remove();
            else stop = remove;
        });
        return () => { cancelled = true; stop?.(); };
    }, []);
    return null;
}
