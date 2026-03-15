"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { WaterService } from "@/lib/api";
import { Building, Home, CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function OnboardingPage() {
    const { user, loading: authLoading } = useAuth();
    const router = useRouter();
    const { toast } = useToast();
    const [step, setStep] = useState(1);
    const [units, setUnits] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedUnit, setSelectedUnit] = useState<string | null>(null);

    useEffect(() => {
        if (!authLoading && !user) {
            router.push("/login");
        }
        if (user && user.role !== 'resident') {
            router.push("/home");
        }
        loadUnits();
    }, [user, authLoading]);

    const loadUnits = async () => {
        setLoading(true);
        try {
            const data = await WaterService.getUnits();
            // Filter units that don't have a resident or are available
            setUnits(data || []);
        } catch (error) {
            console.error("Error loading units:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleComplete = async () => {
        if (!selectedUnit || !user) return;
        setLoading(true);
        try {
            await WaterService.assignResident(selectedUnit, user.id);
            toast({
                title: "¡Configuración completada!",
                description: "Tu unidad ha sido vinculada con éxito.",
                variant: "success"
            });
            setStep(3);
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message || "No se pudo vincular la unidad.",
                variant: "destructive"
            });
        } finally {
            setLoading(false);
        }
    };

    if (authLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800">
                {/* Progress Bar */}
                <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800">
                    <div 
                        className="h-full bg-blue-600 transition-all duration-500" 
                        style={{ width: `${(step / 3) * 100}%` }}
                    />
                </div>

                <div className="p-8">
                    {step === 1 && (
                        <div className="space-y-6 text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="w-20 h-20 bg-blue-100 dark:bg-blue-900/30 rounded-3xl flex items-center justify-center mx-auto">
                                <Building className="h-10 w-10 text-blue-600" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white">¡Hola, {user?.name}!</h1>
                                <p className="text-slate-500 dark:text-slate-300">Bienvenido a ComunidadConnect. Necesitamos vincular tu perfil con tu departamento para habilitar todas las funciones.</p>
                            </div>
                            <Button 
                                onClick={() => setStep(2)} 
                                className="w-full h-12 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg group"
                            >
                                Comenzar
                                <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                            </Button>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
                            <div className="space-y-2">
                                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Selecciona tu Unidad</h2>
                                <p className="text-sm text-slate-500 dark:text-slate-400">Busca tu número de departamento o casa en la lista.</p>
                            </div>

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                                {loading ? (
                                    <div className="py-10 text-center"><Loader2 className="animate-spin h-6 w-6 text-slate-300 mx-auto" /></div>
                                ) : units.length === 0 ? (
                                    <p className="text-center py-10 text-slate-400">No hay unidades disponibles.</p>
                                ) : (
                                    units.map((u) => (
                                        <button
                                            key={u.id}
                                            onClick={() => setSelectedUnit(u.id)}
                                            className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-all ${
                                                selectedUnit === u.id
                                                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-500'
                                                : 'border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                            }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <Home className={`h-5 w-5 ${selectedUnit === u.id ? 'text-blue-600' : 'text-slate-400'}`} />
                                                <div className="text-left">
                                                    <p className="font-bold text-slate-900 dark:text-white">{u.number}</p>
                                                    {u.tower && <p className="text-xs text-slate-500 uppercase tracking-wider">{u.tower}</p>}
                                                </div>
                                            </div>
                                            {selectedUnit === u.id && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                                        </button>
                                    ))
                                )}
                            </div>

                            <div className="flex gap-3">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setStep(1)}
                                    className="flex-1 rounded-2xl"
                                >
                                    Atrás
                                </Button>
                                <Button 
                                    disabled={!selectedUnit || loading}
                                    onClick={handleComplete}
                                    className="flex-[2] rounded-2xl bg-blue-600 hover:bg-blue-700"
                                >
                                    {loading ? <Loader2 className="animate-spin h-5 w-5" /> : "Finalizar"}
                                </Button>
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-6 text-center animate-in zoom-in duration-500">
                            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto shadow-inner shadow-emerald-500/20">
                                <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                            </div>
                            <div className="space-y-2">
                                <h1 className="text-2xl font-black text-slate-900 dark:text-white">¡Todo listo!</h1>
                                <p className="text-slate-500 dark:text-slate-400">Ya puedes comenzar a usar todas las funciones de tu edificio.</p>
                            </div>
                            <Button 
                                onClick={() => router.push("/home")} 
                                className="w-full h-12 rounded-2xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white font-bold"
                            >
                                Entrar a mi Panel
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
