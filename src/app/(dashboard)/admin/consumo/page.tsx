"use client";

import { useEffect, useState } from "react";
import { AdminMeterEntry } from "@/components/admin/AdminMeterEntry";
import { UnitStatusGrid } from "@/components/admin/UnitStatusGrid";
import { UnitDetailPanel } from "@/components/admin/UnitDetailPanel";
import {
    Activity,
    AlertCircle,
    Filter,
    Printer,
    Settings,
    TrendingUp,
    Waves,
} from "lucide-react";
import { Unit, WaterReading } from "@/lib/types";
import { WaterService } from "@/lib/api";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";
import { useAuth } from "@/lib/authContext";

const fallbackWaterStats = {
    totalConsumption: 348.6,
    alertCount: 3,
    readUnits: 18,
    totalUnits: 24,
    averageConsumption: 14.5,
};

const demoWaterUnits: Unit[] = [
    { id: "demo-water-u1", number: "805", floor: 8, tower: "A" },
    { id: "demo-water-u2", number: "1204", floor: 12, tower: "A" },
    { id: "demo-water-u3", number: "1505", floor: 15, tower: "B" },
    { id: "demo-water-u4", number: "1802", floor: 18, tower: "B" },
];

function calculateConsumption(readings: WaterReading[]) {
    const sorted = [...readings].sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
    if (sorted.length < 2) return 0;

    const current = sorted[sorted.length - 1];
    const previous = sorted[sorted.length - 2];
    return Math.max(0, Number((current.reading_value - previous.reading_value).toFixed(2)));
}

export default function AdminConsumoPage() {
    const { user } = useAuth();
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
    const [stats, setStats] = useState({
        totalConsumption: 0,
        alertCount: 0,
        readUnits: 0,
        totalUnits: 0,
        averageConsumption: 0,
    });
    const currentPeriod = getCurrentWaterPeriod();
    const isDemoUser = user?.email.toLowerCase().endsWith("@demo.com") ?? false;

    useEffect(() => {
        async function loadStats() {
            try {
                if (isDemoUser) {
                    setStats(fallbackWaterStats);
                    return;
                }

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
    }, [currentPeriod.month, currentPeriod.year, isDemoUser]);

    const handleSaveReading = async (unitId: string, value: number) => {
        try {
            if (isDemoUser) return;

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

    return (
        <div className="mx-auto max-w-6xl space-y-6 p-6">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                <div>
                    <h1 className="text-3xl font-bold cc-text-primary">Control hídrico</h1>
                    <p className="cc-text-secondary">Periodo activo: {currentPeriod.month} {currentPeriod.year}</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button className="inline-flex items-center gap-2 rounded-lg border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary shadow-sm transition-colors hover:bg-elevated">
                        <Printer className="h-4 w-4 cc-text-secondary" />
                        Imprimir planillas
                    </button>
                    <button className="inline-flex items-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-600">
                        <Filter className="h-4 w-4" />
                        Ver reportes
                    </button>
                </div>
            </header>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="flex flex-col gap-4 border-b border-subtle p-5 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        <Waves className="h-5 w-5 text-slate-500" />
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Resumen del periodo</h2>
                            <p className="text-sm cc-text-secondary">Lecturas, consumo y alertas del mes activo.</p>
                        </div>
                    </div>
                    <div className="min-w-[220px]">
                        <div className="mb-1 flex items-center justify-between text-xs font-semibold cc-text-secondary">
                            <span>Cobertura de lectura</span>
                            <span>{coverage}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-elevated">
                            <div className="h-full bg-brand-500" style={{ width: `${coverage}%` }} />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 divide-y divide-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Waves className="h-4 w-4" />
                            Consumo total mes
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">{stats.totalConsumption.toFixed(1)} m3</p>
                        <p className="mt-2 flex items-center gap-1 text-xs font-semibold text-success-fg">
                            <TrendingUp className="h-3 w-3 rotate-180" />
                            Promedio {stats.averageConsumption.toFixed(1)} m3 por unidad
                        </p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <AlertCircle className="h-4 w-4" />
                            Alertas de fuga
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">{stats.alertCount}</p>
                        <p className="mt-2 text-xs font-semibold text-warning-fg">Unidades con sobreconsumo</p>
                    </div>

                    <div className="p-5">
                        <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] cc-text-secondary">
                            <Activity className="h-4 w-4" />
                            Lecturas registradas
                        </div>
                        <p className="text-3xl font-semibold cc-text-primary">{stats.readUnits} / {stats.totalUnits}</p>
                        <p className="mt-2 text-xs font-semibold cc-text-secondary">Unidades del periodo</p>
                    </div>
                </div>
            </section>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="flex items-center justify-between border-b border-subtle p-5">
                    <div className="flex items-center gap-3">
                        <Activity className="h-5 w-5 text-slate-500" />
                        <h2 className="text-lg font-semibold cc-text-primary">Estado de lecturas comunidad</h2>
                    </div>
                    <span className="text-sm font-semibold cc-text-secondary">{coverage}% cobertura</span>
                </div>
                {isDemoUser ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-subtle bg-canvas/50 text-slate-500">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Unidad</th>
                                    <th className="px-6 py-4 font-semibold">Ubicación</th>
                                    <th className="px-6 py-4 font-semibold">Estado</th>
                                    <th className="px-6 py-4 text-right font-semibold">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-subtle">
                                {demoWaterUnits.map((unit, index) => (
                                    <tr key={unit.id} className="transition-colors hover:bg-elevated/50">
                                        <td className="px-6 py-4 font-semibold cc-text-primary">Depto {unit.number}</td>
                                        <td className="px-6 py-4 cc-text-secondary">Torre {unit.tower}, Piso {unit.floor}</td>
                                        <td className="px-6 py-4">
                                            <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${index === 2 ? "bg-warning-bg text-warning-fg" : "bg-success-bg text-success-fg"}`}>
                                                {index === 2 ? "Alerta consumo" : "Lectura OK"}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                onClick={() => setSelectedUnit(unit)}
                                                className="rounded-lg border border-subtle px-3 py-2 text-xs font-semibold cc-text-primary transition-colors hover:bg-elevated"
                                            >
                                                Revisar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-5">
                        <UnitStatusGrid onUnitSelect={setSelectedUnit} />
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-subtle bg-surface shadow-sm">
                <div className="flex items-center gap-3 border-b border-subtle p-5">
                    <Settings className="h-5 w-5 text-slate-500" />
                    <h2 className="text-lg font-semibold cc-text-primary">Ingreso de lecturas</h2>
                </div>
                {isDemoUser ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="border-b border-subtle bg-canvas/50 text-slate-500">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">Unidad</th>
                                    <th className="px-6 py-4 font-semibold">Lectura anterior</th>
                                    <th className="px-6 py-4 font-semibold">Nueva lectura</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-subtle">
                                {demoWaterUnits.map((unit, index) => (
                                    <tr key={unit.id} className="transition-colors hover:bg-elevated/50">
                                        <td className="px-6 py-4 font-semibold cc-text-primary">Unidad {unit.number}</td>
                                        <td className="px-6 py-4 cc-text-secondary">{(118 + index * 14).toFixed(1)} m3</td>
                                        <td className="px-6 py-4 font-semibold cc-text-primary">{(132 + index * 17).toFixed(1)} m3</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="p-5">
                        <AdminMeterEntry onUnitSelect={setSelectedUnit} />
                    </div>
                )}
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
