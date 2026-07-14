"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Key, Plus, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { KpiCard } from "@/components/cc/KpiCard";
import { Tag as CcTag } from "@/components/cc/Tag";
import { useAuth } from "@/lib/authContext";
import { ConciergeService, ConciergeVisitorRow, ConciergePackageRow, ConciergeCaseRow } from "@/lib/services/supabaseServices";

type ShiftEvent = {
    id: string;
    timestamp: number;
    time: string;
    type: string;
    desc: string;
    status: string;
    tone: "sage" | "copper" | "rose" | "neutral";
};

function timeLabel(value?: string | null) {
    if (!value) return "--:--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function minutesAgo(value?: string | null) {
    if (!value) return "";
    const date = new Date(value).getTime();
    if (Number.isNaN(date)) return "";
    const minutes = Math.max(0, Math.floor((Date.now() - date) / 60000));
    if (minutes < 1) return "Recién";
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    return `Hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
}

function buildShiftLog(visitors: ConciergeVisitorRow[], packages: ConciergePackageRow[], cases: ConciergeCaseRow[]): ShiftEvent[] {
    const events: ShiftEvent[] = [];

    for (const visitor of visitors) {
        const unit = visitor.units?.number ? `Depto ${visitor.units.number}` : "unidad sin asignar";
        events.push({
            id: `visit-${visitor.id}`,
            timestamp: visitor.entry_time ? new Date(visitor.entry_time).getTime() : 0,
            time: timeLabel(visitor.entry_time),
            type: "Visita",
            desc: `${visitor.visitor_name || "Visitante"} ingresó a ${unit}`,
            status: visitor.exit_time ? "Retirado" : "En edificio",
            tone: visitor.exit_time ? "sage" : "copper",
        });
    }

    for (const pkg of packages) {
        const unit = pkg.units?.number ? `Depto ${pkg.units.number}` : "unidad sin asignar";
        events.push({
            id: `pkg-${pkg.id}`,
            timestamp: pkg.received_at ? new Date(pkg.received_at).getTime() : 0,
            time: timeLabel(pkg.received_at),
            type: "Encomienda",
            desc: `${pkg.description || "Paquete"} para ${unit}`,
            status: pkg.status === "picked-up" ? "Retirado" : "Pendiente",
            tone: pkg.status === "picked-up" ? "sage" : "copper",
        });
    }

    for (const item of cases) {
        const isCritical = item.urgency === "alta" || item.urgency === "emergencia";
        events.push({
            id: `case-${item.id}`,
            timestamp: item.created_at ? new Date(item.created_at).getTime() : 0,
            time: timeLabel(item.created_at),
            type: "Incidencia",
            desc: item.title || item.category || "Caso reportado por CoCo",
            status: isCritical ? "Crítico" : "Reportado",
            tone: isCritical ? "rose" : "neutral",
        });
    }

    return events.sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
}

export default function ConciergeDashboardPage() {
    const { user } = useAuth();
    const [loading, setLoading] = React.useState(true);
    const [visitors, setVisitors] = React.useState<ConciergeVisitorRow[]>([]);
    const [packages, setPackages] = React.useState<ConciergePackageRow[]>([]);
    const [cases, setCases] = React.useState<ConciergeCaseRow[]>([]);

    React.useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const overview = await ConciergeService.getDashboardOverview();
                if (cancelled) return;
                setVisitors(overview.visitors);
                setPackages(overview.packages);
                setCases(overview.cases);
            } catch (error) {
                console.error("[Concierge] dashboard load failed:", error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, []);

    const today = new Date().toDateString();
    const visitsToday = visitors.filter(v => v.entry_time && new Date(v.entry_time).toDateString() === today).length;
    const activeVisitors = visitors.filter(v => !v.exit_time).length;
    const pendingPackages = packages.filter(p => p.status !== "picked-up");
    const criticalCases = cases.filter(c => c.urgency === "alta" || c.urgency === "emergencia");
    const shiftLog = buildShiftLog(visitors, packages, cases);

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 border-b border-[var(--cc-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Eyebrow className="mb-2">Recepción</Eyebrow>
                    <DisplayHeading size={40}>
                        Turno <em className="font-serif font-normal italic text-[var(--cc-copper)]">activo</em>
                    </DisplayHeading>
                </div>
                <div className="flex gap-2">
                    <Link href="/concierge/visitors">
                        <Button variant="ghost" size="sm">
                            <Plus size={13} /> Nueva visita
                        </Button>
                    </Link>
                    <Link href="/concierge/packages">
                        <Button variant="copper" size="sm">
                            Recibir paquete
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Real building photo — only shown to concierges of a community that has one configured */}
            {user?.communityCoverPhotoUrl && (
                <div className="relative overflow-hidden" style={{ borderRadius: 22, height: 120 }}>
                    <Image
                        src={user.communityCoverPhotoUrl}
                        alt="Foto de tu edificio"
                        fill
                        sizes="100vw"
                        className="object-cover"
                    />
                    <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{ background: "linear-gradient(90deg, rgba(26,22,17,0.8) 0%, rgba(26,22,17,0.15) 70%)" }}
                    />
                    <div className="absolute inset-y-0 left-5 flex flex-col justify-center" style={{ color: "var(--cc-paper)" }}>
                        <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "rgba(244,239,230,0.7)" }}>Tu edificio</p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard eyebrow="Visitas hoy" value={loading ? "--" : String(visitsToday)} sub="ingresos registrados" icon={<Users size={15} />} tone="amber" />
                <KpiCard eyebrow="Encomiendas pendientes" value={loading ? "--" : String(pendingPackages.length)} sub="por retirar" icon={<ShoppingBag size={15} />} tone="copper" />
                <KpiCard eyebrow="Incidencias abiertas" value={loading ? "--" : String(cases.length)} sub={`${criticalCases.length} crítica${criticalCases.length === 1 ? "" : "s"}`} icon={<AlertTriangle size={15} />} tone="rose" />
                <KpiCard eyebrow="Visitas en el edificio" value={loading ? "--" : String(activeVisitors)} sub="sin registrar salida" icon={<Key size={15} />} tone="sage" />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-4 rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] p-6 shadow-sm lg:col-span-2">
                    <Eyebrow>Bitácora del turno</Eyebrow>
                    {loading ? (
                        <p className="py-8 text-center text-sm text-[var(--cc-ink-tertiary)]">Cargando bitácora...</p>
                    ) : shiftLog.length === 0 ? (
                        <p className="py-8 text-center text-sm text-[var(--cc-ink-tertiary)]">Sin movimientos registrados en este turno.</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-[var(--cc-line)]">
                                        <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Hora</th>
                                        <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Tipo</th>
                                        <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Detalle</th>
                                        <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {shiftLog.map((log) => (
                                        <tr key={log.id} className="border-b border-[var(--cc-line)] transition-colors last:border-b-0 hover:bg-[var(--cc-paper-warm)]/30">
                                            <td className="py-4 font-mono text-xs text-[var(--cc-ink-secondary)]">{log.time}</td>
                                            <td className="py-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink)]">{log.type}</td>
                                            <td className="max-w-[280px] break-words py-4 text-xs text-[var(--cc-ink-secondary)]">{log.desc}</td>
                                            <td className="py-4">
                                                <CcTag tone={log.tone} solid>{log.status}</CcTag>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    <div className="space-y-4 rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] p-6 shadow-sm">
                        <Eyebrow>Acceso rápido</Eyebrow>
                        <h3 className="text-base font-medium text-[var(--cc-ink)]" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Registrar nueva visita
                        </h3>
                        <div className="grid grid-cols-1 gap-2.5 pt-2">
                            <Link href="/concierge/visitors?mode=manual" className="w-full">
                                <button className="flex w-full cursor-pointer items-center justify-between rounded-lg bg-[var(--cc-ink)] px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--cc-paper)] transition-colors hover:bg-[var(--cc-ink)]/95">
                                    <span>Ingreso manual</span>
                                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </Link>
                            <Link href="/concierge/visitors?mode=qr" className="w-full">
                                <button className="flex w-full cursor-pointer items-center justify-between rounded-lg border border-[var(--cc-line-strong)] bg-transparent px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--cc-ink)] transition-colors hover:bg-[var(--cc-paper-warm)]">
                                    <span>QR preautorizado</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-[var(--cc-copper)] transition-transform group-hover:translate-x-0.5" />
                                </button>
                            </Link>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] p-6 shadow-sm">
                        <Eyebrow>Encomiendas por avisar</Eyebrow>
                        {loading ? (
                            <p className="py-4 text-center text-xs text-[var(--cc-ink-tertiary)]">Cargando...</p>
                        ) : pendingPackages.length === 0 ? (
                            <p className="py-4 text-center text-xs text-[var(--cc-ink-tertiary)]">No hay encomiendas pendientes.</p>
                        ) : (
                            <div className="divide-y divide-[var(--cc-line)]">
                                {pendingPackages.slice(0, 4).map((pkg) => (
                                    <div key={pkg.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                        <div>
                                            <p className="text-xs font-semibold text-[var(--cc-ink)]">
                                                {pkg.recipient_unit_id ? `Depto ${pkg.recipient_unit_id}` : "Unidad sin asignar"}
                                            </p>
                                            <p className="mt-0.5 text-[10px] text-[var(--cc-ink-tertiary)]">{pkg.description || "Encomienda"} · {minutesAgo(pkg.received_at)}</p>
                                        </div>
                                        <Link
                                            href="/concierge/packages"
                                            className="cursor-pointer rounded-lg bg-[var(--cc-copper-tint)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-copper)] transition-all hover:bg-[var(--cc-copper-tint)]/80 active:scale-95"
                                        >
                                            Gestionar
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
