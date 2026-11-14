"use client";

import { useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { NeighborInviteService } from "@/lib/api";
import type { InviteNeighborsButtonProps, NeighborInviteShare } from "@/lib/types";

/**
 * "Invitar vecinos por WhatsApp": el enlace personal del residente, con el
 * mensaje listo. Se carga al montar para que el botón sea un enlace directo
 * (abrir WhatsApp después de una espera lo bloquean los celulares).
 */
export function InviteNeighborsButton({ variant = "primary" }: InviteNeighborsButtonProps) {
    const [invite, setInvite] = useState<NeighborInviteShare | null>(null);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        let cancelled = false;
        NeighborInviteService.myInvite().then(result => { if (!cancelled) setInvite(result); }).catch(() => undefined);
        return () => { cancelled = true; };
    }, []);

    if (!invite) return null;
    const primary = variant === "primary";
    return (
        <div className="flex flex-wrap items-center gap-2">
            <a href={invite.whatsappUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold"
                style={primary ? { background: "var(--cc-sage)", color: "#fff" } : { border: "1px solid var(--cc-line-strong)", color: "var(--cc-ink)" }}>
                <MessageCircle className="h-4 w-4" /> Invitar vecinos por WhatsApp
            </a>
            <button type="button"
                onClick={() => { void navigator.clipboard.writeText(invite.url).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 2000); }); }}
                className="inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold cc-text-secondary hover:bg-black/5">
                <Copy className="h-3.5 w-3.5" /> {copied ? "Enlace copiado" : "Copiar enlace"}
            </button>
        </div>
    );
}
