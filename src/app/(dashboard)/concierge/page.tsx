"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Key, Plus, ShoppingBag, Users } from "lucide-react";
import { Button } from "@/components/cc/Button";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { KpiCard } from "@/components/cc/KpiCard";
import { Tag as CcTag } from "@/components/cc/Tag";
import { useToast } from "@/components/ui/Toast";

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
    const { toast } = useToast();

    const handleNotify = (unit: string, carrier: string) => {
        toast({
            title: "Aviso preparado",
            description: `Notificación lista para el propietario de ${unit} por encomienda ${carrier}.`,
            variant: "success",
        });
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 border-b border-[var(--cc-line)] pb-6 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Eyebrow className="mb-2">Recepción</Eyebrow>
                    <DisplayHeading size={40}>
                        Turno <em className="font-serif font-normal italic text-[var(--cc-amber)]">activo</em>
                    </DisplayHeading>
                </div>
                <div className="flex gap-2">
                    <Link href="/concierge/visitors">
                        <Button variant="ghost" size="sm">
                            <Plus size={13} /> Nueva visita
                        </Button>
                    </Link>
                    <Link href="/concierge/packages">
                        <Button variant="primary" size="sm" style={{ background: "var(--cc-amber)", color: "#1A1611" }}>
                            Recibir paquete
                        </Button>
                    </Link>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <KpiCard eyebrow="En el edificio" value="12" sub="visitas hoy" icon={<Users size={15} />} tone="amber" />
                <KpiCard eyebrow="Encomiendas pendientes" value="7" sub="por retirar" icon={<ShoppingBag size={15} />} tone="copper" />
                <KpiCard eyebrow="Incidencias abiertas" value="1" sub="crítica" icon={<AlertTriangle size={15} />} tone="rose" />
                <KpiCard eyebrow="Próximos retiros" value="2" sub="llaves y visitas" icon={<Key size={15} />} tone="sage" />
            </div>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-4 rounded-xl border border-[var(--cc-line)] bg-[var(--cc-paper)] p-6 shadow-sm lg:col-span-2">
                    <Eyebrow>Bitácora del turno</Eyebrow>
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
                                {SHIFT_LOG.map((log) => {
                                    let tagTone: "sage" | "copper" | "rose" | "neutral" = "neutral";
                                    if (log.status === "Registrado" || log.status === "Retirado") tagTone = "sage";
                                    else if (log.status === "Pendiente") tagTone = "copper";
                                    else if (log.status === "Reportado") tagTone = "rose";

                                    return (
                                        <tr key={`${log.time}-${log.type}`} className="border-b border-[var(--cc-line)] transition-colors last:border-b-0 hover:bg-[var(--cc-paper-warm)]/30">
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
                        <div className="divide-y divide-[var(--cc-line)]">
                            {PENDING_PACKAGES.map((pkg) => (
                                <div key={`${pkg.unit}-${pkg.carrier}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                                    <div>
                                        <p className="text-xs font-semibold text-[var(--cc-ink)]">{pkg.unit}</p>
                                        <p className="mt-0.5 text-[10px] text-[var(--cc-ink-tertiary)]">{pkg.carrier} · {pkg.time}</p>
                                    </div>
                                    <button
                                        onClick={() => handleNotify(pkg.unit, pkg.carrier)}
                                        className="cursor-pointer rounded-lg bg-[var(--cc-copper-tint)] px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--cc-copper)] transition-all hover:bg-[var(--cc-copper-tint)]/80 active:scale-95"
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
