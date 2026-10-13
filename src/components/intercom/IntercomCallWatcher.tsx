"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing, Check, X } from "lucide-react";
import { IntercomService } from "@/lib/api";
import { useNotifications } from "@/lib/notificationContext";
import { useToast } from "@/components/ui/Toast";
import type { IntercomCall } from "@/lib/types";

const KIND_TEXT: Record<IntercomCall["visitKind"], string> = {
    visit: "Visita",
    delivery: "Delivery",
    service: "Servicio técnico",
    other: "Alguien",
};

function secondsLeft(call: IntercomCall) {
    return Math.max(0, Math.round((new Date(call.expiresAt).getTime() - Date.now()) / 1000));
}

/**
 * El "timbre" del residente. Conserjería inserta una notificación de categoría
 * 'intercom_call' que llega en tiempo real; con ella se buscan las llamadas que
 * suenan en la unidad y se muestra la que corresponde, con su cuenta regresiva.
 */
export function IntercomCallWatcher() {
    const { notifications } = useNotifications();
    const { toast } = useToast();
    const [call, setCall] = useState<IntercomCall | null>(null);
    const [remaining, setRemaining] = useState(0);
    const [busy, setBusy] = useState(false);
    const seen = useRef<Set<string>>(new Set());

    const refresh = useCallback(async () => {
        try {
            const { calls } = await IntercomService.getCalls();
            const next = calls.find(item => item.status === "ringing" && secondsLeft(item) > 0) ?? null;
            setCall(next);
            if (next) setRemaining(secondsLeft(next));
        } catch {
            // Sin conexión el aviso igual llega como notificación normal.
        }
    }, []);

    // Al abrir la app (por ejemplo desde el aviso de WhatsApp) puede haber una llamada sonando.
    useEffect(() => { void refresh(); }, [refresh]);

    useEffect(() => {
        const fresh = notifications.filter(item => item.category === "intercom_call" && !item.read && !seen.current.has(item.id));
        if (!fresh.length) return;
        fresh.forEach(item => seen.current.add(item.id));
        void refresh();
    }, [notifications, refresh]);

    // Cuenta regresiva y control de si otra persona de la unidad ya contestó.
    useEffect(() => {
        if (!call) return;
        const tick = setInterval(() => setRemaining(secondsLeft(call)), 1000);
        const poll = setInterval(() => void refresh(), 5000);
        return () => {
            clearInterval(tick);
            clearInterval(poll);
        };
    }, [call, refresh]);

    useEffect(() => {
        if (call && remaining === 0) setCall(null);
    }, [call, remaining]);

    async function answer(action: "approve" | "reject") {
        if (!call) return;
        setBusy(true);
        try {
            await IntercomService.act(call.id, action);
            toast({
                title: action === "approve" ? "Avisamos a conserjería que puede pasar" : "Avisamos a conserjería que no pase",
                variant: "success",
            });
            setCall(null);
        } catch (error) {
            toast({ title: "No se registró tu respuesta", description: error instanceof Error ? error.message : "Error inesperado.", variant: "destructive" });
            void refresh();
        } finally {
            setBusy(false);
        }
    }

    if (!call) return null;

    return (
        <div className="fixed inset-x-0 bottom-0 z-[60] p-4 sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-sm sm:p-0" role="alertdialog" aria-labelledby="intercom-title">
            <div className="rounded-2xl border p-5 shadow-2xl" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-copper)" }}>
                        <BellRing className="h-5 w-5 animate-pulse" />
                    </span>
                    <div>
                        <p id="intercom-title" className="font-semibold cc-text-primary">Conserjería te está llamando</p>
                        <p className="text-xs cc-text-tertiary">Unidad {call.unitNumber ?? ""} · {remaining} s</p>
                    </div>
                </div>
                <p className="mt-4 text-sm cc-text-secondary">
                    {KIND_TEXT[call.visitKind]}: <strong className="cc-text-primary">{call.visitorName}</strong> está en portería.
                    {call.note ? ` ${call.note}` : ""}
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                    <button type="button" disabled={busy} onClick={() => void answer("reject")} className="inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold cc-text-primary disabled:opacity-60" style={{ borderColor: "var(--cc-line)" }}>
                        <X className="h-4 w-4" /> No dejar pasar
                    </button>
                    <button type="button" disabled={busy} onClick={() => void answer("approve")} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white disabled:opacity-60" style={{ background: "var(--cc-ink)" }}>
                        <Check className="h-4 w-4" /> Dejar pasar
                    </button>
                </div>
            </div>
        </div>
    );
}
