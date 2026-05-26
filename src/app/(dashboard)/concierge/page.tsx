"use client";

import * as React from "react";
import { Users, ShoppingBag, AlertTriangle, Key, Plus, ArrowRight } from "lucide-react";
import { KpiCard } from "@/components/cc/KpiCard";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";
import { Button } from "@/components/cc/Button";
import { Tag as CcTag } from "@/components/cc/Tag";
import Link from "next/link";

const SHIFT_LOG = [
    { time: "09:14", type: "Visita", desc: "Juan Gómez ingresó a Depto 102", status: "Registrado" },
    { time: "09:30", type: "Encomienda", desc: "Paquete MercadoLibre para Depto 8B", status: "Pendiente" },
    { time: "10:15", type: "Incidencia", desc: "Corte de agua en caldera general", status: "Reportado" },
    { time: "10:45", type: "Retiro", desc: "Visita retiró llaves de Depto 404", status: "Retirado" },
];

const PENDING_PACKAGES = [
    { unit: "Depto 1204", carrier: "MercadoLibre", time: "Hace 10 min" },
    { unit: "Depto 802", carrier: "Jumbo Delivery", time: "Hace 25 min" },
    { unit: "Depto 510", carrier: "Starken", time: "Hace 1 hora" },
];

export default function ConciergeDashboardPage() {
    const handleNotify = (unit: string, carrier: string) => {
        alert(`Se ha enviado una notificación de WhatsApp al propietario del ${unit} sobre su encomienda de ${carrier}.`);
    };

    return (
        <div className="space-y-8">
            {/* Page title */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-6 border-b border-[var(--cc-line)]">
                <div>
                    <Eyebrow className="mb-2">Recepción</Eyebrow>
                    <DisplayHeading size={40}>
                        Turno <em className="text-[var(--cc-amber)] font-serif italic font-normal">activo</em>
                    </DisplayHeading>
                </div>
                <div className="flex gap-2">
                    <Link href="/concierge/visitors">
                        <Button variant="ghost" size="sm">
                            <Plus size={13} /> Nueva Visita
                        </Button>
                    </Link>
                    <Link href="/concierge/packages">
                        <Button variant="primary" size="sm" style={{ background: "var(--cc-amber)", color: "#1A1611" }}>
                            Recibir Paquete
                        </Button>
                    </Link>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <KpiCard
                    eyebrow="En el edificio (Visitas)"
                    value="12"
                    sub="ingresos hoy"
                    icon={<Users size={15} />}
                    tone="amber"
                />
                <KpiCard
                    eyebrow="Encomiendas pendientes"
                    value="7"
                    sub="por retirar"
                    icon={<ShoppingBag size={15} />}
                    tone="copper"
                />
                <KpiCard
                    eyebrow="Incidencias abiertas"
                    value="1"
                    sub="crítica"
                    icon={<AlertTriangle size={15} />}
                    tone="rose"
                />
                <KpiCard
                    eyebrow="Próximos retiros"
                    value="2"
                    sub="llaves/visitas"
                    icon={<Key size={15} />}
                    tone="sage"
                />
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left 2 Columns: Shift Log Table */}
                <div className="lg:col-span-2 bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-6 shadow-sm space-y-4">
                    <Eyebrow>Bitácora del Turno</Eyebrow>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-[var(--cc-line)]">
                                    <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Hora</th>
                                    <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Tipo</th>
                                    <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Detalle</th>
                                    <th className="pb-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink-tertiary)]">Estado</th>
                                </tr>
                            </thead>
                            <tbody>
                                {SHIFT_LOG.map((log, i) => {
                                    let tagTone: "sage" | "copper" | "rose" | "neutral" = "neutral";
                                    if (log.status === "Registrado" || log.status === "Retirado") tagTone = "sage";
                                    else if (log.status === "Pendiente") tagTone = "copper";
                                    else if (log.status === "Reportado") tagTone = "rose";

                                    return (
                                        <tr key={i} className="border-b last:border-b-0 border-[var(--cc-line)] hover:bg-[var(--cc-paper-warm)]/30 transition-colors">
                                            <td className="py-4 font-mono text-xs text-[var(--cc-ink-secondary)]">{log.time}</td>
                                            <td className="py-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-ink)]">{log.type}</td>
                                            <td className="py-4 text-xs text-[var(--cc-ink-secondary)]">{log.desc}</td>
                                            <td className="py-4">
                                                <CcTag tone={tagTone} solid>{log.status}</CcTag>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Right Column: Actions Sidebar */}
                <div className="space-y-6">
                    
                    {/* Acceso Rápido Card */}
                    <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-6 shadow-sm space-y-4">
                        <Eyebrow>Acceso Rápido</Eyebrow>
                        <h3 className="text-base font-medium text-[var(--cc-ink)]" style={{ fontFamily: "var(--cc-font-display)" }}>
                            Registrar nueva visita
                        </h3>
                        <div className="grid grid-cols-1 gap-2.5 pt-2">
                            <Link href="/concierge/visitors?mode=manual" className="w-full">
                                <button className="w-full py-3 px-4 rounded-lg bg-[var(--cc-ink)] text-[var(--cc-paper)] text-xs font-semibold uppercase tracking-wider hover:bg-[var(--cc-ink)]/95 transition-colors flex items-center justify-between group cursor-pointer">
                                    <span>Ingreso Manual</span>
                                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </Link>
                            <Link href="/concierge/visitors?mode=qr" className="w-full">
                                <button className="w-full py-3 px-4 rounded-lg border border-[var(--cc-line-strong)] bg-transparent text-[var(--cc-ink)] text-xs font-semibold uppercase tracking-wider hover:bg-[var(--cc-paper-warm)] transition-colors flex items-center justify-between group cursor-pointer">
                                    <span>QR Pre-autorizado</span>
                                    <ArrowRight className="h-3.5 w-3.5 text-[var(--cc-copper)] group-hover:translate-x-0.5 transition-transform" />
                                </button>
                            </Link>
                        </div>
                    </div>

                    {/* Encomiendas por avisar Card */}
                    <div className="bg-[var(--cc-paper)] border border-[var(--cc-line)] rounded-xl p-6 shadow-sm space-y-4">
                        <Eyebrow>Encomiendas por avisar</Eyebrow>
                        <div className="divide-y divide-[var(--cc-line)]">
                            {PENDING_PACKAGES.map((pkg, i) => (
                                <div key={i} className="py-3 first:pt-0 last:pb-0 flex items-center justify-between">
                                    <div>
                                        <p className="text-xs font-semibold text-[var(--cc-ink)]">{pkg.unit}</p>
                                        <p className="text-[10px] text-[var(--cc-ink-tertiary)] mt-0.5">{pkg.carrier} · {pkg.time}</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotify(pkg.unit, pkg.carrier)}
                                        className="px-2.5 py-1.5 rounded-lg bg-[var(--cc-copper-tint)] text-[var(--cc-copper)] text-[10px] font-semibold uppercase tracking-wider hover:bg-[var(--cc-copper-tint)]/80 transition-all active:scale-95 cursor-pointer"
                                    >
                                        Avisar
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>

                </div>

            </div>
        </div>
    );
}
