"use client";

import { useEffect, useState } from "react";
import { AdminMeterEntry } from "@/components/admin/AdminMeterEntry";
import { UnitStatusGrid } from "@/components/admin/UnitStatusGrid";
import { UnitDetailPanel } from "@/components/admin/UnitDetailPanel";
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Filter,
    Printer,
    Settings,
    TrendingUp,
    Waves,
} from "lucide-react";
import { Unit, WaterReading } from "@/lib/types";
import { WaterService } from "@/lib/api";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";
import { ModuleFlow } from "@/components/ui/ModuleFlow";

const fallbackWaterStats = {
    totalConsumption: 0,
    alertCount: 0,
    readUnits: 0,
    totalUnits: 0,
    averageConsumption: 0,
};


function openWaterReportPrompt(periodLabel: string) {
    window.dispatchEvent(new CustomEvent("coco:compose", {
        detail: {
            message: `Necesito preparar un reporte de control hidrico para ${periodLabel}: cobertura de lecturas, alertas de fuga y unidades pendientes.`,
        },
    }));
}

function calculateConsumption(readings: WaterReading[]) {
    const sorted = [...readings].sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
    if (sorted.length < 2) return 0;

    const current = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    return Math.max(0, Number((current.reading_value - previous.reading_value).toFixed(2)));
}

export default function AdminConsumoPage() {
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [stats, setStats] = useState({
        totalConsumption: 0,
        alertCount: 0,
        readUnits: 0,
        totalUnits: 0,
        averageConsumption: 0,
    });
    const currentPeriod = getCurrentWaterPeriod();

    useEffect(() => {
        async function loadStats() {
            try {

                const units = await WaterService.getUnits();
                const readingsByUnit = await Promise.all(units.map((unit: Unit) => WaterService.getReadingsByUnit(unit.id)));
                const consumptions = readingsByUnit.map(calculateConsumption);
                const totalConsumption = consumptions.reduce((sum, value) => sum + value, 0);
                const alertCount = consumptions.filter(value => value > 25).length;
                const readUnits = readingsByUnit.filter((readings: WaterReading[]) =>
                    readings.some(reading => reading.month === currentPeriod.month && reading.year === currentPeriod.year)
                ).length;

                setStats({
                    totalConsumption,
                    alertCount,
                    readUnits,
                    totalUnits: units.length,
                    averageConsumption: units.length > 0 ? totalConsumption / units.length : 0,
                });
            } catch (error) {
                console.error("Error loading water admin stats:", error);
                setStats(fallbackWaterStats);
            }
        }

        loadStats();
    }, [currentPeriod.month, currentPeriod.year]);

    const handleSaveReading = async (unitId: string, value: number) => {
        try {

            await WaterService.saveReading({
                unit_id: unitId,
                reading_value: value,
                month: currentPeriod.month,
                year: currentPeriod.year,
                reading_date: new Date().toISOString().split("T")[0],
            });
        } catch (error) {
            console.error("Error saving reading from panel:", error);
            throw error;
        }
    };


    const coverage = stats.totalUnits > 0 ? Math.round((stats.readUnits / stats.totalUnits) * 100) : 0;
    const pendingUnits = Math.max(0, stats.totalUnits - stats.readUnits);
    const periodLabel = `${currentPeriod.month} ${currentPeriod.year}`;
    const healthLabel = stats.alertCount > 0 ? "Requiere revisión" : pendingUnits > 0 ? "En captura" : "Periodo al día";

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
            <header className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
                <div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em]" style={{ color: "var(--cc-ink-tertiary)" }}>Administración</p>
                    <h1 className="mt-2 text-[28px] leading-none sm:text-[34px]" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Control hídrico</h1>
                    <p className="mt-2.5 cc-text-secondary">Periodo activo: {currentPeriod.month} {currentPeriod.year}</p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    <button
                        type="button"
                        onClick={() => window.print()}
                        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium cc-text-primary transition-colors hover:bg-[var(--cc-paper-warm)]"
                        style={{ borderColor: "var(--cc-line-strong)" }}
                    >
                        <Printer className="h-4 w-4" style={{ color: "var(--cc-ink-tertiary)" }} />
                        Imprimir planillas
                    </button>
                    <button
                        type="button"
                        onClick={() => openWaterReportPrompt(periodLabel)}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                        style={{ background: "var(--cc-copper)" }}
                    >
                        <Filter className="h-4 w-4" />
                        Ver reportes
                    </button>
                </div>
            </header>

            <section className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between" style={{ borderBottom: "1px solid var(--cc-line)" }}>
                    <div className="flex items-center gap-3">
                        <Waves className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                        <div>
                            <h2 className="text-lg leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Resumen del periodo</h2>
                            <p className="mt-1.5 text-sm cc-text-secondary">Lecturas, consumo y alertas del mes activo.</p>
                        </div>
                    </div>
                    <div className="min-w-[220px]">
                        <div className="mb-1.5 flex items-center justify-between text-xs font-medium cc-text-secondary">
                            <span>Cobertura de lectura</span>
                            <span>{coverage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--cc-paper-warm)" }}>
                            <div className="h-full rounded-full" style={{ width: `${coverage}%`, background: "var(--cc-copper)" }} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] cc-text-tertiary">
                            <Waves className="h-4 w-4" />
                            Consumo total mes
                        </div>
                        <p className="text-3xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{stats.totalConsumption.toFixed(1)} m3</p>
                        <p className="mt-2.5 flex items-center gap-1.5 text-xs font-medium" style={{ color: "var(--cc-sage)" }}>
                            <TrendingUp className="h-3 w-3 rotate-180" />
                            Promedio {stats.averageConsumption.toFixed(1)} m3 por unidad
                        </p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] cc-text-tertiary">
                            <AlertCircle className="h-4 w-4" />
                            Alertas de fuga
                        </div>
                        <p className="text-3xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{stats.alertCount}</p>
                        <p className="mt-2.5 text-xs font-medium" style={{ color: "var(--cc-amber)" }}>Unidades con sobreconsumo</p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] cc-text-tertiary">
                            <Activity className="h-4 w-4" />
                            Lecturas registradas
                        </div>
                        <p className="text-3xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{stats.readUnits} / {stats.totalUnits}</p>
                        <p className="mt-2.5 text-xs cc-text-secondary">Unidades del periodo</p>
                    </div>
                </div>
            </section>

            <ModuleFlow
                title="Cierre mensual de lecturas"
                description="El modulo debe partir con lecturas pendientes y terminar con consumo validado, alertas revisadas y reporte listo para administracion."
                statusLabel={`${coverage}% cobertura`}
                completedSteps={pendingUnits > 0 ? 0 : stats.alertCount > 0 ? 2 : 4}
                currentStep={pendingUnits > 0 ? 1 : stats.alertCount > 0 ? 3 : 4}
                primaryActionLabel={pendingUnits > 0 ? "Completar lecturas" : stats.alertCount > 0 ? "Revisar alertas" : "Ver cierre"}
                primaryActionHref={pendingUnits > 0 ? "#ingreso-lecturas" : "#estado-lecturas"}
                steps={[
                    "Capturar lecturas por unidad",
                    "Procesar consumo del periodo",
                    "Revisar sobreconsumos",
                    "Generar reporte y planillas",
                ]}
                outcome="Cierre esperado: todas las unidades quedan con estado de lectura, las fugas quedan priorizadas y el reporte del periodo queda disponible para seguimiento."
            />

            <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl border p-5 lg:col-span-2" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-5 flex items-center justify-between gap-4">
                        <div>
                            <h2 className="text-lg leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Operación del periodo</h2>
                            <p className="mt-2 text-sm cc-text-secondary">Prioridades para cerrar lecturas y anticipar reclamos por consumo.</p>
                        </div>
                        <span
                            className="rounded-full px-3 py-1 text-xs font-medium"
                            style={stats.alertCount > 0 ? { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" } : { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}
                        >
                            {healthLabel}
                        </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                        {[
                            { label: "Lecturas pendientes", value: pendingUnits, detail: "Unidades por capturar", icon: <Activity className="h-4 w-4" /> },
                            { label: "Alertas activas", value: stats.alertCount, detail: "Sobreconsumo a revisar", icon: <AlertCircle className="h-4 w-4" /> },
                            { label: "Promedio comunidad", value: `${stats.averageConsumption.toFixed(1)} m3`, detail: "Base para comparación", icon: <Waves className="h-4 w-4" /> },
                        ].map(item => (
                            <div key={item.label} className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: "var(--cc-paper)", color: "var(--cc-ink-tertiary)" }}>
                                    {item.icon}
                                </div>
                                <p className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{item.value}</p>
                                <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] cc-text-tertiary">{item.label}</p>
                                <p className="mt-1.5 text-xs cc-text-secondary">{item.detail}</p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <h2 className="text-lg leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Checklist de cierre</h2>
                    <div className="mt-4 space-y-3">
                        {[
                            { label: "Capturar lecturas faltantes", done: pendingUnits === 0 },
                            { label: "Revisar unidades con sobreconsumo", done: stats.alertCount === 0 },
                            { label: "Preparar reporte para administración", done: coverage >= 90 },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-3 text-sm">
                                <CheckCircle2 className="h-5 w-5" style={{ color: item.done ? "var(--cc-sage)" : "var(--cc-ink-faint)" }} />
                                <span style={{ color: item.done ? "var(--cc-ink)" : "var(--cc-ink-muted)" }}>{item.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <section id="estado-lecturas" className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--cc-line)" }}>
                    <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                        <h2 className="text-lg leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Estado de lecturas comunidad</h2>
                    </div>
                    <span className="text-sm font-medium cc-text-secondary">{coverage}% cobertura</span>
                </div>
                <div className="p-5">
                    <UnitStatusGrid onUnitSelect={setSelectedUnit} />
                </div>
            </section>

            <section id="ingreso-lecturas" className="rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="flex items-center gap-3 p-5" style={{ borderBottom: "1px solid var(--cc-line)" }}>
                    <Settings className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                    <h2 className="text-lg leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Ingreso de lecturas</h2>
                </div>
                <div className="p-5">
                    <AdminMeterEntry onUnitSelect={setSelectedUnit} />
                </div>
            </section>

            <UnitDetailPanel
                unit={selectedUnit}
                isOpen={!!selectedUnit}
                onClose={() => setSelectedUnit(null)}
                onSaveReading={handleSaveReading}
            />
        </div>
    );
}
