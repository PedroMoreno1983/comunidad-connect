"use client";

import { useEffect, useState } from "react";
import { WaterConsumptionChart } from "@/components/resident/WaterConsumptionChart";
import { CostEstimator } from "@/components/resident/CostEstimator";
import { SavingsGoalCard } from "@/components/resident/SavingsGoalCard";
import { WaterService } from "@/lib/api";
import { useAuth } from "@/lib/authContext";
import { WaterReading, ConsumptionMetric } from "@/lib/types";
import { History, Waves, Calculator, ArrowRight, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { MOCK_WATER_READINGS, MOCK_WATER_METRICS } from "@/lib/mockData";

// Helper to calculate consumption (current - previous)
function calculateConsumption(current: WaterReading, allReadings: WaterReading[]) {
    // In real app, make sure list is sorted by date before finding index
    // Assuming API returns sorted by reading_date ASC
    const index = allReadings.findIndex(r => r.id === current.id);
    if (index > 0) {
        const prev = allReadings[index - 1];
        return Number((current.reading_value - prev.reading_value).toFixed(2));
    }
    return 0;
}

export default function WaterConsumptionPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [readings, setReadings] = useState<WaterReading[]>([]);
    const [loading, setLoading] = useState(true);
    const [metrics, setMetrics] = useState<ConsumptionMetric[]>([]);

    useEffect(() => {
        async function loadData() {
            if (!user?.unitId) {
                console.log("No Unit ID found for resident:", user?.name);
                setLoading(false);
                return;
            }

            try {
                console.log("Fetching readings for unit:", user.unitId);
                const data = await WaterService.getReadingsByUnit(user.unitId);

                // Enrich data with computed consumption
                const enrichedData = data.map(r => ({
                    ...r,
                    consumption: calculateConsumption(r, data)
                }));

                setReadings(enrichedData);

                // Transform to metrics for chart
                const chartData: ConsumptionMetric[] = enrichedData.map(r => ({
                    month: r.month.substring(0, 3),
                    originalMonth: r.month,
                    year: r.year,
                    personal: r.consumption || 0,
                    average: 15.5
                }));
                setMetrics(chartData);
            } catch (error: any) {
                console.warn("Using mock fallback for water data. Reason:", error.message || error);

                // Fallback to mock data
                const mockData = MOCK_WATER_READINGS.filter(r => r.unit_id === user.unitId || user.unitId === '101' || user.unitId === 'u1');

                const enrichedData = mockData.map(r => ({
                    ...r,
                    consumption: typeof r.consumption === 'number' ? r.consumption : calculateConsumption(r, mockData)
                }));

                setReadings(enrichedData);

                const chartData = enrichedData.map(r => ({
                    month: r.month.substring(0, 3),
                    originalMonth: r.month,
                    year: r.year,
                    personal: r.consumption || 0,
                    average: 15.5
                }));

                setMetrics(chartData.length > 0 ? chartData : MOCK_WATER_METRICS);

                // Solo mostrar Toast si es un error real de red/servidor, no de datos faltantes
                if (error.code !== 'PGRST116' && error.code !== '42P01') {
                    toast({
                        title: "Modo Offline / Demo",
                        description: "Mostrando datos de prueba debido a un error de conexión.",
                        variant: "default"
                    });
                }
            } finally {
                setLoading(false);
            }
        }

        loadData();
    }, [user, toast]);

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    if (!user?.unitId) {
        return (
            <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center px-4">
                <Waves className="h-12 w-12 text-slate-300" />
                <h2 className="text-xl font-bold text-slate-700 dark:text-slate-300">Sin Unidad Asignada</h2>
                <p className="text-slate-500">Contacta a la administración para vincular tu usuario a un departamento.</p>
            </div>
        );
    }

    // Get latest data for cards
    const lastReading = readings[readings.length - 1];
    const prevReading = readings[readings.length - 2];
    const currentConsumption = lastReading?.consumption || 0;

    // Fallback for previous month consumption for comparison
    const prevConsumption = metrics.length > 1 ? metrics[metrics.length - 2].personal : 0;

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Eficiencia Hídrica</h2>
                    <h1 className="text-4xl font-black text-slate-900 dark:text-white">Consumo de Agua</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-md transition-shadow">
                        <Waves className="h-5 w-5 text-blue-500" />
                        <span className="text-sm font-black text-slate-900 dark:text-white">Reportar Fuga</span>
                    </button>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* Left Column: Visual Analytics */}
                <div className="lg:col-span-2 space-y-8">
                    <WaterConsumptionChart data={metrics} />

                    {/* Goal Card */}
                    <SavingsGoalCard
                        currentConsumption={currentConsumption}
                        lastMonthConsumption={prevConsumption}
                    />
                </div>

                {/* Right Column: Costs & History */}
                <div className="space-y-8">

                    {/* Cost Estimator */}
                    <CostEstimator consumption={currentConsumption} />

                    {/* Quick Stats (Last Reading) */}
                    {lastReading && (
                        <div className="bg-white dark:bg-slate-900 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-xl shadow-slate-200/20 dark:shadow-none space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600">
                                    <Calculator className="h-6 w-6" />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 dark:text-white">Lectura del Mes</h3>
                            </div>

                            <div className="flex justify-between items-end pb-4 border-b border-slate-50 dark:border-slate-800">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Lectura Actual</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{lastReading.reading_value.toFixed(1)}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-300 mb-1" />
                                <div className="text-right space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Anterior</p>
                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-300">{prevReading?.reading_value.toFixed(1) || '0.0'}</p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center px-4 py-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl">
                                <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Consumo Neto</span>
                                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{currentConsumption.toFixed(1)} m³</span>
                            </div>
                        </div>
                    )}

                    {/* History List */}
                    <div className="space-y-6 px-2">
                        <div className="flex items-center gap-4">
                            <History className="h-5 w-5 text-slate-400" />
                            <h2 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-widest">Historial Reciente</h2>
                        </div>

                        <div className="space-y-3">
                            {readings.slice(0, 3).reverse().map((reading) => (
                                <div key={reading.id} className="p-4 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl flex items-center justify-between hover:border-blue-100 dark:hover:border-blue-900/50 transition-all group">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-400 text-xs">
                                            {reading.month.substring(0, 3)}
                                        </div>
                                        <div>
                                            <p className="text-sm font-black text-slate-900 dark:text-white">{reading.month} {reading.year}</p>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lectura {reading.reading_value}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-black text-blue-600 dark:text-blue-400">{reading.consumption} m³</p>
                                    </div>
                                </div>
                            ))}
                            {readings.length === 0 && (
                                <p className="text-xs text-slate-400 pl-2">No hay historial disponible</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
