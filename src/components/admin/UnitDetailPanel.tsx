import { motion, AnimatePresence } from "framer-motion";
import {
    X, History as HistoryIcon, User, Phone, Mail,
    Save
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useState, useEffect, useCallback } from "react";
import { Unit, WaterReading, User as Profile } from "@/lib/types";
import { WaterService } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { getCurrentWaterPeriod } from "@/lib/waterPeriod";

interface UnitDetailPanelProps {
    unit: Unit | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveReading: (unitId: string, value: number) => void;
}

export function UnitDetailPanel({ unit, isOpen, onClose, onSaveReading }: UnitDetailPanelProps) {
    const [readingValue, setReadingValue] = useState<string>("");
    const [history, setHistory] = useState<WaterReading[]>([]);
    const [previousReading, setPreviousReading] = useState<WaterReading | null>(null);
    const [resident, setResident] = useState<Profile | null>(null);
    const { toast } = useToast();

    const currentPeriod = getCurrentWaterPeriod();
    const currentMonth = currentPeriod.month;
    const currentYear = currentPeriod.year;

    const loadUnitData = useCallback(async () => {
        if (!unit) return;
        try {
            const unitReadings = await WaterService.getReadingsByUnit(unit.id);
            const sortedReadings = [...unitReadings].sort(
                (a, b) => new Date(a.reading_date).getTime() - new Date(b.reading_date).getTime()
            );
            const readingsWithConsumption = sortedReadings.map((reading, index) => {
                const previous = index > 0 ? sortedReadings[index - 1] : null;
                return {
                    ...reading,
                    consumption: previous
                        ? Math.max(0, reading.reading_value - previous.reading_value)
                        : reading.consumption ?? 0,
                };
            });
            setHistory([...readingsWithConsumption].sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()));

            const currentIndex = sortedReadings.findIndex(r => r.month === currentMonth && r.year === currentYear);
            const current = currentIndex >= 0 ? sortedReadings[currentIndex] : null;
            setPreviousReading(currentIndex > 0 ? sortedReadings[currentIndex - 1] : sortedReadings.at(-1) ?? null);
            if (current) {
                setReadingValue(current.reading_value.toString());
            } else {
                setReadingValue("");
            }

            setResident(await WaterService.getUnitResident(unit));
        } catch (error) {
            console.error("Error loading unit details:", error);
            toast({
                title: "Error al cargar datos",
                description: "No se pudieron cargar los detalles de la unidad.",
                variant: "destructive"
            });
        }
    }, [currentMonth, currentYear, toast, unit]);

    useEffect(() => {
        if (!unit || !isOpen) return;

        const timeout = window.setTimeout(() => {
            loadUnitData();
        }, 0);

        return () => window.clearTimeout(timeout);
    }, [unit, isOpen, loadUnitData]);

    const handleSave = async () => {
        if (unit && readingValue) {
            try {
                await onSaveReading(unit.id, parseFloat(readingValue));
                // Recargar historial después de guardar
                await loadUnitData(); // Ensure data is reloaded after save
                toast({
                    title: "Lectura Guardada",
                    description: `La lectura de ${readingValue} m³ para la unidad ${unit.number} ha sido registrada.`,
                    variant: "success"
                });
                onClose(); // Close panel after successful save
            } catch (error: unknown) {
                toast({
                    title: "Error",
                    description: error instanceof Error ? error.message : "No se pudo guardar la lectura.",
                    variant: "destructive"
                });
            }
        }
    };

    return (
        <AnimatePresence>
            {isOpen && unit && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
                    />

                    {/* Panel */}
                    <motion.div
                        initial={{ x: "100%" }}
                        animate={{ x: 0 }}
                        exit={{ x: "100%" }}
                        transition={{ type: "spring", damping: 25, stiffness: 200 }}
                        className="fixed inset-y-0 right-0 z-50 flex w-full flex-col shadow-xl sm:w-[420px]"
                        style={{ background: "var(--cc-paper)", borderLeft: "1px solid var(--cc-line)" }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between p-6" style={{ borderBottom: "1px solid var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                            <div>
                                <h2 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Unidad {unit.number}</h2>
                                <p className="mt-1.5 text-[11px] font-medium uppercase tracking-widest cc-text-tertiary">Torre {unit.tower} • Piso {unit.floor}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="rounded-full p-2 transition-colors hover:bg-[var(--cc-line)]"
                            >
                                <X className="h-5 w-5" style={{ color: "var(--cc-ink-tertiary)" }} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">

                            {/* Resident Info */}
                            <div className="space-y-3.5">
                                <h3 className="flex items-center gap-2 text-sm font-medium cc-text-primary">
                                    <User className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                    Residente principal
                                </h3>
                                <div className="rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                    <div className="flex items-center gap-4">
                                        <div
                                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                                            style={{ background: "var(--cc-ink)", color: "var(--cc-copper-soft)", fontFamily: "var(--cc-font-display)" }}
                                        >
                                            {resident?.name.charAt(0) || "U"}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="truncate font-medium cc-text-primary">{resident?.name || "Sin residente asignado"}</p>
                                            <p className="truncate text-xs cc-text-tertiary">{resident?.email || "No email"}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <Button variant="outline" className="h-9 flex-1 text-xs">
                                            <Phone className="mr-2 h-3 w-3" />
                                            Llamar
                                        </Button>
                                        <Button variant="outline" className="h-9 flex-1 text-xs">
                                            <Mail className="mr-2 h-3 w-3" />
                                            Email
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Current Reading Action */}
                            <div className="space-y-3.5">
                                <h3 className="flex items-center gap-2 text-sm font-medium cc-text-primary">
                                    <Save className="h-4 w-4" style={{ color: "var(--cc-sage)" }} />
                                    Lectura actual ({currentMonth} {currentYear})
                                </h3>
                                <div className="rounded-xl border p-6" style={{ background: "var(--cc-copper-tint)", borderColor: "rgba(156, 86, 54,0.20)" }}>
                                    <div className="flex flex-col gap-4">
                                        <label className="text-xs font-medium uppercase tracking-widest" style={{ color: "var(--cc-copper-deep)" }}>
                                            Ingresar m³
                                        </label>
                                        <div className="flex gap-3">
                                            <Input
                                                type="number"
                                                value={readingValue}
                                                onChange={(e) => setReadingValue(e.target.value)}
                                                className="h-14 rounded-xl text-center text-2xl font-semibold"
                                                style={{ background: "var(--cc-paper)", borderColor: "rgba(156, 86, 54,0.30)" }}
                                                placeholder="0.0"
                                            />
                                            <Button
                                                onClick={handleSave}
                                                className="h-14 rounded-xl px-8"
                                                style={{ background: "var(--cc-copper)", color: "#fff" }}
                                            >
                                                Guardar
                                            </Button>
                                        </div>
                                        <p className="text-center text-xs font-medium" style={{ color: "var(--cc-copper-deep)", opacity: 0.75 }}>
                                            {previousReading
                                                ? `Lectura anterior: ${previousReading.reading_value.toFixed(1)} m³ (${previousReading.month} ${previousReading.year})`
                                                : 'Sin lectura anterior registrada'}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* History */}
                            <div className="space-y-3.5">
                                <h3 className="flex items-center gap-2 text-sm font-medium cc-text-primary">
                                    <HistoryIcon className="h-4 w-4" style={{ color: "var(--cc-copper)" }} />
                                    Historial de consumo
                                </h3>
                                <div className="space-y-2.5">
                                    {history.length > 0 ? (
                                        history.map((record) => {
                                            const isHigh = (record.consumption || 0) > 20;
                                            return (
                                                <div key={record.id} className="flex items-center justify-between rounded-xl border p-4" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper-warm)" }}>
                                                    <div>
                                                        <p className="font-medium cc-text-secondary">{record.month} {record.year}</p>
                                                        <p className="text-xs cc-text-tertiary">Lectura: {record.reading_value}</p>
                                                    </div>
                                                    <div className="text-right" style={{ color: isHigh ? "var(--cc-amber)" : "var(--cc-sage)" }}>
                                                        <p className="text-lg font-semibold">{(record.consumption || 0).toFixed(1)} m³</p>
                                                        <p className="text-[10px] font-medium uppercase">{isHigh ? 'Alto' : 'Normal'}</p>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        <div className="py-8 text-center text-sm cc-text-tertiary">
                                            No hay historial disponible
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
