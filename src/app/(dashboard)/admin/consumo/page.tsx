"use client";

import { AdminMeterEntry } from "@/components/admin/AdminMeterEntry";
import { UnitStatusGrid } from "@/components/admin/UnitStatusGrid";
import {
    Waves, BarChart3, TrendingUp, AlertCircle,
    Download, Printer, Filter, Settings,
    PieChart, Activity
} from "lucide-react";
import { motion } from "framer-motion";
import { useState } from "react";
import { UnitDetailPanel } from "@/components/admin/UnitDetailPanel";
import { Unit } from "@/lib/types";
import { WaterService } from "@/lib/api";

export default function AdminConsumoPage() {
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

    const handleSaveReading = async (unitId: string, value: number) => {
        try {
            await WaterService.saveReading({
                unit_id: unitId,
                reading_value: value,
                month: "Febrero",
                year: 2026,
                reading_date: new Date().toISOString().split('T')[0]
            });
        } catch (error) {
            console.error("Error saving reading from panel:", error);
            throw error; // Re-throw to be handled by the panel's toast
        }
    };

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Operaciones & Suministros</h2>
                    <h1 className="text-4xl font-black cc-text-primary">Control Hídrico</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button className="flex items-center gap-3 px-8 py-4 bg-surface cc-text-primary font-black rounded-2xl border border-subtle hover:bg-slate-50 transition-all shadow-xl active:scale-95">
                        <Printer className="h-5 w-5 text-slate-400" />
                        Imprimir Planillas
                    </button>
                    <button className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                        <Filter className="h-5 w-5" />
                        Ver Reportes
                    </button>
                </div>
            </div>

            {/* Performance KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                            <Waves className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest">Consumo Total Mes</h3>
                    </div>
                    <p className="text-4xl font-black cc-text-primary mb-1">1.240 m³</p>
                    <p className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                        <TrendingUp className="h-3 w-3 rotate-180" />
                        -4% vs mes anterior
                    </p>
                </div>

                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-warning-bg rounded-2xl">
                            <AlertCircle className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest">Alertas de Fuga</h3>
                    </div>
                    <p className="text-4xl font-black cc-text-primary mb-1">3</p>
                    <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Unidades con sobreconsumo</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <BarChart3 className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div className="mb-6">
                            <h3 className="font-black text-white">Eficiencia Comercial</h3>
                            <p className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Lectura vs Matriz</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-sm font-bold text-slate-300">Diferencial de 0.8% (Óptimo)</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Meter Reading Map (Differentiated Admin View) */}
            <div className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                    <div className="p-3 bg-blue-100 dark:bg-blue-500/10 rounded-2xl">
                        <Activity className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-2xl font-black cc-text-primary">Estado de Lecturas Comunidad</h2>
                </div>
                <UnitStatusGrid onUnitSelect={setSelectedUnit} />
            </div>

            {/* Entry System */}
            <div className="space-y-8">
                <div className="flex items-center gap-4 px-2">
                    <div className="p-3 bg-elevated rounded-2xl">
                        <Settings className="h-6 w-6 cc-text-primary" />
                    </div>
                    <h2 className="text-2xl font-black cc-text-primary">Ingreso de Lecturas</h2>
                </div>
                <AdminMeterEntry onUnitSelect={setSelectedUnit} />
            </div>

            <UnitDetailPanel
                unit={selectedUnit}
                isOpen={!!selectedUnit}
                onClose={() => setSelectedUnit(null)}
                onSaveReading={handleSaveReading}
            />
        </div>
    );
}
