"use client";

import { useCallback, useEffect, useState } from "react";
import { UserCheck, UserX } from "lucide-react";
import { PendingResidentsService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { PendingResident } from "@/lib/types";

/**
 * Vecinos que entraron a Convive sin código, antes de que la administración
 * tomara el edificio. La administración confirma que viven aquí o los quita.
 * Sin pendientes, no se muestra nada.
 */
export function PendingResidentsPanel() {
    const { toast } = useToast();
    const [residents, setResidents] = useState<PendingResident[]>([]);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            setResidents(await PendingResidentsService.list());
        } catch {
            setResidents([]);
        }
    }, []);

    useEffect(() => { void load(); }, [load]);

    const decide = async (resident: PendingResident, approve: boolean) => {
        if (!approve && !window.confirm(`¿Quitar a ${resident.name} de la comunidad? Pierde el acceso al edificio en Convive.`)) return;
        setBusy(resident.id);
        try {
            await PendingResidentsService.decide(resident.id, approve);
            toast({ title: approve ? "Vecino validado" : "Vecino quitado", variant: "success" });
            await load();
        } catch (error) {
            toast({ title: "Error", description: error instanceof Error ? error.message : "No se pudo guardar.", variant: "destructive" });
        } finally {
            setBusy(null);
        }
    };

    if (!residents.length) return null;
    return (
        <section className="rounded-xl border p-5" style={{ borderColor: "var(--cc-copper)", background: "var(--cc-paper)" }}>
            <h2 className="text-lg font-semibold cc-text-primary">Vecinos por validar ({residents.length})</h2>
            <p className="mt-1 text-sm cc-text-secondary">
                Entraron a Convive con la dirección del edificio, antes de que la administración se sumara. Confirma que viven aquí.
            </p>
            <ul className="mt-4 space-y-2">
                {residents.map(resident => (
                    <li key={resident.id} className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: "var(--cc-line)" }}>
                        <div className="min-w-0">
                            <p className="font-semibold cc-text-primary">{resident.name}{resident.departmentNumber ? ` · depto ${resident.departmentNumber}` : ""}</p>
                            <p className="truncate text-xs cc-text-secondary">{resident.email} · desde {new Date(resident.createdAt).toLocaleDateString("es-CL")}</p>
                        </div>
                        <div className="flex gap-2">
                            <button type="button" disabled={busy === resident.id} onClick={() => void decide(resident, true)}
                                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "var(--cc-sage)" }}>
                                <UserCheck className="h-4 w-4" /> Vive aquí
                            </button>
                            <button type="button" disabled={busy === resident.id} onClick={() => void decide(resident, false)}
                                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm cc-text-primary disabled:opacity-50" style={{ borderColor: "var(--cc-line-strong)" }}>
                                <UserX className="h-4 w-4" /> No vive aquí
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        </section>
    );
}
