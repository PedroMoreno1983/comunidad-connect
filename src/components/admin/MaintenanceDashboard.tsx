"use client";

import { useState, useEffect } from "react";
import {
    Calendar, AlertCircle, Clock, CheckCircle2,
    CalendarDays, Wrench, TrendingUp,
    AlertTriangle, History, ArrowRight, Activity,
    Check, Info, Bot, ShieldAlert, RefreshCw, MessageSquare, Send, Filter
} from "lucide-react";
import { MaintenanceTask, BuildingAsset, MaintenanceLog } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { getApiUrl } from "@/lib/config";
import {
    Dialog,
    DialogContent
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

type CoCoCase = {
    id: string;
    title: string;
    type: string;
    category: string;
    urgency: 'baja' | 'media' | 'alta' | 'emergencia';
    action: string;
    status: 'open' | 'in_progress' | 'resolved' | 'closed' | 'cancelled';
    reason: string | null;
    source_message: string;
    assistant_reply: string | null;
    unit_label: string | null;
    created_at: string;
};

type CoCoCaseEvent = {
    id: string;
    case_id: string;
    event_type: 'created' | 'status_changed' | 'comment' | 'system';
    from_status: string | null;
    to_status: string | null;
    body: string | null;
    actor_role: string | null;
    created_at: string;
};

type ServiceRequestQueueItem = {
    id: string;
    provider_id: string | null;
    user_id: string;
    preferred_date: string | null;
    preferred_time: string | null;
    description: string;
    status: 'pending' | 'accepted' | 'completed' | 'cancelled';
    created_at: string;
    service_providers?: {
        name: string;
        category: string;
        contact_phone?: string | null;
    } | null;
};

export function MaintenanceDashboard() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [assets, setAssets] = useState<BuildingAsset[]>([]);
    const [logs, setLogs] = useState<MaintenanceLog[]>([]);
    const [cocoCases, setCocoCases] = useState<CoCoCase[]>([]);
    const [serviceRequests, setServiceRequests] = useState<ServiceRequestQueueItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [serviceUpdatingId, setServiceUpdatingId] = useState<string | null>(null);
    const [caseUpdatingId, setCaseUpdatingId] = useState<string | null>(null);
    const [selectedCase, setSelectedCase] = useState<CoCoCase | null>(null);
    const [isCaseDetailOpen, setIsCaseDetailOpen] = useState(false);
    const [caseEvents, setCaseEvents] = useState<CoCoCaseEvent[]>([]);
    const [caseEventsLoading, setCaseEventsLoading] = useState(false);
    const [caseComment, setCaseComment] = useState('');
    const [caseCommentSaving, setCaseCommentSaving] = useState(false);
    const [caseStatusFilter, setCaseStatusFilter] = useState<'active' | 'resolved' | 'all'>('active');
    const [caseUrgencyFilter, setCaseUrgencyFilter] = useState<'all' | 'hot'>('all');
    const [selectedTask, setSelectedTask] = useState<MaintenanceTask | null>(null);
    const [isDetailOpen, setIsDetailOpen] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const [tasksRes, assetsRes, logsRes, cocoCasesRes, serviceRequestsRes] = await Promise.all([
                    supabase.from('maintenance_tasks').select('*'),
                    supabase.from('building_assets').select('*'),
                    supabase.from('maintenance_logs').select('*').order('date', { ascending: false }).limit(5),
                    supabase
                        .from('coco_cases')
                        .select('id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at')
                        .order('created_at', { ascending: false })
                        .limit(8),
                    supabase
                        .from('service_requests')
                        .select(`
                            id,
                            provider_id,
                            user_id,
                            preferred_date,
                            preferred_time,
                            description,
                            status,
                            created_at,
                            service_providers (
                                name,
                                category,
                                contact_phone
                            )
                        `)
                        .order('created_at', { ascending: false })
                        .limit(8)
                ]);

                if (tasksRes.data) {
                    setTasks(tasksRes.data.map((t: Record<string, any>) => ({
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
                    setAssets(assetsRes.data.map((dbAsset: Record<string, any>) => ({
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
                    setLogs(logsRes.data.map((l: Record<string, any>) => ({
                        id: l.id,
                        assetId: l.asset_id || l.assetId,
                        performedBy: l.performed_by || l.performedBy,
                        description: l.description,
                        cost: l.cost,
                        date: l.date
                    })));
                }

                if (cocoCasesRes.data) {
                    setCocoCases(cocoCasesRes.data as CoCoCase[]);
                }

                if (serviceRequestsRes.data) {
                    setServiceRequests(serviceRequestsRes.data as unknown as ServiceRequestQueueItem[]);
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

    const handleUpdateServiceStatus = async (
        requestId: string,
        status: ServiceRequestQueueItem['status']
    ) => {
        setServiceUpdatingId(requestId);
        try {
            const response = await fetch(getApiUrl(`/api/service-requests/${requestId}/status`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar la solicitud');
            }

            setServiceRequests(prev => prev.map(item => item.id === requestId ? { ...item, ...data.request } : item));
            toast({
                title: 'Solicitud actualizada',
                description: 'El residente fue notificado del cambio de estado.',
                variant: 'success',
            });
        } catch (error) {
            toast({
                title: 'No se pudo actualizar',
                description: error instanceof Error ? error.message : 'Intentalo nuevamente.',
                variant: 'destructive',
            });
        } finally {
            setServiceUpdatingId(null);
        }
    };

    const handleUpdateCaseStatus = async (caseId: string, status: CoCoCase['status']) => {
        setCaseUpdatingId(caseId);
        try {
            const response = await fetch(getApiUrl(`/api/coco/cases/${caseId}/status`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'No se pudo actualizar');
            }

            setCocoCases(prev => prev.map(item => item.id === caseId ? { ...item, ...data.case } : item));
            toast({
                title: "Caso actualizado",
                description: status === 'resolved' ? "Marcado como resuelto y residente notificado." : "Estado cambiado y residente notificado.",
                variant: "success"
            });
        } catch (error) {
            toast({
                title: "No se pudo actualizar",
                description: error instanceof Error ? error.message : 'Intentalo nuevamente.',
                variant: "destructive"
            });
        } finally {
            setCaseUpdatingId(null);
        }
    };

    const fetchCaseEvents = async (caseId: string) => {
        setCaseEventsLoading(true);
        try {
            const response = await fetch(getApiUrl(`/api/coco/cases/${caseId}/events`));
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo cargar la bitacora');
            setCaseEvents(data.events || []);
        } catch (error) {
            toast({
                title: "No se pudo cargar el detalle",
                description: error instanceof Error ? error.message : 'Intentalo nuevamente.',
                variant: "destructive"
            });
        } finally {
            setCaseEventsLoading(false);
        }
    };

    const openCaseDetail = (item: CoCoCase) => {
        setSelectedCase(item);
        setCaseComment('');
        setCaseEvents([]);
        setIsCaseDetailOpen(true);
        fetchCaseEvents(item.id);
    };

    const handleAddCaseComment = async () => {
        if (!selectedCase || !caseComment.trim()) return;

        setCaseCommentSaving(true);
        try {
            const response = await fetch(getApiUrl(`/api/coco/cases/${selectedCase.id}/events`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ body: caseComment }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo comentar');

            setCaseEvents(prev => [data.event, ...prev]);
            setCaseComment('');
            toast({
                title: "Comentario agregado",
                description: "Quedo en la bitacora y se notifico al residente.",
                variant: "success"
            });
        } catch (error) {
            toast({
                title: "No se pudo comentar",
                description: error instanceof Error ? error.message : 'Intentalo nuevamente.',
                variant: "destructive"
            });
        } finally {
            setCaseCommentSaving(false);
        }
    };

    if (isLoading) return <div className="p-8 text-center">Cargando dashboard de mantenimiento...</div>;

    const overdueCount = tasks.filter((t: MaintenanceTask) => t.status === 'overdue').length;
    const pendingCount = tasks.filter((t: MaintenanceTask) => t.status === 'pending').length;
    const criticalAssets = assets.filter((a: BuildingAsset) => a.healthStatus === 'critical').length;
    const activeServiceRequests = serviceRequests.filter(item => item.status === 'pending' || item.status === 'accepted');
    const pendingServiceRequests = serviceRequests.filter(item => item.status === 'pending').length;
    const openCocoCases = cocoCases.filter(item => item.status === 'open' || item.status === 'in_progress').length;
    const emergencyCocoCases = cocoCases.filter(item => item.urgency === 'emergencia' || item.urgency === 'alta').length;
    const visibleCocoCases = cocoCases.filter(item => {
        const isActive = item.status === 'open' || item.status === 'in_progress';
        const isResolved = item.status === 'resolved' || item.status === 'closed';
        const isHot = item.urgency === 'emergencia' || item.urgency === 'alta';

        if (caseStatusFilter === 'active' && !isActive) return false;
        if (caseStatusFilter === 'resolved' && !isResolved) return false;
        if (caseUrgencyFilter === 'hot' && !isHot) return false;
        return true;
    });
    const cocoInsights = (() => {
        const activeCases = cocoCases.filter(item => item.status === 'open' || item.status === 'in_progress');
        const byCategory = activeCases.reduce<Record<string, number>>((acc, item) => {
            acc[item.category] = (acc[item.category] || 0) + 1;
            return acc;
        }, {});
        const topCategory = Object.entries(byCategory).sort((a, b) => b[1] - a[1])[0];
        const oldestOpen = activeCases
            .slice()
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())[0];

        const insights: { title: string; body: string; tone: 'red' | 'amber' | 'blue' | 'emerald' }[] = [];
        if (emergencyCocoCases > 0) {
            insights.push({
                title: 'Prioridad operacional',
                body: `${emergencyCocoCases} caso(s) de alta prioridad requieren seguimiento visible.`,
                tone: 'red',
            });
        }
        if (topCategory && topCategory[1] >= 2) {
            insights.push({
                title: 'Patron recurrente',
                body: `${topCategory[1]} caso(s) abiertos se concentran en ${topCategory[0]}. Conviene revisar causa comun.`,
                tone: 'amber',
            });
        }
        if (oldestOpen) {
            const hours = Math.max(1, Math.round((Date.now() - new Date(oldestOpen.created_at).getTime()) / 36e5));
            insights.push({
                title: 'Caso mas antiguo',
                body: `${oldestOpen.title.slice(0, 70)}${oldestOpen.title.length > 70 ? '...' : ''} lleva ${hours} h abierto.`,
                tone: 'blue',
            });
        }
        if (insights.length === 0) {
            insights.push({
                title: 'Sin alertas acumuladas',
                body: 'La cola CoCo no muestra concentraciones criticas en este momento.',
                tone: 'emerald',
            });
        }
        return insights.slice(0, 3);
    })();

    return (
        <div className="space-y-12">
            {/* Quick Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-lg border border-white/50 dark:border-slate-700/50 shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-danger-bg rounded-lg">
                            <AlertCircle className="h-6 w-6 text-danger-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Tareas Vencidas</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{overdueCount}</p>
                    <p className="text-xs font-bold text-red-500 mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Requiere acción inmediata
                    </p>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-lg border border-white/50 dark:border-slate-700/50 shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                            <Clock className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Pendientes</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{pendingCount}</p>
                    <p className="text-xs font-bold text-slate-400 mt-2">Próximos 7 días</p>
                </div>

                <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-lg border border-white/50 dark:border-slate-700/50 shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-warning-bg rounded-lg">
                            <Activity className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Activos Críticos</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{criticalAssets}</p>
                    <p className="text-xs font-bold text-amber-500 mt-2">Revisar hoja de vida</p>
                </div>

                <div className="bg-canvas/80 dark:bg-slate-950/80 backdrop-blur-xl border border-slate-800 p-8 rounded-lg shadow-sm shadow-blue-500/10 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <TrendingUp className="h-20 w-20 text-blue-500" />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div>
                            <h3 className="font-semibold text-white uppercase text-[10px] tracking-widest mb-1">Costo Operativo</h3>
                            <p className="text-2xl font-semibold text-white">$450.000</p>
                        </div>
                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Este mes</p>
                    </div>
                </div>
            </div>

            {/* Service Request Queue */}
            <section className="space-y-6">
                <div className="flex flex-col gap-4 px-2 md:flex-row md:items-end md:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-lg">
                            <Wrench className="h-6 w-6 text-blue-600 dark:text-blue-300" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-[0.25em]">Servicios</p>
                            <h2 className="text-2xl font-semibold cc-text-primary">Solicitudes de proveedores</h2>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary">
                            {activeServiceRequests.length} activas
                        </span>
                        <span className="rounded-lg bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-600 dark:bg-amber-500/10 dark:text-amber-300">
                            {pendingServiceRequests} pendientes
                        </span>
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm shadow-slate-200/20 dark:shadow-black/30">
                    {serviceRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                            <Wrench className="h-10 w-10 text-slate-300" />
                            <p className="text-sm font-bold cc-text-secondary">Todavía no hay solicitudes de servicios.</p>
                            <p className="max-w-md text-xs cc-text-tertiary">
                                Cuando un residente contacte a un técnico desde el directorio, aparecerá aquí para seguimiento operativo.
                            </p>
                        </div>
                    ) : (
                        <div className="divide-y divide-subtle">
                            {serviceRequests.map(item => {
                                const provider = item.service_providers;
                                const isDone = item.status === 'completed' || item.status === 'cancelled';
                                const statusClass =
                                    item.status === 'completed'
                                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                                        : item.status === 'cancelled'
                                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300'
                                            : item.status === 'accepted'
                                                ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                                                : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300';

                                return (
                                    <article key={item.id} className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
                                        <div className="space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${statusClass}`}>
                                                    {item.status === 'accepted' ? 'Aceptada' : item.status === 'completed' ? 'Completada' : item.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                                                </span>
                                                {provider?.category && (
                                                    <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">
                                                        {provider.category}
                                                    </span>
                                                )}
                                            </div>
                                            <div>
                                                <h3 className="text-lg font-semibold cc-text-primary">
                                                    {provider?.name || 'Proveedor por confirmar'}
                                                </h3>
                                                <p className="mt-1 line-clamp-2 text-sm font-medium cc-text-secondary">
                                                    {item.description}
                                                </p>
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-xs font-bold cc-text-tertiary">
                                                <span>Preferencia: {item.preferred_date || 'sin fecha'} {item.preferred_time || ''}</span>
                                                <span>Creada: {new Date(item.created_at).toLocaleDateString('es-CL')}</span>
                                                {provider?.contact_phone && <span>Tel: {provider.contact_phone}</span>}
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap gap-2 md:justify-end">
                                            {item.status === 'pending' && (
                                                <button
                                                    onClick={() => handleUpdateServiceStatus(item.id, 'accepted')}
                                                    disabled={serviceUpdatingId === item.id}
                                                    className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    Aceptar
                                                </button>
                                            )}
                                            {!isDone && (
                                                <button
                                                    onClick={() => handleUpdateServiceStatus(item.id, 'completed')}
                                                    disabled={serviceUpdatingId === item.id}
                                                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                                                >
                                                    Completar
                                                </button>
                                            )}
                                            {!isDone && (
                                                <button
                                                    onClick={() => handleUpdateServiceStatus(item.id, 'cancelled')}
                                                    disabled={serviceUpdatingId === item.id}
                                                    className="rounded-xl bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary transition-colors hover:bg-slate-200 disabled:opacity-50 dark:hover:bg-slate-800"
                                                >
                                                    Cancelar
                                                </button>
                                            )}
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* CoCo Operational Queue */}
            <section className="space-y-6">
                <div className="flex flex-col gap-4 px-2 md:flex-row md:items-end md:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
                            <Bot className="h-6 w-6 text-emerald-600 dark:text-emerald-300" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-[0.25em]">Operacion CoCo</p>
                            <h2 className="text-2xl font-semibold cc-text-primary">Casos detectados por IA</h2>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex rounded-lg border border-subtle bg-surface p-1">
                            {[
                                { key: 'active', label: 'Activos' },
                                { key: 'resolved', label: 'Resueltos' },
                                { key: 'all', label: 'Todos' },
                            ].map(option => (
                                <button
                                    key={option.key}
                                    onClick={() => setCaseStatusFilter(option.key as typeof caseStatusFilter)}
                                    className={`rounded-xl px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                                        caseStatusFilter === option.key
                                            ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                                            : 'cc-text-secondary hover:bg-elevated'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setCaseUrgencyFilter(prev => prev === 'hot' ? 'all' : 'hot')}
                            className={`rounded-lg px-4 py-2 text-xs font-semibold transition-colors ${
                                caseUrgencyFilter === 'hot'
                                    ? 'bg-red-600 text-white'
                                    : 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300'
                            }`}
                        >
                            Solo urgentes
                        </button>
                        <span className="rounded-lg bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary">
                            {openCocoCases} abiertos
                        </span>
                        <span className="rounded-lg bg-red-50 px-4 py-2 text-xs font-semibold text-red-600 dark:bg-red-500/10 dark:text-red-300">
                            {emergencyCocoCases} alta prioridad
                        </span>
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm shadow-slate-200/20 dark:shadow-black/30">
                    <div className="grid gap-3 border-b border-subtle bg-elevated/40 p-4 md:grid-cols-3">
                        {cocoInsights.map(insight => (
                            <div
                                key={insight.title}
                                className={`rounded-lg border p-4 ${
                                    insight.tone === 'red'
                                        ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200'
                                        : insight.tone === 'amber'
                                            ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
                                            : insight.tone === 'blue'
                                                ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200'
                                                : 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
                                }`}
                            >
                                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{insight.title}</p>
                                <p className="mt-1 text-xs font-bold leading-relaxed">{insight.body}</p>
                            </div>
                        ))}
                    </div>
                    {cocoCases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                            <Bot className="h-10 w-10 text-slate-300" />
                            <p className="text-sm font-bold cc-text-secondary">Todavia no hay casos creados por CoCo.</p>
                            <p className="max-w-md text-xs cc-text-tertiary">
                                Cuando un residente reporte filtraciones, ruidos, seguridad o mantencion, apareceran aqui.
                            </p>
                        </div>
                    ) : visibleCocoCases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                            <Filter className="h-9 w-9 text-slate-300" />
                            <p className="text-sm font-bold cc-text-secondary">No hay casos para estos filtros.</p>
                            <button
                                onClick={() => {
                                    setCaseStatusFilter('all');
                                    setCaseUrgencyFilter('all');
                                }}
                                className="rounded-xl bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary hover:bg-slate-200 dark:hover:bg-slate-800"
                            >
                                Limpiar filtros
                            </button>
                        </div>
                    ) : (
                        <div className="divide-y divide-subtle">
                            {visibleCocoCases.map(item => {
                                const isHot = item.urgency === 'emergencia' || item.urgency === 'alta';
                                const isClosed = item.status === 'resolved' || item.status === 'closed';

                                return (
                                    <article key={item.id} className="grid gap-5 p-6 md:grid-cols-[1fr_auto] md:items-center">
                                        <div className="min-w-0 space-y-3">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${isHot ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'}`}>
                                                    {isHot && <ShieldAlert className="h-3 w-3" />}
                                                    {item.urgency}
                                                </span>
                                                <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                                    {item.category}
                                                </span>
                                                <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                                    {item.status.replace('_', ' ')}
                                                </span>
                                                {item.unit_label && (
                                                    <span className="rounded-full bg-slate-900 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-white">
                                                        {item.unit_label}
                                                    </span>
                                                )}
                                            </div>

                                            <div>
                                                <h3 className="truncate text-lg font-semibold cc-text-primary">{item.title}</h3>
                                                <p className="mt-1 line-clamp-2 text-sm font-medium cc-text-secondary">{item.source_message}</p>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold cc-text-tertiary">
                                                <span>{new Date(item.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                                                {item.reason && <span className="line-clamp-1">Decision: {item.reason}</span>}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 md:justify-end">
                                            <button
                                                onClick={() => openCaseDetail(item)}
                                                className="inline-flex h-11 items-center gap-2 rounded-xl border border-subtle px-4 text-xs font-semibold cc-text-secondary transition-colors hover:bg-elevated"
                                            >
                                                <MessageSquare className="h-4 w-4" />
                                                Detalle
                                            </button>
                                            <button
                                                onClick={() => handleUpdateCaseStatus(item.id, 'in_progress')}
                                                disabled={caseUpdatingId === item.id || isClosed}
                                                className="inline-flex h-11 items-center gap-2 rounded-xl border border-subtle px-4 text-xs font-semibold cc-text-secondary transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                {caseUpdatingId === item.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
                                                Tomar
                                            </button>
                                            <button
                                                onClick={() => handleUpdateCaseStatus(item.id, 'resolved')}
                                                disabled={caseUpdatingId === item.id || isClosed}
                                                className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                                Resolver
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </div>
            </section>

            {/* Task List & Calendar Highlight */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
                <div className="lg:col-span-2 space-y-8">
                    <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-4">
                            <div className="p-3 bg-elevated rounded-lg">
                                <CalendarDays className="h-6 w-6 cc-text-primary" />
                            </div>
                            <h2 className="text-2xl font-semibold cc-text-primary">Tareas de Mantenimiento</h2>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {tasks.map((task: MaintenanceTask) => {
                            const asset = assets.find(a => a.id === task.assetId);
                            return (
                                <div key={task.id} className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-8 rounded-lg border border-white/50 dark:border-slate-700/50 hover:border-white/80 dark:hover:border-slate-600 hover:shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                                    <div className="flex items-center gap-6">
                                        <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${task.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                            }`}>
                                            <Wrench className="h-7 w-7" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-widest">{asset?.name}</p>
                                            <h4 className="text-lg font-semibold cc-text-primary">{task.title}</h4>
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                Vence: {new Date(task.dueDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                                            task.priority === 'high' ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-500'
                                            }`}>
                                            {task.status === 'completed' ? 'Finalizada' : `Prioridad ${task.priority === 'high' ? 'Alta' : 'Media'}`}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailOpen(true);
                                            }}
                                            className="p-4 bg-elevated rounded-lg group-hover:bg-blue-600 group-hover:text-white transition-all"
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
                        <div className="p-3 bg-elevated rounded-lg">
                            <History className="h-6 w-6 cc-text-primary" />
                        </div>
                        <h2 className="text-2xl font-semibold cc-text-primary">Historial Reciente</h2>
                    </div>

                    <div className="bg-white/60 dark:bg-slate-800/40 backdrop-blur-xl p-10 rounded-lg border border-white/50 dark:border-slate-700/50 space-y-8 shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                        {logs.length === 0 && <p className="text-slate-500 text-sm">No hay historial reciente.</p>}
                        {logs.map((log: MaintenanceLog, i: number) => (
                            <div key={log.id} className="flex gap-4 relative">
                                {i !== logs.length - 1 && <div className="absolute left-[11px] top-10 bottom-0 w-[2px] bg-elevated" />}
                                <div className="h-6 w-6 rounded-full border-4 border-white dark:border-slate-900 bg-blue-500 z-10 shrink-0" />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                                        {new Date(log.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                    </p>
                                    <p className="text-sm font-bold cc-text-primary">{log.description}</p>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-semibold cc-text-primary">${(log.cost || 0).toLocaleString('es-CL')}</p>
                                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">Costo</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button className="w-full py-4 text-[10px] font-semibold text-blue-600 uppercase tracking-widest hover:text-blue-700 transition-colors">
                            Ver historial completo
                        </button>
                    </div>
                </div>
            </div>

            {/* Task Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="sm:max-w-[550px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-lg p-10 shadow-sm">
                    {selectedTask && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${selectedTask.status === 'overdue' ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                                        }`}>
                                        {selectedTask.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                                    </span>
                                    <span className="text-xs font-bold text-slate-400">ID: {selectedTask.id}</span>
                                </div>
                                <h3 className="text-3xl font-semibold cc-text-primary leading-tight">{selectedTask.title}</h3>
                                <p className="text-slate-500 font-medium leading-relaxed">{selectedTask.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 p-6 bg-elevated/50 rounded-lg">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Frecuencia</p>
                                    <p className="font-bold cc-text-primary capitalize">{selectedTask.frequency === 'weekly' ? 'Semanal' : selectedTask.frequency === 'monthly' ? 'Mensual' : selectedTask.frequency === 'quarterly' ? 'Trimestral' : 'Anual'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Vencimiento</p>
                                    <p className="font-bold cc-text-primary">{new Date(selectedTask.dueDate).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-lg flex gap-3 border border-blue-100 dark:border-blue-500/20">
                                <Info className="h-5 w-5 text-blue-600 shrink-0" />
                                <p className="text-[11px] font-medium text-blue-700 leading-relaxed">
                                    Al completar esta tarea, se generará automáticamente un registro en la bitácora técnica del activo correspondiente.
                                </p>
                            </div>

                            <div className="flex gap-4">
                                <Button
                                    onClick={() => setIsDetailOpen(false)}
                                    variant="outline"
                                    className="flex-1 h-16 rounded-lg font-semibold"
                                >
                                    Cerrar
                                </Button>
                                {selectedTask.status !== 'completed' && (
                                    <Button
                                        onClick={() => handleCompleteTask(selectedTask.id)}
                                        className="flex-[2] h-16 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-sm shadow-blue-500/20 transition-all"
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

            {/* CoCo Case Detail Dialog */}
            <Dialog open={isCaseDetailOpen} onOpenChange={setIsCaseDetailOpen}>
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[760px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl border-white/20 dark:border-slate-800 rounded-lg p-8 shadow-sm">
                    {selectedCase && (
                        <div className="space-y-6">
                            <div className="space-y-3 pr-8">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                        {selectedCase.status.replace('_', ' ')}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${selectedCase.urgency === 'emergencia' || selectedCase.urgency === 'alta' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' : 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'}`}>
                                        {selectedCase.urgency}
                                    </span>
                                    <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                        {selectedCase.category}
                                    </span>
                                </div>
                                <h3 className="text-2xl font-semibold cc-text-primary">{selectedCase.title}</h3>
                                <p className="text-sm font-medium cc-text-secondary">{selectedCase.source_message}</p>
                            </div>

                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-lg bg-elevated p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">Decision CoCo</p>
                                    <p className="mt-2 text-sm font-bold cc-text-secondary">{selectedCase.reason || 'Sin razon registrada.'}</p>
                                </div>
                                <div className="rounded-lg bg-elevated p-4">
                                    <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">Respuesta al residente</p>
                                    <p className="mt-2 line-clamp-4 text-sm font-bold cc-text-secondary">{selectedCase.assistant_reply || 'Sin respuesta registrada.'}</p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <h4 className="text-sm font-semibold uppercase tracking-widest cc-text-primary">Bitacora</h4>
                                {caseEventsLoading ? (
                                    <div className="space-y-3">
                                        {[0, 1, 2].map(item => <div key={item} className="h-16 animate-pulse rounded-lg bg-elevated" />)}
                                    </div>
                                ) : caseEvents.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-subtle p-6 text-center text-sm font-bold cc-text-secondary">
                                        Sin movimientos registrados todavia.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {caseEvents.map(event => (
                                            <div key={event.id} className="rounded-lg border border-subtle bg-surface p-4">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-emerald-600">
                                                        {event.event_type === 'status_changed' ? 'Cambio de estado' : event.event_type}
                                                    </span>
                                                    <span className="text-[10px] font-bold cc-text-tertiary">
                                                        {new Date(event.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                <p className="mt-2 text-sm font-medium cc-text-secondary">{event.body || 'Movimiento registrado.'}</p>
                                                {event.from_status && event.to_status && (
                                                    <p className="mt-2 text-[11px] font-bold cc-text-tertiary">
                                                        {event.from_status} {"->"} {event.to_status}
                                                    </p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="rounded-lg border border-subtle bg-elevated/40 p-4">
                                <label className="block text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">
                                    Agregar comentario visible
                                </label>
                                <textarea
                                    value={caseComment}
                                    onChange={event => setCaseComment(event.target.value)}
                                    rows={3}
                                    maxLength={1200}
                                    placeholder="Ej: Se coordino visita tecnica para revisar la filtracion."
                                    className="mt-3 w-full resize-none rounded-xl border border-subtle bg-surface px-4 py-3 text-sm font-medium cc-text-primary outline-none focus:ring-2 focus:ring-emerald-500/30"
                                />
                                <div className="mt-3 flex justify-end">
                                    <button
                                        onClick={handleAddCaseComment}
                                        disabled={caseCommentSaving || !caseComment.trim()}
                                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                                    >
                                        {caseCommentSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        Comentar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
