"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
    Calendar, AlertCircle, Clock, CheckCircle2,
    CalendarDays, Wrench, BarChart3, TrendingUp,
    AlertTriangle, History, ArrowRight, Activity,
    Check, X, Trash2, Info
} from "lucide-react";
import { MaintenanceTask, BuildingAsset, MaintenanceLog } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function MaintenanceDashboard() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [assets, setAssets] = useState<BuildingAsset[]>([]);
    const [logs, setLogs] = useState<MaintenanceLog[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [tasksRes, assetsRes, logsRes] = await Promise.all([
                    supabase.from('maintenance_tasks').select('*'),
                    supabase.from('building_assets').select('*'),
                    supabase.from('maintenance_logs').select('*').order('date', { ascending: false }).limit(5)
                ]);

                if (tasksRes.data) {
                    setTasks(tasksRes.data.map((t: any) => ({
                        id: t.id,
                        assetId: t.asset_id || t.assetId,
                        title: t.title,
                        description: t.description,
                        frequency: t.frequency,
                        dueDate: t.due_date || t.dueDate,
                        priority: t.priority,
                        status: t.status
                    })));
                }

                if (assetsRes.data) {
                    setAssets(assetsRes.data.map((dbAsset: any) => ({
                        id: dbAsset.id,
                        name: dbAsset.name,
                        category: dbAsset.category,
                        brand: dbAsset.brand,
                        model: dbAsset.model,
                        installationDate: dbAsset.installation_date || dbAsset.installationDate,
                        location: dbAsset.location,
                        healthStatus: dbAsset.health_status || dbAsset.healthStatus,
                        lastMaintenance: dbAsset.last_maintenance || dbAsset.lastMaintenance,
                        nextMaintenance: dbAsset.next_maintenance || dbAsset.nextMaintenance,
                    })));
                }

                if (logsRes.data) {
                    setLogs(logsRes.data.map((l: any) => ({
                        id: l.id,
                        assetId: l.asset_id || l.assetId,
                        performedBy: l.performed_by || l.performedBy,
                        description: l.description,
                        cost: l.cost,
                        date: l.date
                    })));
                }
            } catch (err) {
                console.error("Error fetching maintenance data:", err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    const handleCompleteTask = async (taskId: string) => {
        try {
            await supabase.from('maintenance_tasks').update({ status: 'completed' }).eq('id', taskId);
            setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, status: 'completed' } : t
            ));
            setIsDetailOpen(false);
            toast({
                title: "Tarea Completada",
                description: "El registro ha sido actualizado exitosamente.",
                variant: "success"
            });
        } catch (error) {
            console.error(error);
        }
    };

    if (isLoading) return <div className="p-8 text-center">Cargando dashboard de mantenimiento...</div>;

    const overdueCount = tasks.filter((t: any) => t.status === 'overdue').length;
    const pendingCount = tasks.filter((t: any) => t.status === 'pending').length;
    const criticalAssets = assets.filter((a: any) => a.healthStatus === 'critical').length;

    return (
        <div className="space-y-12">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-red-50 dark:bg-red-500/10 rounded-2xl">
                            <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest">Tareas Vencidas</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">{overdueCount}</p>
                    <p className="text-xs font-bold text-red-500 mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Requiere acción inmediata
                    </p>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
                            <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest">Pendientes</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">{pendingCount}</p>
                    <p className="text-xs font-bold text-slate-400 mt-2">Próximos 7 días</p>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-amber-50 dark:bg-amber-500/10 rounded-2xl">
                            <Activity className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <h3 className="font-black text-slate-900 dark:text-white uppercase text-[10px] tracking-widest">Activos Críticos</h3>
                    </div>
                    <p className="text-4xl font-black text-slate-900 dark:text-white">{criticalAssets}</p>
                    <p className="text-xs font-bold text-amber-500 mt-2">Revisar hoja de vida</p>
                </div>

                <div className="bg-slate-900/80 dark:bg-slate-950/80 backdrop-blur-xl border border-slate-800 p-8 rounded-[2.5rem] shadow-2xl shadow-blue-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <TrendingUp className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div>
                            <h3 className="font-black text-white uppercase text-[10px] tracking-widest mb-1">Costo Operativo</h3>
                            <p className="text-2xl font-black text-white">$450.000</p>
                        </div>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Este mes</p>
                    </div>
                </div>
            </div>

            {/* Task List & Calendar Highlight */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                                <CalendarDays className="h-6 w-6 text-slate-900 dark:text-white" />
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Tareas de Mantenimiento</h2>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {tasks.map((task: any) => {
                            const asset = assets.find(a => a.id === task.assetId);
                            return (
                                <div key={task.id} className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/50 dark:border-slate-700/50 hover:border-white/80 dark:hover:border-slate-600 hover:shadow-xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                                    <div className="flex items-center gap-6">
                                        <div className={`h-16 w-16 rounded-2xl flex items-center justify-center ${task.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                            <Wrench className="h-7 w-7" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">{asset?.name}</p>
                                            <h4 className="text-lg font-black text-slate-900 dark:text-white">{task.title}</h4>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                Vence: {new Date(task.dueDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                                            task.priority === 'high' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {task.status === 'completed' ? 'Finalizada' : `Prioridad ${task.priority === 'high' ? 'Alta' : 'Media'}`}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailOpen(true);
                                            }}
                                            className="p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl group-hover:bg-blue-600 group-hover:text-white transition-all"
                                        >
                                            <ArrowRight className="h-5 w-5" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Technical History Snippet */}
                <div className="space-y-8">
                    <div className="flex items-center gap-4 px-2">
                        <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                            <History className="h-6 w-6 text-slate-900 dark:text-white" />
                        </div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white">Historial Reciente</h2>
                    </div>

                    <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-10 rounded-[3rem] border border-white/50 dark:border-slate-700/50 space-y-8 shadow-xl shadow-slate-200/20 dark:shadow-black/40">
                        {logs.length === 0 && <p className="text-slate-500 text-sm">No hay historial reciente.</p>}
                        {logs.map((log: MaintenanceLog, i: number) => (
                            <div key={log.id} className="flex gap-4 relative">
                                {i !== logs.length - 1 && <div className="absolute left-[11px] top-10 bottom-0 w-[2px] bg-slate-100 dark:bg-slate-800" />}
                                <div className="h-6 w-6 rounded-full border-4 border-white dark:border-slate-900 bg-blue-500 z-10 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                        {new Date(log.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                    </p>
                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{log.description}</p>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-black text-slate-900 dark:text-white">${(log.cost || 0).toLocaleString('es-CL')}</p>
                                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Costo</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button className="w-full py-4 text-[10px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
                            Ver historial completo
                        </button>
                    </div>
                </div>
            </div>

            {/* Task Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="sm:max-w-[550px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-[2.5rem] p-10 shadow-2xl">
                    {selectedTask && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${selectedTask.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                        }`}>
                                        {selectedTask.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400">ID: {selectedTask.id}</span>
                                </div>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white leading-tight">{selectedTask.title}</h3>
                                <p className="text-slate-500 font-medium leading-relaxed">{selectedTask.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-[2rem]">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Frecuencia</p>
                                    <p className="font-bold text-slate-900 dark:text-white capitalize">{selectedTask.frequency === 'weekly' ? 'Semanal' : selectedTask.frequency === 'monthly' ? 'Mensual' : selectedTask.frequency === 'quarterly' ? 'Trimestral' : 'Anual'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vencimiento</p>
                                    <p className="font-bold text-slate-900 dark:text-white">{new Date(selectedTask.dueDate).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl flex gap-3 border border-blue-100 dark:border-blue-500/20">
                                <Info className="h-5 w-5 text-blue-600 shrink-0" />
                                <p className="text-[11px] font-medium text-blue-700 leading-relaxed">
                                    Al completar esta tarea, se generará automáticamente un registro en la bitácora técnica del activo correspondiente.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={() => setIsDetailOpen(false)}
                                    variant="outline"
                                    className="flex-1 h-16 rounded-2xl font-black"
                                >
                                    Cerrar
                                </Button>
                                {selectedTask.status !== 'completed' && (
                                    <Button
                                        onClick={() => handleCompleteTask(selectedTask.id)}
                                        className="flex-[2] h-16 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black shadow-xl shadow-blue-500/20 transition-all"
                                    >
                                        <Check className="mr-2 h-5 w-5" />
                                        Marcar como Completada
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
