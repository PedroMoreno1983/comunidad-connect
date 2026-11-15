"use client";

import { useEffect } from "react";
import { useAuth } from "@/lib/authContext";
import { startNativePush } from "@/lib/native/pushBridge";

/** En la app nativa, con sesión: activa las notificaciones push de esta cuenta. No dibuja nada. */
export function NativePushRegistration() {
    const { user } = useAuth();
    const userId = user?.id;

    useEffect(() => {
        if (!userId) return;
        let stop: (() => void) | undefined;
        let cancelled = false;
        void startNativePush(path => { window.location.href = path; })
            .then(remove => {
                if (cancelled) remove();
                else stop = remove;
            })
            .catch(() => {});
        return () => { cancelled = true; stop?.(); };
    }, [userId]);

    return null;
}
