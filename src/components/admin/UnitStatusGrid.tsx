import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { WaterService } from "@/lib/api";
import { Unit, WaterReading } from "@/lib/types";
import { Waves, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

interface UnitStatusGridProps {
    onUnitSelect?: (unit: Unit) => void;
}

export function UnitStatusGrid({ onUnitSelect = () => { } }: UnitStatusGridProps) {
    const [units, setUnits] = useState<Unit[]>([]);
    const [readings, setReadings] = useState<Record<string, WaterReading>>({});
    const [loading, setLoading] = useState(true);

    const currentMonth = "Febrero";
    const currentYear = 2026;

    useEffect(() => {
        async function loadData() {
            try {
                const fetchedUnits = await WaterService.getUnits();
                setUnits(fetchedUnits);

                const readingsPromises = fetchedUnits.map((u: Unit) => WaterService.getReadingsByUnit(u.id));
                const allResults = await Promise.all(readingsPromises);

                const readingsMap: Record<string, WaterReading> = {};
                allResults.forEach((unitReadings: WaterReading[], idx: number) => {
                    const currentReading = unitReadings.find(r => r.month === currentMonth && r.year === currentYear);
                    if (currentReading) {
                        readingsMap[fetchedUnits[idx].id] = currentReading;
                    }
                });
                setReadings(readingsMap);
            } catch (error) {
                console.error("Error loading building status map:", error);
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
            </div>
        );
    }

    const totalUnits = units.length;
    const readUnits = Object.keys(readings).length;
    const progress = totalUnits > 0 ? Math.round((readUnits / totalUnits) * 100) : 0;

    return (
        <div className="bg-surface p-10 rounded-[3rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none space-y-10">
            {/* Header / Stats */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-8">
                <div className="space-y-2">
                    <h3 className="text-xl font-black cc-text-primary">Mapa de Lecturas de la Comunidad</h3>
                    <p className="text-sm font-medium text-slate-500">Visualización de cobertura del edificio por unidad habitacional.</p>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progreso Global</span>
                        <span className="text-2xl font-black text-blue-600">{progress}%</span>
                    </div>
                </div>
            </div>

            {/* Grid Map */}
            <div className="grid grid-cols-5 sm:grid-cols-10 md:grid-cols-12 lg:grid-cols-15 gap-3">
                {units.map((unit: Unit) => {
                    const reading = readings[unit.id];
                    const isRead = !!reading;
                    // Simplificación: consumo > 25 es alerta (esto vendría de la API en el futuro)
                    const isHigh = reading && reading.reading_value > 25;

                    return (
                        <motion.div
                            key={unit.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.1, zIndex: 10 }}
                            onClick={() => onUnitSelect(unit)}
                            className={`aspect-square rounded-xl border flex flex-col items-center justify-center cursor-pointer transition-all group relative ${isHigh
                                ? 'bg-amber-100 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20'
                                : isRead
                                    ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-500/10 dark:border-emerald-500/20'
                                    : 'bg-slate-50 border-slate-100 dark:bg-slate-800 dark:border-slate-700'
                                }`}
                        >
                            <span className={`text-[9px] font-black ${isHigh ? 'text-warning-fg' :
                                isRead ? 'text-success-fg' : 'text-slate-400'
                                }`}>
                                {unit.number}
                            </span>

                            {/* Tooltip-like detail on hover */}
                            <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white rounded-xl py-3 px-4 shadow-2xl z-50 min-w-32">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Unidad {unit.number}</p>
                                <p className="text-sm font-bold truncate">
                                    {isRead ? `${reading.reading_value} m³ registrados` : 'Pendiente de lectura'}
                                </p>
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[6px] border-transparent border-t-slate-900" />
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-8 pt-6 border-t border-slate-50 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md bg-emerald-50 dark:bg-emerald-500/20 border border-emerald-100 dark:border-emerald-500/30" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Leído</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md bg-warning-bg border border-amber-200 dark:border-amber-500/30" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Alerta de Consumo</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md bg-elevated border border-subtle" />
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Pendiente</span>
                </div>
            </div>
        </div>
    );
}
