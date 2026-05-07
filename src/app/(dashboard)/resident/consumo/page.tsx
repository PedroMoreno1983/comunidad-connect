"use client";

import { useEffect, useMemo, useState } from "react";
import {
    AlertTriangle,
    ArrowRight,
    Calculator,
    CheckCircle2,
    History,
    Loader2,
    TrendingDown,
    TrendingUp,
    Waves,
} from "lucide-react";
import { WaterConsumptionChart } from "@/components/resident/WaterConsumptionChart";
import { CostEstimator } from "@/components/resident/CostEstimator";
import { SavingsGoalCard } from "@/components/resident/SavingsGoalCard";
import { WaterService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { WaterReading, ConsumptionMetric } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";

const BUILDING_AVERAGE_M3 = 15.5;

const demoWaterReadings: WaterReading[] = [
    { id: "demo-water-1", unit_id: "demo", reading_value: 102.4, reading_date: "2026-01-15", month: "Enero", year: 2026, created_at: "2026-01-15T12:00:00.000Z" },
    { id: "demo-water-2", unit_id: "demo", reading_value: 116.8, reading_date: "2026-02-15", month: "Febrero", year: 2026, created_at: "2026-02-15T12:00:00.000Z" },
    { id: "demo-water-3", unit_id: "demo", reading_value: 132.1, reading_date: "2026-03-15", month: "Marzo", year: 2026, created_at: "2026-03-15T12:00:00.000Z" },
    { id: "demo-water-4", unit_id: "demo", reading_value: 151.9, reading_date: "2026-04-15", month: "Abril", year: 2026, created_at: "2026-04-15T12:00:00.000Z" },
    { id: "demo-water-5", unit_id: "demo", reading_value: 174.7, reading_date: "2026-05-15", month: "Mayo", year: 2026, created_at: "2026-05-15T12:00:00.000Z" },
];

function calculateConsumption(current: WaterReading, allReadings: WaterReading[]) {
    const index = allReadings.findIndex(reading => reading.id === current.id);
    if (index <= 0) return 0;

    const previous = allReadings[index - 1];
    return Math.max(0, Number((current.reading_value - previous.reading_value).toFixed(2)));
}

function formatPercent(value: number) {
    if (!Number.isFinite(value) || value === 0) return "0%";
    return `${Math.abs(value).toFixed(0)}%`;
}

function shortMonth(value?: string | null) {
    return typeof value === "string" && value.trim() ? value.slice(0, 3) : "---";
}

function openLeakReport(unitName?: string) {
    window.dispatchEvent(new CustomEvent("coco:compose", {
        detail: {
            message: `Quiero reportar una posible fuga de agua en mi unidad${unitName ? ` ${unitName}` : ""}. Necesito que Conserjería o Administración lo revise.`,
        },
    }));
}

export default function WaterConsumptionPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [readings, setReadings] = useState<WaterReading[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadData() {
            try {
                const data = user?.unitId ? await WaterService.getReadingsByUnit(user.unitId) : demoWaterReadings;
                const sourceData = data.length ? data : demoWaterReadings;
                const sortedData = [...sourceData].sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
                const enrichedData = sortedData.map(reading => ({
                    ...reading,
                    consumption: calculateConsumption(reading, sortedData),
                }));

                setReadings(enrichedData);
            } catch (error: unknown) {
                console.error("Error fetching water data:", error);
                const sortedData = [...demoWaterReadings].sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
                setReadings(sortedData.map(reading => ({
                    ...reading,
                    consumption: calculateConsumption(reading, sortedData),
                })));
                const err = error as { code?: string };
                if (err.code !== "PGRST116" && err.code !== "42P01") {
                    toast({
                        title: "Error de conexión",
                        description: "No se pudieron cargar los datos de consumo al conectar con el servidor.",
                        variant: "destructive",
                    });
                }
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [user, toast]);

    const metrics = useMemo<ConsumptionMetric[]>(() => readings.map(reading => ({
        month: shortMonth(reading.month),
        personal: reading.consumption || 0,
        average: BUILDING_AVERAGE_M3,
    })), [readings]);

    const lastReading = readings[readings.length - 1];
    const previousReading = readings[readings.length - 2];
    const currentConsumption = lastReading?.consumption || 0;
    const previousConsumption = previousReading?.consumption || 0;
    const consumptionDelta = currentConsumption - previousConsumption;
    const trendPercent = previousConsumption > 0 ? (consumptionDelta / previousConsumption) * 100 : 0;
    const isElevated = currentConsumption > BUILDING_AVERAGE_M3 * 1.2;
    const possibleLeak = previousConsumption > 0 && currentConsumption > previousConsumption * 1.35 && currentConsumption > 8;
    const recentReadings = readings.slice(-3).reverse();

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (readings.length === 0 && !user?.unitId) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
                <Waves className="h-12 w-12 text-slate-300" />
                <h2 className="text-xl font-bold cc-text-secondary">Sin unidad asignada</h2>
                <p className="text-slate-500">Contacta a la administración para vincular tu usuario a un departamento.</p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 md:px-8">
            <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-400">
                        Eficiencia hídrica
                    </p>
                    <h1 className="text-4xl font-black cc-text-primary">Consumo de agua</h1>
                    <p className="max-w-2xl cc-text-secondary">
                        Controla lecturas, gasto estimado y señales tempranas de sobreconsumo.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => openLeakReport(user?.unitName)}
                    className="inline-flex items-center justify-center gap-3 rounded-2xl border border-blue-200 bg-surface px-6 py-4 text-sm font-black cc-text-primary shadow-sm transition-all hover:border-blue-300 hover:bg-blue-50 dark:border-blue-500/20 dark:hover:bg-blue-500/10"
                >
                    <Waves className="h-5 w-5 text-blue-500" />
                    Reportar fuga con CoCo
                </button>
            </header>

            <section className="grid gap-4 md:grid-cols-4">
                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10">
                        <Waves className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-black cc-text-primary">{currentConsumption.toFixed(1)} m³</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Consumo actual</p>
                </div>

                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${consumptionDelta <= 0 ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10" : "bg-amber-50 text-amber-600 dark:bg-amber-500/10"}`}>
                        {consumptionDelta <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                    </div>
                    <p className="text-2xl font-black cc-text-primary">{formatPercent(trendPercent)}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">
                        {consumptionDelta <= 0 ? "Menos que mes anterior" : "Más que mes anterior"}
                    </p>
                </div>

                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${isElevated ? "bg-amber-50 text-amber-600 dark:bg-amber-500/10" : "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10"}`}>
                        {isElevated ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <p className="text-2xl font-black cc-text-primary">{isElevated ? "Alto" : "Normal"}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Contra promedio edificio</p>
                </div>

                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-black cc-text-primary">{readings.length}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Lecturas registradas</p>
                </div>
            </section>

            {possibleLeak && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 dark:border-amber-500/20 dark:bg-amber-500/10">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex gap-4">
                            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-amber-600" />
                            <div>
                                <h2 className="font-black text-amber-900 dark:text-amber-200">Posible sobreconsumo detectado</h2>
                                <p className="text-sm text-amber-800/80 dark:text-amber-100/80">
                                    El consumo subió más de 35% respecto al mes anterior. Conviene revisar llaves, estanques y filtraciones visibles.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => openLeakReport(user?.unitName)}
                            className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-amber-700"
                        >
                            Pedir revisión
                        </button>
                    </div>
                </section>
            )}

            {!user?.unitId && (
                <section className="rounded-2xl border border-blue-100 bg-blue-50 p-5 dark:border-blue-500/20 dark:bg-blue-500/10">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="font-black text-blue-900 dark:text-blue-200">Vista demo con datos inteligentes</h2>
                            <p className="text-sm font-medium text-blue-800/80 dark:text-blue-100/80">
                                Este usuario no tiene unidad vinculada, asi que mostramos una serie realista para demostrar alertas, tendencia y estimacion.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={() => openLeakReport(user?.unitName)}
                            className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-blue-800"
                        >
                            Crear caso CoCo
                        </button>
                    </div>
                </section>
            )}

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
                <div className="space-y-8 lg:col-span-2">
                    <WaterConsumptionChart data={metrics} />
                    <SavingsGoalCard
                        currentConsumption={currentConsumption}
                        lastMonthConsumption={previousConsumption}
                    />
                </div>

                <aside className="space-y-8">
                    <CostEstimator consumption={currentConsumption} />

                    {lastReading && (
                        <section className="space-y-6 rounded-[2.5rem] border border-subtle bg-surface p-8 shadow-xl shadow-slate-200/20 dark:shadow-none">
                            <div className="flex items-center gap-4">
                                <div className="rounded-2xl bg-blue-50 p-3 text-blue-600 dark:bg-blue-500/10">
                                    <Calculator className="h-6 w-6" />
                                </div>
                                <h2 className="text-xl font-black cc-text-primary">Lectura del mes</h2>
                            </div>

                            <div className="flex items-end justify-between border-b border-subtle pb-4">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Actual</p>
                                    <p className="text-sm font-bold cc-text-secondary">{lastReading.reading_value.toFixed(1)}</p>
                                </div>
                                <ArrowRight className="mb-1 h-4 w-4 text-slate-300" />
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Anterior</p>
                                    <p className="text-sm font-bold cc-text-secondary">{previousReading?.reading_value.toFixed(1) || "0.0"}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-2xl bg-elevated/50 px-4 py-4">
                                <span className="text-xs font-black uppercase tracking-widest text-slate-400">Consumo neto</span>
                                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{currentConsumption.toFixed(1)} m³</span>
                            </div>
                        </section>
                    )}

                    <section className="space-y-6 px-2">
                        <div className="flex items-center gap-4">
                            <History className="h-5 w-5 text-slate-400" />
                            <h2 className="text-xs font-black uppercase tracking-widest cc-text-primary">Historial reciente</h2>
                        </div>

                        <div className="space-y-3">
                            {recentReadings.map(reading => (
                                <div key={reading.id} className="flex items-center justify-between rounded-2xl border border-subtle bg-surface p-4 transition-all hover:border-blue-100 dark:hover:border-blue-900/50">
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated text-xs font-bold text-slate-400">
                                            {shortMonth(reading.month)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black cc-text-primary">{reading.month} {reading.year}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Lectura {reading.reading_value}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-blue-600 dark:text-blue-400">{reading.consumption} m³</p>
                                </div>
                            ))}
                            {readings.length === 0 && (
                                <p className="pl-2 text-xs text-slate-400">No hay historial disponible.</p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
