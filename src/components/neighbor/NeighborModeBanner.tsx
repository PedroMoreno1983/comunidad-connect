"use client";

import { useEffect, useState } from "react";
import { MessageCircle, ShieldAlert, Users } from "lucide-react";
import { NeighborModeService } from "@/lib/api";
import { PUBLIC_SITE_URL } from "@/lib/config";
import { adminInviteMessage } from "@/lib/neighborMode";
import type { NeighborModeBannerProps, NeighborModeSummary } from "@/lib/types";

/**
 * Modo vecino, arriba de la pantalla:
 * - En Inicio, cuántos vecinos usan Convive y la invitación a la administración
 *   (destacada desde 10 vecinos).
 * - En Marketplace y Supermercado (compra comunitaria), que los vecinos todavía
 *   no están validados por una administración.
 */
export function NeighborModeBanner({ pathname, buildingName }: NeighborModeBannerProps) {
    const [summary, setSummary] = useState<NeighborModeSummary | null>(null);
    const onHome = pathname === "/home";
    const trustNotice = pathname.startsWith("/marketplace") || pathname.startsWith("/resident/supermercado");

    useEffect(() => {
        if (!onHome) return;
        let cancelled = false;
        NeighborModeService.summary().then(result => { if (!cancelled) setSummary(result); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, [onHome]);

    if (trustNotice) {
        return (
            <div role="note" className="mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm" style={{ borderColor: "var(--cc-copper)", background: "var(--cc-copper-tint)" }}>
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--cc-copper)" }} />
                <p className="cc-text-primary">
                    <strong>Vecinos no verificados.</strong> Tu edificio todavía no tiene administración en Convive, así que nadie validó que cada persona viva aquí.
                    Entrega y recibe en persona, y no pagues por adelantado.
                </p>
            </div>
        );
    }

    if (!onHome || !summary) return null;
    const message = adminInviteMessage(summary.buildingName || buildingName || "mi edificio", PUBLIC_SITE_URL);
    return (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between"
            style={summary.highlightInvite
                ? { borderColor: "var(--cc-sage)", background: "var(--cc-sage-tint, var(--cc-paper))" }
                : { borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-start gap-3">
                <Users className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--cc-copper)" }} />
                <div>
                    <p className="font-semibold cc-text-primary">
                        {summary.residents === 1 ? "Eres el primer vecino en Convive" : `Somos ${summary.residents} vecinos en Convive`}
                    </p>
                    <p className="text-sm cc-text-secondary">
                        {summary.highlightInvite
                            ? "Ya son suficientes para que la administración se sume: gastos comunes, reservas, avisos y votaciones en un solo lugar."
                            : "Invita a más vecinos y a tu administración: con ella se activan gastos comunes, reservas y avisos."}
                    </p>
                </div>
            </div>
            <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                <MessageCircle className="h-4 w-4" /> Invitar a mi administración
            </a>
        </div>
    );
}
