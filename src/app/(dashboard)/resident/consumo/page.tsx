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
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

const BUILDING_AVERAGE_M3 = 15.5;

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
                const data = user?.unitId ? await WaterService.getReadingsByUnit(user.unitId) : [];
                const sortedData = [...data].sort((a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime());
                const enrichedData = sortedData.map(reading => ({
                    ...reading,
                    consumption: calculateConsumption(reading, sortedData),
                }));

                setReadings(enrichedData);
            } catch (error: unknown) {
                console.error("Error fetching water data:", error);
                setReadings([]);
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
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--cc-copper)" }} />
            </div>
        );
    }

    if (readings.length === 0) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-4 px-4 text-center">
                <Waves className="h-12 w-12" style={{ color: "var(--cc-ink-faint)" }} />
                <h2 className="text-xl font-bold cc-text-secondary">{user?.unitId ? "Sin lecturas cargadas" : "Sin unidad asignada"}</h2>
                <p className="max-w-md cc-text-tertiary">
                    {user?.unitId
                        ? "Aun no existen lecturas reales para tu unidad. Cuando administracion cargue el periodo, veras tendencia, alertas y estimacion de costo."
                        : "Contacta a la administracion para vincular tu usuario a un departamento."}
                </p>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:py-10 md:px-8">
            <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <Eyebrow>Eficiencia hídrica</Eyebrow>
                    <DisplayHeading size={32}>Consumo de agua</DisplayHeading>
                    <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                        Controla lecturas, gasto estimado y señales tempranas de sobreconsumo.
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() => openLeakReport(user?.unitName)}
                    className="inline-flex items-center justify-center gap-3 rounded-full border px-6 py-4 text-sm font-semibold cc-text-primary transition-all hover:bg-[var(--cc-paper-warm)]"
                    style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                >
                    <Waves className="h-5 w-5" style={{ color: "var(--cc-copper)" }} />
                    Reportar fuga con CoCo
                </button>
            </header>

            <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                        <Waves className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{currentConsumption.toFixed(1)} m³</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Consumo actual</p>
                </div>

                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={consumptionDelta <= 0 ? { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" } : { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" }}>
                        {consumptionDelta <= 0 ? <TrendingDown className="h-5 w-5" /> : <TrendingUp className="h-5 w-5" />}
                    </div>
                    <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{formatPercent(trendPercent)}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">
                        {consumptionDelta <= 0 ? "Menos que mes anterior" : "Más que mes anterior"}
                    </p>
                </div>

                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={isElevated ? { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" } : { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                        {isElevated ? <AlertTriangle className="h-5 w-5" /> : <CheckCircle2 className="h-5 w-5" />}
                    </div>
                    <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{isElevated ? "Alto" : "Normal"}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Contra promedio edificio</p>
                </div>

                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full" style={{ background: "var(--cc-paper-warm)", color: "var(--cc-ink)" }}>
                        <Calculator className="h-5 w-5" />
                    </div>
                    <p className="text-2xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{readings.length}</p>
                    <p className="text-xs font-bold uppercase tracking-wide cc-text-secondary">Lecturas registradas</p>
                </div>
            </section>

            {possibleLeak && (
                <section className="rounded-2xl border border-warning-border bg-warning-bg p-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex gap-4">
                            <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-warning-fg" />
                            <div>
                                <h2 className="font-semibold text-warning-fg">Posible sobreconsumo detectado</h2>
                                <p className="text-sm text-warning-fg opacity-80">
                                    El consumo subió más de 35% respecto al mes anterior. Conviene revisar llaves, estanques y filtraciones visibles.
                                </p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => openLeakReport(user?.unitName)}
                            className="rounded-full px-4 py-2.5 text-sm font-semibold text-white transition-colors"
                            style={{ background: "var(--cc-amber)" }}
                        >
                            Pedir revisión
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
                        <section className="space-y-6 rounded-2xl border p-8" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                            <div className="flex items-center gap-4">
                                <div className="rounded-full p-3" style={{ background: "var(--cc-copper-tint)", color: "var(--cc-copper)" }}>
                                    <Calculator className="h-6 w-6" />
                                </div>
                                <h2 className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Lectura del mes</h2>
                            </div>

                            <div className="flex items-end justify-between border-b pb-4" style={{ borderColor: "var(--cc-line)" }}>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-tertiary">Actual</p>
                                    <p className="text-sm font-bold cc-text-secondary">{lastReading.reading_value.toFixed(1)}</p>
                                </div>
                                <ArrowRight className="mb-1 h-4 w-4" style={{ color: "var(--cc-ink-faint)" }} />
                                <div className="space-y-1 text-right">
                                    <p className="text-[10px] font-semibold uppercase tracking-[0.08em] cc-text-tertiary">Anterior</p>
                                    <p className="text-sm font-bold cc-text-secondary">{previousReading?.reading_value.toFixed(1) || "0.0"}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between rounded-xl px-4 py-4" style={{ background: "var(--cc-paper-warm)" }}>
                                <span className="text-xs font-semibold uppercase tracking-[0.08em] cc-text-tertiary">Consumo neto</span>
                                <span className="text-2xl font-semibold" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-copper)" }}>{currentConsumption.toFixed(1)} m³</span>
                            </div>
                        </section>
                    )}

                    <section className="space-y-6 px-2">
                        <div className="flex items-center gap-4">
                            <History className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] cc-text-primary">Historial reciente</h2>
                        </div>

                        <div className="space-y-3">
                            {recentReadings.map(reading => (
                                <div key={reading.id} className="flex items-center justify-between rounded-xl border p-4 transition-all hover:border-[var(--cc-copper)]" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                    <div className="flex items-center gap-4">
                                        <div className="flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold cc-text-tertiary" style={{ background: "var(--cc-paper-warm)" }}>
                                            {shortMonth(reading.month)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold cc-text-primary">{reading.month} {reading.year}</p>
                                            <p className="text-[10px] font-bold uppercase tracking-[0.08em] cc-text-tertiary">Lectura {reading.reading_value}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-semibold" style={{ color: "var(--cc-copper)" }}>{reading.consumption} m³</p>
                                </div>
                            ))}
                            {readings.length === 0 && (
                                <p className="pl-2 text-xs cc-text-tertiary">No hay historial disponible.</p>
                            )}
                        </div>
                    </section>
                </aside>
            </div>
        </div>
    );
}
