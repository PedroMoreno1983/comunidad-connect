import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { WaterService } from "@/lib/api";
import { Unit, WaterReading } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";

interface UnitStatusGridProps {
    onUnitSelect?: (unit: Unit) => void;
}

export function UnitStatusGrid({ onUnitSelect = () => { } }: UnitStatusGridProps) {
    const [units, setUnits] = useState<Unit[]>([]);
    const [readings, setReadings] = useState<Record<string, WaterReading>>({});
    const [loading, setLoading] = useState(true);

    const currentPeriod = getCurrentWaterPeriod();
    const currentMonth = currentPeriod.month;
    const currentYear = currentPeriod.year;

    useEffect(() => {
        async function loadData() {
            try {
                const fetchedUnits = await WaterService.getUnits();
                setUnits(fetchedUnits);

                const readingsPromises = fetchedUnits.map((u: Unit) => WaterService.getReadingsByUnit(u.id));
                const allResults = await Promise.all(readingsPromises);

                const readingsMap: Record<string, WaterReading> = {};
                allResults.forEach((unitReadings: WaterReading[], idx: number) => {
                    const sortedReadings = [...unitReadings].sort(
                        (a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
                    );
                    const currentIndex = sortedReadings.findIndex(r => r.month === currentMonth && r.year === currentYear);
                    const currentReading = currentIndex >= 0 ? sortedReadings[currentIndex] : undefined;
                    const previousReading = currentIndex > 0 ? sortedReadings[currentIndex - 1] : undefined;

                    if (currentReading) {
                        readingsMap[fetchedUnits[idx].id] = {
                            ...currentReading,
                            consumption: previousReading
                                ? Math.max(0, currentReading.reading_value - previousReading.reading_value)
                                : currentReading.consumption,
                        };
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
    }, [currentMonth, currentYear]);

    if (loading) {
        return (
            <div className="flex justify-center p-20">
                <Loader2 className="h-8 w-8 animate-spin" style={{ color: "var(--cc-copper)" }} />
            </div>
        );
    }

    const totalUnits = units.length;
    const readUnits = Object.keys(readings).length;
    const progress = totalUnits > 0 ? Math.round((readUnits / totalUnits) * 100) : 0;

    return (
        <div className="rounded-2xl border p-6 space-y-8 sm:p-10 sm:space-y-10" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
            {/* Header / Stats */}
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
                <div className="space-y-2">
                    <h3 className="text-xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Mapa de lecturas de la comunidad</h3>
                    <p className="text-sm cc-text-secondary">Visualización de cobertura del edificio por unidad habitacional.</p>
                </div>

                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-start sm:items-end">
                        <span className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Progreso global</span>
                        <span className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-copper)" }}>{progress}%</span>
                    </div>
                </div>
            </div>

            {/* Grid Map */}
            <div className="grid grid-cols-5 gap-2.5 sm:grid-cols-8 sm:gap-3 md:grid-cols-10 lg:grid-cols-[repeat(15,minmax(0,1fr))]">
                {units.map((unit: Unit) => {
                    const reading = readings[unit.id];
                    const isRead = !!reading;
                    const currentConsumption = reading?.consumption;
                    const isHigh = typeof currentConsumption === "number" && currentConsumption > 25;
                    const cellStyle = isHigh
                        ? { background: "var(--cc-amber-tint)", borderColor: "rgba(201,154,74,0.30)" }
                        : isRead
                            ? { background: "var(--cc-sage-tint)", borderColor: "rgba(110,130,104,0.30)" }
                            : { background: "var(--cc-paper-warm)", borderColor: "var(--cc-line)" };
                    const labelColor = isHigh ? "var(--cc-amber)" : isRead ? "var(--cc-sage)" : "var(--cc-ink-faint)";

                    return (
                        <motion.div
                            key={unit.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            whileHover={{ scale: 1.1, zIndex: 10 }}
                            onClick={() => onUnitSelect(unit)}
                            className="group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-xl border transition-all"
                            style={cellStyle}
                        >
                            <span className="text-[9px] font-medium" style={{ color: labelColor }}>
                                {unit.number}
                            </span>

                            {/* Tooltip-like detail on hover */}
                            <div
                                className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-3 min-w-32 -translate-x-1/2 rounded-xl px-4 py-3 opacity-0 shadow-lg transition-opacity group-hover:opacity-100"
                                style={{ background: "var(--cc-ink)" }}
                            >
                                <p className="mb-1 text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--cc-ink-faint)" }}>Unidad {unit.number}</p>
                                <p className="truncate text-sm font-medium" style={{ color: "var(--cc-paper)" }}>
                                    {isRead
                                        ? typeof currentConsumption === "number"
                                            ? `${currentConsumption.toFixed(1)} m³ consumidos`
                                            : `${reading.reading_value} m³ registrados`
                                        : 'Pendiente de lectura'}
                                </p>
                                <div className="absolute left-1/2 top-full -translate-x-1/2 border-[6px] border-transparent" style={{ borderTopColor: "var(--cc-ink)" }} />
                            </div>
                        </motion.div>
                    );
                })}
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center gap-6 pt-6 sm:gap-8" style={{ borderTop: "1px solid var(--cc-line)" }}>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md border" style={{ background: "var(--cc-sage-tint)", borderColor: "rgba(110,130,104,0.30)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Leído</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md border" style={{ background: "var(--cc-amber-tint)", borderColor: "rgba(201,154,74,0.30)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Alerta de consumo</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="h-3 w-3 rounded-md border" style={{ background: "var(--cc-paper-warm)", borderColor: "var(--cc-line)" }} />
                    <span className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Pendiente</span>
                </div>
            </div>
        </div>
    );
}
