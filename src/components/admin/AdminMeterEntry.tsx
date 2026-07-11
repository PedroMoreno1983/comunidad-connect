"use client";

import { useState, useEffect } from "react";
import {
    Calculator, Save, Search,
    CheckCircle2, AlertTriangle, Download
} from "lucide-react";
import { Input } from "@/components/ui/Input";
import { WaterService } from "@/lib/api";
import { WaterReading, Unit } from "@/lib/types";
import { useToast } from "@/components/ui/Toast";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";

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
    const { toast } = useToast();

    const currentPeriod = getCurrentWaterPeriod();
    const currentMonth = currentPeriod.month;
    const currentYear = currentPeriod.year;

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
            }
        }
        loadData();
    }, []);

    const filteredUnits = units.filter((unit: Unit) => {
        const matchesSearch = unit.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            unit.tower.toLowerCase().includes(searchTerm.toLowerCase());

        if (!matchesSearch) return false;

        // Comprobar si ya tiene lectura guardada en este mes.
        const lastReading = lastReadings[unit.id];
        const isAlreadyRead = lastReading?.month === currentMonth && lastReading?.year === currentYear;
        const hasLocalEntry = readings[unit.id] !== undefined;

        const hasReading = isAlreadyRead || hasLocalEntry;

        // Calculo local de consumo para alertas operativas.
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
        <div className="space-y-8 sm:space-y-10">
            {/* Header / Actions */}
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-4">
                    <div className="relative h-12">
                        <Search className="absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2" style={{ color: "var(--cc-ink-tertiary)" }} />
                        <Input
                            className="h-full w-full rounded-xl pl-11 pr-5 sm:w-80"
                            style={{ background: "var(--cc-paper-warm)", borderColor: "var(--cc-line)" }}
                            placeholder="Buscar unidad (piso, depto)..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    {/* Filters */}
                    <div className="flex flex-wrap items-center gap-2">
                        {(['all', 'pending', 'completed', 'alert'] as const).map((status: 'all' | 'pending' | 'completed' | 'alert') => (
                            <button
                                key={status}
                                onClick={() => setFilterStatus(status)}
                                className="rounded-full px-3.5 py-2 text-xs font-medium uppercase tracking-wider transition-all"
                                style={
                                    filterStatus === status
                                        ? { background: "var(--cc-ink)", color: "var(--cc-paper)" }
                                        : { background: "var(--cc-paper-warm)", color: "var(--cc-ink-muted)" }
                                }
                            >
                                {status === 'all' && 'Todos'}
                                {status === 'pending' && 'Pendientes'}
                                {status === 'completed' && 'Listos'}
                                {status === 'alert' && 'Alertas'}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        className="flex items-center gap-2.5 rounded-xl border px-5 py-3 text-sm font-medium cc-text-primary transition-all hover:bg-[var(--cc-paper-warm)]"
                        style={{ borderColor: "var(--cc-line-strong)" }}
                    >
                        <Download className="h-4.5 w-4.5" />
                        Formato Excel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={Object.keys(readings).length === 0 || isSaving}
                        className="flex items-center gap-2.5 rounded-xl px-5 py-3 text-sm font-medium text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                        style={{ background: "var(--cc-copper)" }}
                    >
                        {isSaving ? <Calculator className="h-4.5 w-4.5 animate-spin" /> : <Save className="h-4.5 w-4.5" />}
                        Procesar lecturas
                    </button>
                </div>
            </div>

            {/* Entry Table */}
            <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr style={{ borderBottom: "1px solid var(--cc-line)" }}>
                                <th className="px-6 py-5 text-left text-[10px] font-medium uppercase tracking-widest cc-text-tertiary sm:px-8">Unidad</th>
                                <th className="px-6 py-5 text-right text-[10px] font-medium uppercase tracking-widest cc-text-tertiary sm:px-8">Anterior (m³)</th>
                                <th className="px-6 py-5 text-left text-[10px] font-medium uppercase tracking-widest cc-text-tertiary sm:px-8">Nueva lectura</th>
                                <th className="px-6 py-5 text-right text-[10px] font-medium uppercase tracking-widest cc-text-tertiary sm:px-8">Consumo</th>
                                <th className="px-6 py-5 text-right text-[10px] font-medium uppercase tracking-widest cc-text-tertiary sm:px-8">Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredUnits.map((unit: Unit) => {
                                // Find last reading for this unit
                                const lastReading = lastReadings[unit.id];
                                const lastValue = lastReading?.reading_value || 0;
                                const currentEntry = readings[unit.id];
                                const consumption = currentEntry ? Math.max(0, currentEntry - lastValue) : (lastReading?.consumption || 0);
                                const isHigh = consumption > 25;

                                return (
                                    <tr
                                        key={unit.id}
                                        onClick={() => onUnitSelect(unit)}
                                        className="group cursor-pointer transition-colors hover:bg-[var(--cc-paper-warm)]"
                                        style={{ borderTop: "1px solid var(--cc-line)" }}
                                    >
                                        <td className="px-6 py-6 sm:px-8">
                                            <div className="flex items-center gap-3.5">
                                                <div
                                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xs font-medium"
                                                    style={{ background: "var(--cc-paper-warm)", color: "var(--cc-ink-tertiary)" }}
                                                >
                                                    {unit.number}
                                                </div>
                                                <div>
                                                    <p className="mb-1 font-medium leading-none cc-text-primary">Unidad {unit.number}</p>
                                                    <p className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Torre {unit.tower}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-6 text-right text-sm font-medium cc-text-tertiary sm:px-8">
                                            {lastValue.toFixed(1)}
                                        </td>
                                        <td className="px-6 py-6 sm:px-8">
                                            <Input
                                                type="number"
                                                className="h-12 w-28 rounded-xl text-center font-medium focus:border-[var(--cc-copper)]"
                                                style={{ borderColor: "var(--cc-line)" }}
                                                placeholder="0.0"
                                                value={readings[unit.id] || ""}
                                                onChange={(e) => setReadings({ ...readings, [unit.id]: parseFloat(e.target.value) })}
                                            />
                                        </td>
                                        <td
                                            className="px-6 py-6 text-right text-lg font-medium sm:px-8"
                                            style={{ color: isHigh ? "var(--cc-rose)" : consumption > 0 ? "var(--cc-copper)" : "var(--cc-ink-faint)" }}
                                        >
                                            {consumption.toFixed(1)} m³
                                        </td>
                                        <td className="px-6 py-6 text-right sm:px-8">
                                            {consumption > 0 || (lastReading?.month === currentMonth) ? (
                                                <div
                                                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-medium uppercase tracking-wider"
                                                    style={isHigh ? { background: "var(--cc-rose-tint)", color: "var(--cc-rose)" } : { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}
                                                >
                                                    {isHigh ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                                                    {isHigh ? "Alto consumo" : "Normal"}
                                                </div>
                                            ) : (
                                                <span className="text-[10px] font-medium uppercase tracking-widest cc-text-disabled">Pendiente</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {filteredUnits.length === 0 && (
                    <div className="p-16 text-center sm:p-20">
                        <p className="font-medium cc-text-tertiary">No se encontraron unidades para la búsqueda.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
