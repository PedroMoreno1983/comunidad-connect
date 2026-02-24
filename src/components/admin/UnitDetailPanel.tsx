import { motion, AnimatePresence } from "framer-motion";
import {
    X, History as HistoryIcon, User, Phone, Mail,
    Save, AlertTriangle, CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { useState, useEffect } from "react";
import { Unit, WaterReading, User as Profile } from "@/lib/types";
import { WaterService } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";

interface UnitDetailPanelProps {
    unit: Unit | null;
    isOpen: boolean;
    onClose: () => void;
    onSaveReading: (unitId: string, value: number) => void;
}

export function UnitDetailPanel({ unit, isOpen, onClose, onSaveReading }: UnitDetailPanelProps) {
    const [readingValue, setReadingValue] = useState<string>("");
    const [history, setHistory] = useState<WaterReading[]>([]);
    const [resident, setResident] = useState<Profile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const { toast } = useToast();

    const currentMonth = "Febrero"; // Assuming current month for new readings
    const currentYear = 2026; // Assuming current year for new readings

    useEffect(() => {
        if (unit && isOpen) {
            loadUnitData();
        }
    }, [unit, isOpen]);

    async function loadUnitData() {
        if (!unit) return;
        setIsLoading(true);
        try {
            // Cargar historial real
            const unitReadings = await WaterService.getReadingsByUnit(unit.id);
            setHistory(unitReadings.sort((a, b) => new Date(b.reading_date).getTime() - new Date(a.reading_date).getTime()));

            // Buscar lectura del mes actual si existe
            const current = unitReadings.find(r => r.month === currentMonth && r.year === currentYear);
            if (current) {
                setReadingValue(current.reading_value.toString());
            } else {
                setReadingValue("");
            }

            // Cargar residente real
            // Primero intentamos buscar el perfil asignado a la unidad
            if (unit.ownerId || unit.tenantId) {
                const userId = unit.ownerId || unit.tenantId;
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) {
                    console.error("Error fetching profile:", error);
                    setResident(null);
                } else if (profile) {
                    setResident({
                        id: profile.id,
                        name: profile.full_name,
                        email: profile.email || '',
                        role: profile.role || 'resident',
                        photo: profile.avatar_url
                    });
                } else {
                    setResident(null);
                }
            } else {
                setResident(null);
            }
        } catch (error) {
            console.error("Error loading unit details:", error);
            toast({
                title: "Error al cargar datos",
                description: "No se pudieron cargar los detalles de la unidad.",
                variant: "destructive"
            });
        } finally {
            setIsLoading(false);
        }
    }

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
            } catch (error: any) {
                toast({
                    title: "Error",
                    description: error.message || "No se pudo guardar la lectura.",
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
                        className="fixed inset-y-0 right-0 w-full md:w-[450px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-2xl shadow-2xl z-50 border-l border-white/20 dark:border-slate-800 flex flex-col"
                    >
                        {/* Header */}
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/50">
                            <div>
                                <h2 className="text-2xl font-black text-slate-900 dark:text-white">Unidad {unit.number}</h2>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Torre {unit.tower} • Piso {unit.floor}</p>
                            </div>
                            <button
                                onClick={onClose}
                                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                            >
                                <X className="h-6 w-6 text-slate-400" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-8">

                            {/* Resident Info */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <User className="h-4 w-4 text-blue-500" />
                                    Residente Principal
                                </h3>
                                <div className="p-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-700/50 shadow-sm">
                                    <div className="flex items-center gap-4">
                                        <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-400 font-bold">
                                            {resident?.name.charAt(0) || "U"}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-white">{resident?.name || "Sin residente asignado"}</p>
                                            <p className="text-xs text-slate-500">{resident?.email || "No email"}</p>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex gap-2">
                                        <Button variant="outline" className="flex-1 h-9 text-xs">
                                            <Phone className="h-3 w-3 mr-2" />
                                            Llamar
                                        </Button>
                                        <Button variant="outline" className="flex-1 h-9 text-xs">
                                            <Mail className="h-3 w-3 mr-2" />
                                            Email
                                        </Button>
                                    </div>
                                </div>
                            </div>

                            {/* Current Reading Action */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <Save className="h-4 w-4 text-emerald-500" />
                                    Lectura Actual (Enero 2026)
                                </h3>
                                <div className="p-6 bg-blue-50 dark:bg-blue-900/10 rounded-3xl border border-blue-100 dark:border-blue-800">
                                    <div className="flex flex-col gap-4">
                                        <label className="text-xs font-bold text-blue-800 dark:text-blue-300 uppercase tracking-widest">
                                            Ingresar m³
                                        </label>
                                        <div className="flex gap-4">
                                            <Input
                                                type="number"
                                                value={readingValue}
                                                onChange={(e) => setReadingValue(e.target.value)}
                                                className="h-14 text-2xl font-black text-center bg-white dark:bg-slate-900 border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                                                placeholder="0.0"
                                            />
                                            <Button
                                                onClick={handleSave}
                                                className="h-14 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20"
                                            >
                                                Guardar
                                            </Button>
                                        </div>
                                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 font-medium text-center">
                                            Lectura anterior: 1240.5 m³
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* History */}
                            <div className="space-y-4">
                                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <HistoryIcon className="h-4 w-4 text-purple-500" />
                                    Historial de Consumo
                                </h3>
                                <div className="space-y-3">
                                    {history.length > 0 ? (
                                        history.map((record) => (
                                            <div key={record.id} className="flex items-center justify-between p-4 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md border border-white/50 dark:border-slate-700/50 rounded-2xl shadow-sm">
                                                <div>
                                                    <p className="font-bold text-slate-700 dark:text-slate-300">{record.month} {record.year}</p>
                                                    <p className="text-xs text-slate-400">Lectura: {record.reading_value}</p>
                                                </div>
                                                <div className={`text-right ${(record.consumption || 0) > 20 ? 'text-amber-500' : 'text-emerald-500'}`}>
                                                    <p className="font-black text-lg">{(record.consumption || 0).toFixed(1)} m³</p>
                                                    <p className="text-[10px] font-bold uppercase">{(record.consumption || 0) > 20 ? 'Alto' : 'Normal'}</p>
                                                </div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="text-center py-8 text-slate-400 text-sm">
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
