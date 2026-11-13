"use client";

import Link from "next/link";
import { Building2, Mail, MessageCircle } from "lucide-react";
import { PUBLIC_SITE_URL } from "@/lib/config";
import { adminInviteMessage } from "@/lib/neighborMode";
import type { NeighborModeGateProps } from "@/lib/types";

/**
 * Pantalla de la administración vista en modo vecino: en vez de un módulo
 * vacío, para qué sirve y cómo invitar a la administración.
 */
export function NeighborModeGateScreen({ gate, buildingName, pendingValidation = false }: NeighborModeGateProps) {
    const message = adminInviteMessage(buildingName || "mi edificio", PUBLIC_SITE_URL);
    const subject = `Convive Connect para ${buildingName || "nuestro edificio"}`;

    return (
        <section className="mx-auto max-w-xl space-y-5 rounded-2xl border p-6 sm:p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="flex items-center gap-3">
                <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                    <Building2 className="h-5 w-5" />
                </span>
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: "var(--cc-copper)" }}>Se activa con tu administración</p>
                    <h1 className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{gate.title}</h1>
                </div>
            </div>
            <p className="text-sm leading-relaxed cc-text-secondary">{gate.description}</p>
            {pendingValidation ? (
                <p className="text-sm leading-relaxed cc-text-secondary">
                    Tu administración ya está en Convive y tiene que confirmar que vives en el edificio. Cuando lo haga, esto se activa para ti.
                </p>
            ) : (
            <>
            <p className="text-sm leading-relaxed cc-text-secondary">
                Tu edificio está en Convive gracias a sus vecinos, pero la administración todavía no. Cuando se sume, esto se activa para todos.
            </p>
            <div className="flex flex-wrap gap-2">
                <a href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-semibold text-white" style={{ background: "var(--cc-sage)" }}>
                    <MessageCircle className="h-4 w-4" /> Invitar a mi administración por WhatsApp
                </a>
                <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-sm font-semibold cc-text-primary" style={{ borderColor: "var(--cc-line-strong)" }}>
                    <Mail className="h-4 w-4" /> Por correo
                </a>
            </div>
            </>
            )}
            <div className="border-t pt-4 text-sm cc-text-secondary" style={{ borderColor: "var(--cc-line)" }}>
                Mientras tanto, ya puedes usar{" "}
                <Link href="/chat" className="font-semibold underline">CoCo</Link>,{" "}
                <Link href="/resident/supermercado" className="font-semibold underline">el supermercado</Link>,{" "}
                <Link href="/marketplace" className="font-semibold underline">el marketplace</Link> y{" "}
                <Link href="/services" className="font-semibold underline">los maestros de confianza</Link>.
            </div>
        </section>
    );
}
