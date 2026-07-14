"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Package as PackageIcon } from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Tag } from "@/components/cc/Tag";
import { useAuth } from "@/lib/authContext";
import { PackageService } from "@/lib/services/supabaseServices";
import type { Package as CommunityPackage, PackageSummaryCardProps } from "@/lib/types";

function receivedLabel(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return date.toLocaleString("es-CL", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ResidentPackagesPage() {
    const { user } = useAuth();
    const [packages, setPackages] = useState<CommunityPackage[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const loadPackages = useCallback(async () => {
        if (!user?.unitId) {
            setError("Tu perfil todavía no tiene una unidad asociada.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        try {
            setPackages(await PackageService.getMine(user.unitId));
        } catch {
            setError("No se pudo consultar la bitácora de encomiendas.");
        } finally {
            setLoading(false);
        }
    }, [user?.unitId]);

    useEffect(() => {
        void loadPackages();
    }, [loadPackages]);

    const pending = packages.filter(item => item.status === "pending");
    const delivered = packages.filter(item => item.status === "picked-up");

    return (
        <div className="mx-auto max-w-4xl space-y-8 px-4 py-8 md:px-8">
            <header>
                <Eyebrow className="mb-2">Mi unidad</Eyebrow>
                <DisplayHeading size={36}>Mis encomiendas</DisplayHeading>
                <p className="mt-3 max-w-2xl text-sm leading-6 cc-text-secondary">
                    Consulta únicamente las recepciones asociadas a {user?.unitName || "tu departamento"}.
                </p>
            </header>

            <div className="grid gap-4 sm:grid-cols-2">
                <SummaryCard label="Pendientes de retiro" value={pending.length} icon={<Clock size={18} />} tone="copper" />
                <SummaryCard label="Entregadas" value={delivered.length} icon={<CheckCircle2 size={18} />} tone="sage" />
            </div>

            {loading ? (
                <div className="h-40 animate-pulse rounded-2xl border bg-paper" style={{ borderColor: "var(--cc-line)" }} />
            ) : error ? (
                <div className="rounded-2xl border p-6" style={{ borderColor: "var(--cc-rose)", background: "var(--cc-rose-tint)" }}>
                    <p className="text-sm font-semibold" style={{ color: "var(--cc-rose)" }}>{error}</p>
                    <button type="button" onClick={loadPackages} className="mt-4 text-sm font-semibold underline">Reintentar</button>
                </div>
            ) : packages.length === 0 ? (
                <div className="rounded-2xl border bg-paper p-10 text-center" style={{ borderColor: "var(--cc-line)" }}>
                    <PackageIcon className="mx-auto h-8 w-8" style={{ color: "var(--cc-ink-faint)" }} />
                    <h2 className="mt-4 text-xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Sin encomiendas registradas</h2>
                    <p className="mt-2 text-sm cc-text-secondary">Cuando conserjería reciba una, aparecerá aquí.</p>
                </div>
            ) : (
                <section className="space-y-3">
                    {packages.map(item => (
                        <article key={item.id} className="flex items-start gap-4 rounded-2xl border bg-paper p-5" style={{ borderColor: "var(--cc-line)" }}>
                            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                <PackageIcon size={18} />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <h2 className="font-semibold cc-text-primary">{item.description}</h2>
                                    <Tag tone={item.status === "pending" ? "copper" : "sage"} dot>
                                        {item.status === "pending" ? "Lista para retiro" : "Entregada"}
                                    </Tag>
                                </div>
                                <p className="mt-2 text-xs font-medium cc-text-secondary">Recibida: {receivedLabel(item.receivedAt)}</p>
                                {item.pickedUpAt && <p className="mt-1 text-xs cc-text-tertiary">Retirada: {receivedLabel(item.pickedUpAt)}</p>}
                            </div>
                        </article>
                    ))}
                </section>
            )}
        </div>
    );
}

function SummaryCard({ label, value, icon, tone }: PackageSummaryCardProps) {
    const color = tone === "copper" ? "var(--cc-copper)" : "var(--cc-sage)";
    const background = tone === "copper" ? "var(--cc-copper-tint)" : "var(--cc-sage-tint)";
    return (
        <div className="flex items-center gap-4 rounded-2xl border bg-paper p-5" style={{ borderColor: "var(--cc-line)" }}>
            <div className="grid h-10 w-10 place-items-center rounded-full" style={{ color, background }}>{icon}</div>
            <div>
                <p className="text-xs font-semibold uppercase tracking-wide cc-text-tertiary">{label}</p>
                <p className="mt-1 text-3xl cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{value}</p>
            </div>
        </div>
    );
}
