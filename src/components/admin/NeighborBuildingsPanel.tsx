"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2, Copy, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { NeighborBuildingsService } from "@/lib/api";
import type { NeighborBuildingRow } from "@/lib/types";

/**
 * Edificios por conquistar (superadmin): comunidades que crearon sus vecinos,
 * los con más vecinos primero. "Entregar a su administración" lo deja
 * administrado y entrega el código para que la administración se registre.
 */
export default function NeighborBuildingsPanel() {
    const { toast } = useToast();
    const [buildings, setBuildings] = useState<NeighborBuildingRow[] | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [handover, setHandover] = useState<{ name: string; adminCode: string; residents: number; warnings: string[] } | null>(null);

    const load = useCallback(async () => {
        try {
            setBuildings(await NeighborBuildingsService.list());
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudieron cargar los edificios.", variant: "destructive" });
        }
    }, [toast]);

    useEffect(() => { void load(); }, [load]);

    const activate = async (row: NeighborBuildingRow) => {
        if (!window.confirm(`¿Entregar ${row.name} a su administración? Pasa a ser un edificio administrado y sus ${row.residents} vecinos quedan por validar.`)) return;
        setBusy(row.id);
        try {
            setHandover(await NeighborBuildingsService.activate(row.id));
            await load();
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo entregar.", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="rounded-2xl border overflow-hidden" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            <div className="border-b p-6" style={{ borderColor: "var(--cc-line)" }}>
                <h2 className="flex items-center gap-2 text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                    <Building2 className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                    Edificios por conquistar
                </h2>
                <p className="mt-1 text-sm cc-text-secondary">
                    Los crearon sus vecinos sin la administración. Desde 5 vecinos están listos para contactar a la administración.
                </p>
            </div>

            {handover && (
                <div className="space-y-2 border-b p-6" style={{ borderColor: "var(--cc-line)", background: "var(--cc-copper-tint)" }}>
                    <p className="text-sm font-semibold cc-text-primary">{handover.name} quedó administrado ({handover.residents} vecinos por validar).</p>
                    {handover.warnings.map(warning => <p key={warning} className="text-sm font-semibold" style={{ color: "var(--cc-danger, #b42318)" }}>{warning}</p>)}
                    <p className="text-sm cc-text-secondary">Envíale este código a la administración para que se registre en /signup con &ldquo;Tengo código&rdquo;:</p>
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono font-bold" style={{ background: "var(--cc-paper)" }}>
                            <KeyRound className="h-4 w-4" /> {handover.adminCode}
                        </span>
                        <Button type="button" size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(handover.adminCode); toast({ title: "Código copiado", variant: "success" }); }}>
                            <Copy className="h-3.5 w-3.5" /> Copiar
                        </Button>
                    </div>
                </div>
            )}

            <div className="p-6">
                {!buildings ? <p className="text-sm cc-text-secondary">Cargando…</p> : buildings.length === 0 ? (
                    <p className="text-sm cc-text-secondary">Todavía no hay edificios creados por vecinos.</p>
                ) : (
                    <ul className="space-y-2">
                        {buildings.map(row => (
                            <li key={row.id} className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: row.readyForSales ? "var(--cc-sage)" : "var(--cc-line)" }}>
                                <div className="min-w-0">
                                    <p className="flex items-center gap-2 font-semibold cc-text-primary">
                                        <span className="truncate">{row.name}</span>
                                        {row.readyForSales && <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--cc-sage)" }}>Listo para contactar</span>}
                                    </p>
                                    <p className="truncate text-xs cc-text-secondary">{row.address} · {row.residents} vecino{row.residents === 1 ? "" : "s"} · desde {new Date(row.createdAt).toLocaleDateString("es-CL")}</p>
                                </div>
                                <Button type="button" size="sm" variant="outline" disabled={busy === row.id} onClick={() => void activate(row)}>
                                    Entregar a su administración
                                </Button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </section>
    );
}
