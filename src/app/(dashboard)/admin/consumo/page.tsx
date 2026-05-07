"use client";

import { useEffect, useState } from "react";
import { AdminMeterEntry } from "@/components/admin/AdminMeterEntry";
import { UnitStatusGrid } from "@/components/admin/UnitStatusGrid";
import { UnitDetailPanel } from "@/components/admin/UnitDetailPanel";
import {
    Activity,
    AlertCircle,
    BarChart3,
    Filter,
    Printer,
    Settings,
    TrendingUp,
    Waves,
} from "lucide-react";
import { Unit, WaterReading } from "@/lib/types";
import { WaterService } from "@/lib/api";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";

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

    return (
        <div className="mx-auto max-w-7xl space-y-12 px-4 py-10 md:px-8">
            <header className="flex flex-col justify-between gap-8 md:flex-row md:items-end">
                <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
                        Operaciones & suministros
                    </p>
                    <h1 className="text-4xl font-black cc-text-primary">Control hídrico</h1>
                    <p className="cc-text-secondary">
                        Periodo activo: {currentPeriod.month} {currentPeriod.year}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-4">
                    <button className="flex items-center gap-3 rounded-2xl border border-subtle bg-surface px-8 py-4 font-black cc-text-primary shadow-xl transition-all hover:bg-slate-50 active:scale-95">
                        <Printer className="h-5 w-5 text-slate-400" />
                        Imprimir planillas
                    </button>
                    <button className="flex items-center gap-3 rounded-2xl bg-slate-900 px-8 py-4 font-black text-white shadow-xl transition-all hover:bg-slate-800 active:scale-95 dark:bg-slate-800">
                        <Filter className="h-5 w-5" />
                        Ver reportes
                    </button>
                </div>
            </header>

            <section className="grid grid-cols-1 gap-8 md:grid-cols-3">
                <div className="rounded-[2.5rem] border border-subtle bg-surface p-8 shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="mb-6 flex items-center gap-4">
                        <div className="rounded-2xl bg-blue-50 p-3 dark:bg-blue-500/10">
                            <Waves className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-widest cc-text-primary">Consumo total mes</h2>
                    </div>
                    <p className="mb-1 text-4xl font-black cc-text-primary">{stats.totalConsumption.toFixed(1)} m³</p>
                    <p className="flex items-center gap-1 text-xs font-bold text-emerald-500">
                        <TrendingUp className="h-3 w-3 rotate-180" />
                        Promedio {stats.averageConsumption.toFixed(1)} m³ por unidad
                    </p>
                </div>

                <div className="rounded-[2.5rem] border border-subtle bg-surface p-8 shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="mb-6 flex items-center gap-4">
                        <div className="rounded-2xl bg-warning-bg p-3">
                            <AlertCircle className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h2 className="text-[10px] font-black uppercase tracking-widest cc-text-primary">Alertas de fuga</h2>
                    </div>
                    <p className="mb-1 text-4xl font-black cc-text-primary">{stats.alertCount}</p>
                    <p className="text-xs font-bold uppercase tracking-widest text-amber-500">Unidades con sobreconsumo</p>
                </div>

                <div className="group relative overflow-hidden rounded-[2.5rem] bg-slate-900 p-8 shadow-2xl">
                    <div className="absolute right-0 top-0 p-6 opacity-10 transition-transform duration-500 group-hover:rotate-12">
                        <BarChart3 className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex h-full flex-col justify-between">
                        <div className="mb-6">
                            <h2 className="font-black text-white">Cobertura de lectura</h2>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">Lecturas del periodo</p>
                        </div>
                        <div className="space-y-3">
                            <div className="flex items-center gap-3">
                                <div className="h-3 w-3 animate-pulse rounded-full bg-emerald-500" />
                                <span className="text-sm font-bold text-slate-300">
                                    {stats.readUnits} de {stats.totalUnits} unidades registradas
                                </span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                                <div className="h-full rounded-full bg-blue-500" style={{ width: `${coverage}%` }} />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                    <div className="rounded-2xl bg-blue-100 p-3 dark:bg-blue-500/10">
                        <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-black cc-text-primary">Estado de lecturas comunidad</h2>
                </div>
                <UnitStatusGrid onUnitSelect={setSelectedUnit} />
            </section>

            <section className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                    <div className="rounded-2xl bg-elevated p-3">
                        <Settings className="h-6 w-6 cc-text-primary" />
                    </div>
                    <h2 className="text-2xl font-black cc-text-primary">Ingreso de lecturas</h2>
                </div>
                <AdminMeterEntry onUnitSelect={setSelectedUnit} />
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
