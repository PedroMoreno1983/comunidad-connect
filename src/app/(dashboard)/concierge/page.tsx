"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Key, Plus, QrCode, ShoppingBag, Users } from "lucide-react";
import { Eyebrow } from "@/components/cc/Eyebrow";
import { KpiCard } from "@/components/cc/KpiCard";
import { Tag as CcTag } from "@/components/cc/Tag";
import { useAuth } from "@/lib/authContext";
import { ConciergeService, ConciergeVisitorRow, ConciergePackageRow, ConciergeCaseRow } from "@/lib/services/supabaseServices";
import type { ConciergeQuickActionProps, ConciergeShiftEvent } from "@/lib/types";

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

function buildShiftLog(visitors: ConciergeVisitorRow[], packages: ConciergePackageRow[], cases: ConciergeCaseRow[]): ConciergeShiftEvent[] {
    const events: ConciergeShiftEvent[] = [];

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
    const dateToday = new Date().toLocaleDateString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
    });
    const buildingCoverSrc = user?.communityCoverPhotoUrl || "/edificio-malaga-patio.jpg";

    return (
        <div className="space-y-8">
            {/* Immersive concierge cover */}
            <section className="relative min-h-[360px] overflow-hidden sm:min-h-[400px]" style={{ borderRadius: 26, background: "var(--cc-ink)" }}>
                <Image
                    src={buildingCoverSrc}
                    alt="Foto de tu edificio"
                    fill
                    priority
                    sizes="(min-width: 1280px) 1216px, 100vw"
                    className="object-cover"
                />
                <div
                    aria-hidden
                    className="absolute inset-0"
                    style={{ background: "linear-gradient(90deg, rgba(20,17,13,0.94) 0%, rgba(20,17,13,0.7) 50%, rgba(20,17,13,0.2) 100%)" }}
                />
                <div className="relative flex min-h-[360px] flex-col justify-between p-7 sm:min-h-[400px] sm:p-10 lg:p-12" style={{ color: "var(--cc-paper)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <Eyebrow style={{ color: "rgba(244,239,230,0.74)" }}>{dateToday}</Eyebrow>
                        <span className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-medium" style={{ borderColor: "rgba(244,239,230,0.3)", background: "rgba(20,17,13,0.35)" }}>
                            <span className="h-1.5 w-1.5 rounded-full bg-[#9DB683]" /> Recepción operativa
                        </span>
                    </div>

                    <div className="max-w-2xl">
                        <p className="mb-3 text-[12px] font-semibold uppercase tracking-[0.2em]" style={{ color: "var(--cc-copper-soft)" }}>Control del edificio</p>
                        <h1 className="text-[44px] leading-[0.96] tracking-[-0.03em] sm:text-[62px]" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Turno <em style={{ color: "var(--cc-copper-soft)", fontStyle: "italic" }}>activo.</em>
                        </h1>
                        <p className="mt-4 max-w-xl text-[14px] leading-6" style={{ color: "rgba(244,239,230,0.78)" }}>
                            Controla accesos, recibe encomiendas y mantén la recepción al día desde un solo lugar.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-2">
                            <span className="rounded-full px-3 py-2 text-[11px] font-medium" style={{ background: "rgba(244,239,230,0.14)" }}>
                                {loading ? "--" : activeVisitors} {activeVisitors === 1 ? "visita dentro" : "visitas dentro"}
                            </span>
                            <span className="rounded-full px-3 py-2 text-[11px] font-medium" style={{ background: pendingPackages.length > 0 ? "rgba(190,105,69,0.82)" : "rgba(105,135,84,0.78)" }}>
                                {loading ? "--" : pendingPackages.length} {pendingPackages.length === 1 ? "encomienda pendiente" : "encomiendas pendientes"}
                            </span>
                            {criticalCases.length > 0 && (
                                <span className="rounded-full px-3 py-2 text-[11px] font-medium" style={{ background: "rgba(177,74,61,0.86)" }}>
                                    {criticalCases.length} {criticalCases.length === 1 ? "incidencia crítica" : "incidencias críticas"}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            {/* Primary concierge actions */}
            <section>
                <div className="mb-3 flex items-center justify-between">
                    <Eyebrow>¿Qué necesitas registrar?</Eyebrow>
                    <span className="text-[11px] text-[var(--cc-ink-tertiary)]">Acciones del turno</span>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <ConciergeQuickAction href="/concierge/visitors?mode=manual" icon={<Plus size={19} />} title="Nueva visita" detail="Ingreso manual" />
                    <ConciergeQuickAction href="/concierge/visitors?mode=qr" icon={<QrCode size={19} />} title="Validar QR" detail="Acceso preautorizado" />
                    <ConciergeQuickAction href="/concierge/packages" icon={<ShoppingBag size={19} />} title="Recibir paquete" detail="Nueva encomienda" />
                    <ConciergeQuickAction href="/concierge/visitors" icon={<Key size={19} />} title="Gestionar accesos" detail="Entradas y salidas" />
                </div>
            </section>

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
                                                {pkg.units?.number ? `Depto ${pkg.units.number}` : "Unidad sin asignar"}
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

function ConciergeQuickAction({ href, icon, title, detail }: ConciergeQuickActionProps) {
    return (
        <Link
            href={href}
            className="group flex min-h-[104px] flex-col justify-between border bg-[var(--cc-paper)] p-4 transition-all hover:-translate-y-0.5 hover:shadow-sm"
            style={{ borderColor: "var(--cc-line)", borderRadius: 18 }}
        >
            <div className="flex items-start justify-between">
                <div className="grid h-9 w-9 place-items-center rounded-[11px] bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]">{icon}</div>
                <ArrowRight size={15} className="text-[var(--cc-ink-faint)] transition-transform group-hover:translate-x-0.5" />
            </div>
            <div>
                <div className="text-[13px] font-semibold text-[var(--cc-ink)]">{title}</div>
                <div className="mt-1 text-[11px] text-[var(--cc-ink-tertiary)]">{detail}</div>
            </div>
        </Link>
    );
}
