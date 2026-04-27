"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Plus, Calculator, Save, Search,
    Home, Hash, ArrowRight, CheckCircle2,
    AlertTriangle, Filter, Download
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { WaterService } from "@/lib/api";
import { WaterReading, Unit } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { Loader2 } from "lucide-react";

interface AdminMeterEntryProps {
    onUnitSelect?: (unit: Unit) => void;
}

export function AdminMeterEntry({ onUnitSelect = () => { } }: AdminMeterEntryProps) {
    const [units, setUnits] = useState<Unit[]>([]);
    const [lastReadings, setLastReadings] = useState<Record<string, WaterReading>>({});
    const [searchTerm, setSearchTerm] = useState("");
    const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed' | 'alert'>('all');
    const [readings, setReadings] = useState<Record<string, number>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { toast } = useToast();

    const currentMonth = "Febrero"; // En un app real, esto sería dinámico
    const currentYear = 2026;

    useEffect(() => {
        async function loadData() {
            try {
                const fetchedUnits = await WaterService.getUnits();
                setUnits(fetchedUnits);

                // Cargar lecturas del mes actual para ver el estado (completado/pendiente)
                // y lecturas del mes anterior para el cálculo de consumo
                // Por ahora, traemos todo lo reciente de water_readings de forma simple
                const readingsPromises = fetchedUnits.map((u: Unit) => WaterService.getReadingsByUnit(u.id));
                const allResults = await Promise.all(readingsPromises);

                const readingsMap: Record<string, WaterReading> = {};
                allResults.forEach((unitReadings: WaterReading[], idx: number) => {
                    if (unitReadings.length > 0) {
                        // Guardar la última lectura conocida (que no sea del mes actual si queremos calcular consumo)
                        // O simplemente la última lectura para mostrar en la columna "Anterior"
                        readingsMap[fetchedUnits[idx].id] = unitReadings[unitReadings.length - 1];
                    }
                });
                setLastReadings(readingsMap);
            } catch (error) {
                console.error("Error loading admin meter data:", error);
            } finally {
                setIsLoading(false);
            }
        }
        loadData();
    }, []);

    const filteredUnits = units.filter((unit: Unit) => {
        const matchesSearch = unit.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            unit.tower.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        // Comprobar si ya tiene lectura guardada en ESTE mes (simulado con currentMonth/Year)
        const lastReading = lastReadings[unit.id];
        const isAlreadyRead = lastReading?.month === currentMonth && lastReading?.year === currentYear;
        const hasLocalEntry = readings[unit.id] !== undefined;

        const hasReading = isAlreadyRead || hasLocalEntry;

        // Mock consumption check para alertas
        const prevValue = isAlreadyRead ? (/* lectura anterior real */ 0) : (lastReading?.reading_value || 0);
        const currentVal = readings[unit.id] || (isAlreadyRead ? lastReading?.reading_value : 0);
        const consumption = Math.max(0, (currentVal || 0) - (prevValue || 0));
        const isHigh = consumption > 25;

        if (filterStatus === 'pending') return !hasReading;
        if (filterStatus === 'completed') return hasReading;
        if (filterStatus === 'alert') return isHigh;

        return true;
    });

    const handleSave = async () => {
        setIsSaving(true);
        try {
            const savePromises = Object.entries(readings).map(([unitId, value]: [string, number]) => {
                return WaterService.saveReading({
                    unit_id: unitId,
                    reading_value: value,
                    month: currentMonth,
                    year: currentYear,
                    reading_date: new Date().toISOString().split('T')[0]
                });
            });

            await Promise.all(savePromises);

            toast({
                title: "Lecturas Guardadas",
                description: `Se han registrado exitosamente ${savePromises.length} lecturas.`,
                variant: "success"
            });

            // Limpiar entradas locales y refrescar (o actualizar estado local)
            setReadings({});
            // Podríamos volver a cargar datos aquí
        } catch (error: unknown) {
            toast({
                title: "Error al guardar",
                description: error instanceof Error ? error.message : "Error desconocido",
                variant: "destructive"
            });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-12">
            {/* Header / Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-4 h-14">
                        <div className="relative h-full">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
                            <Input
                                className="h-full pl-12 pr-6 w-80 rounded-2xl bg-surface border-subtle font-bold"
                                placeholder="Buscar unidad (Piso, depto)..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>
                    {/* Filters */}
                    <div className="flex items-center gap-2">
                        {(['all', 'pending', 'completed', 'alert'] as const).map((status: 'all' | 'pending' | 'completed' | 'alert') => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${filterStatus === status
                                    ? 'bg-canvas text-white border-slate-900 dark:bg-white dark:text-canvas'
                                    : 'bg-white text-slate-500 border-default hover:border-default bg-surface cc-text-tertiary'
                                    }`}
                            >
                                {status === 'all' && 'Todos'}
                                {status === 'pending' && 'Pendientes'}
                                {status === 'completed' && 'Listos'}
                                {status === 'alert' && 'Alertas'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <button className="flex items-center gap-3 px-8 py-4 bg-surface cc-text-primary font-black rounded-2xl border border-subtle hover:bg-slate-50 transition-all shadow-sm">
                        <Download className="h-5 w-5" />
                        Formato Excel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={Object.keys(readings).length === 0 || isSaving}
                        className="flex items-center gap-3 px-8 py-4 bg-blue-600 text-white font-black rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
                    >
                        {isSaving ? <Calculator className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                        Procesar Lecturas
                    </button>
                </div>
            </div>

            {/* Entry Table */}
            <div className="bg-surface rounded-[3rem] border border-subtle overflow-hidden shadow-xl shadow-slate-200/20 dark:shadow-none">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-subtle">
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Unidad</th>
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Anterior (m³)</th>
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest">Nueva Lectura</th>
                                <th className="px-10 py-8 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Consumo</th>
                                <th className="px-10 py-8 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {filteredUnits.map((unit: Unit) => {
                                // Find last reading for this unit
                                const lastReading = lastReadings[unit.id];
                                const lastValue = lastReading?.reading_value || 0;
                                const currentEntry = readings[unit.id];
                                const consumption = currentEntry ? Math.max(0, currentEntry - lastValue) : (lastReading?.consumption || 0);

                                return (
                                    <tr
                                        key={unit.id}
                                        onClick={() => onUnitSelect(unit)}
                                        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group cursor-pointer"
                                    >
                                        <td className="px-10 py-8">
                                            <div className="flex items-center gap-4">
                                                <div className="h-12 w-12 rounded-2xl bg-elevated flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors font-black text-xs">
                                                    {unit.number}
                                                </div>
                                                <div>
                                                    <p className="font-black cc-text-primary leading-none mb-1">Unidad {unit.number}</p>
                                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Torre {unit.tower}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-10 py-8 text-right font-bold text-slate-400 text-sm">
                                            {lastValue.toFixed(1)}
                                        </td>
                                        <td className="px-10 py-8">
                                            <Input
                                                type="number"
                                                className="w-32 h-14 rounded-xl border-subtle font-bold focus:ring-blue-500/20 focus:border-blue-500 text-center"
                                                placeholder="0.0"
                                                value={readings[unit.id] || ""}
                                                onChange={(e) => setReadings({ ...readings, [unit.id]: parseFloat(e.target.value) })}
                                            />
                                        </td>
                                        <td className={`px-10 py-8 text-right font-black text-lg ${consumption > 25 ? 'text-red-500' :
                                            consumption > 0 ? 'text-blue-600 dark:text-blue-400' :
                                                'text-slate-300'
                                            }`}>
                                            {consumption.toFixed(1)} m³
                                        </td>
                                        <td className="px-10 py-8 text-right">
                                            {consumption > 0 || (lastReading?.month === currentMonth) ? (
                                                <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider ${consumption > 25 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'
                                                    }`}>
                                                    {consumption > 25 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                                    {consumption > 25 ? "Alto Consumo" : "Normal"}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Pendiente</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredUnits.length === 0 && (
                    <div className="p-20 text-center">
                        <p className="text-slate-400 font-bold">No se encontraron unidades para la búsqueda.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
