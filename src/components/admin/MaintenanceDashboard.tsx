"use client";

import { useState, useEffect } from "react";
import {
    Calendar, AlertCircle, Clock, CheckCircle2,
    CalendarDays, Wrench, TrendingUp,
    AlertTriangle, History, ArrowRight, Activity,
    Check, Info, Bot, ShieldAlert, RefreshCw, MessageSquare, Send, Filter
} from "lucide-react";
import { MaintenanceTask, BuildingAsset, MaintenanceLog, CocoCase, CocoCaseEvent, ServiceRequestQueueItem } from "@/lib/types";
import { getApiUrl } from "@/lib/config";
import { MaintenanceService } from "@/lib/api";
import {
    Dialog,
    DialogContent
} from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export function MaintenanceDashboard() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [assets, setAssets] = useState<BuildingAsset[]>([]);
    const [logs, setLogs] = useState<MaintenanceLog[]>([]);
    const [cocoCases, setCocoCases] = useState<CocoCase[]>([]);
    const [serviceRequests, setServiceRequests] = useState<ServiceRequestQueueItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [serviceUpdatingId, setServiceUpdatingId] = useState<string | null>(null);
    const [caseUpdatingId, setCaseUpdatingId] = useState<string | null>(null);
    const [selectedCase, setSelectedCase] = useState<CocoCase | null>(null);
    const [isCaseDetailOpen, setIsCaseDetailOpen] = useState(false);
    const [caseEvents, setCaseEvents] = useState<CocoCaseEvent[]>([]);
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
                const data = await MaintenanceService.getDashboardData();
                setTasks(data.tasks);
                setAssets(data.assets);
                setLogs(data.logs);
                setCocoCases(data.cases);
                setServiceRequests(data.serviceRequests);
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
            await MaintenanceService.completeTask(taskId);
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

    const handleUpdateCaseStatus = async (caseId: string, status: CocoCase['status']) => {
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

    const openCaseDetail = (item: CocoCase) => {
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
                <div className="bg-[var(--cc-paper)] p-8 rounded-lg border border-[var(--cc-line)] shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-danger-bg rounded-lg">
                            <AlertCircle className="h-6 w-6 text-danger-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Tareas Vencidas</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{overdueCount}</p>
                    <p className="text-xs font-bold text-[var(--cc-rose)] mt-2 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3" />
                        Requiere acción inmediata
                    </p>
                </div>

                <div className="bg-[var(--cc-paper)] p-8 rounded-lg border border-[var(--cc-line)] shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-[var(--cc-copper-tint)] rounded-lg">
                            <Clock className="h-6 w-6 text-[var(--cc-copper)]" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Pendientes</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{pendingCount}</p>
                    <p className="text-xs font-medium cc-text-tertiary mt-2">Próximos 7 días</p>
                </div>

                <div className="bg-[var(--cc-paper)] p-8 rounded-lg border border-[var(--cc-line)] shadow-sm shadow-slate-200/20 dark:shadow-black/40">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="p-3 bg-warning-bg rounded-lg">
                            <Activity className="h-6 w-6 text-warning-fg" />
                        </div>
                        <h3 className="font-semibold cc-text-primary uppercase text-[10px] tracking-widest">Activos Críticos</h3>
                    </div>
                    <p className="text-4xl font-semibold cc-text-primary">{criticalAssets}</p>
                    <p className="text-xs font-bold text-[var(--cc-amber)] mt-2">Revisar hoja de vida</p>
                </div>

                <div className="relative overflow-hidden rounded-2xl p-8 group" style={{ background: "var(--cc-ink)" }}>
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <TrendingUp className="h-20 w-20" style={{ color: "var(--cc-copper-soft)" }} />
                    </div>
                    <div className="relative z-10 flex flex-col justify-between h-full">
                        <div>
                            <h3 className="mb-1 text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--cc-paper)" }}>Costo operativo</h3>
                            <p className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-paper)" }}>$450.000</p>
                        </div>
                        <p className="text-[10px] font-medium uppercase tracking-widest" style={{ color: "var(--cc-copper-soft)" }}>Este mes</p>
                    </div>
                </div>
            </div>

            {/* Service Request Queue */}
            <section className="space-y-6">
                <div className="flex flex-col gap-4 px-2 md:flex-row md:items-end md:justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-[var(--cc-copper-tint)] rounded-lg">
                            <Wrench className="h-6 w-6 text-[var(--cc-copper)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-[var(--cc-copper)] uppercase tracking-[0.25em]">Servicios</p>
                            <h2 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Solicitudes de proveedores</h2>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="rounded-lg bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary">
                            {activeServiceRequests.length} activas
                        </span>
                        <span className="rounded-lg bg-[var(--cc-amber-tint)] px-4 py-2 text-xs font-semibold text-[var(--cc-amber)]">
                            {pendingServiceRequests} pendientes
                        </span>
                    </div>
                </div>

                <div className="overflow-hidden rounded-lg border border-subtle bg-surface shadow-sm shadow-slate-200/20 dark:shadow-black/30">
                    {serviceRequests.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                            <Wrench className="h-10 w-10 text-[var(--cc-ink-faint)]" />
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
                                        ? 'bg-[var(--cc-sage-tint)] text-[var(--cc-sage)]'
                                        : item.status === 'cancelled'
                                            ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]'
                                            : item.status === 'accepted'
                                                ? 'bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]'
                                                : 'bg-[var(--cc-amber-tint)] text-[var(--cc-amber)]';

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
                                                    className="rounded-xl bg-[var(--cc-copper)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                                                >
                                                    Aceptar
                                                </button>
                                            )}
                                            {!isDone && (
                                                <button
                                                    onClick={() => handleUpdateServiceStatus(item.id, 'completed')}
                                                    disabled={serviceUpdatingId === item.id}
                                                    className="rounded-xl bg-[var(--cc-sage)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
                                                >
                                                    Completar
                                                </button>
                                            )}
                                            {!isDone && (
                                                <button
                                                    onClick={() => handleUpdateServiceStatus(item.id, 'cancelled')}
                                                    disabled={serviceUpdatingId === item.id}
                                                    className="rounded-xl bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary transition-colors hover:bg-[var(--cc-line)] disabled:opacity-50"
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
                        <div className="p-3 bg-[var(--cc-sage-tint)] rounded-lg">
                            <Bot className="h-6 w-6 text-[var(--cc-sage)]" />
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-[var(--cc-sage)] uppercase tracking-[0.25em]">Operacion CoCo</p>
                            <h2 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Casos detectados por IA</h2>
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
                                            ? 'bg-[var(--cc-ink)] text-[var(--cc-paper)]'
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
                                    ? 'bg-[var(--cc-rose)] text-white'
                                    : 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]'
                            }`}
                        >
                            Solo urgentes
                        </button>
                        <span className="rounded-lg bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary">
                            {openCocoCases} abiertos
                        </span>
                        <span className="rounded-lg bg-[var(--cc-rose-tint)] px-4 py-2 text-xs font-semibold text-[var(--cc-rose)]">
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
                                        ? 'border-[rgba(181,82,78,0.30)] bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]'
                                        : insight.tone === 'amber'
                                            ? 'border-[rgba(201,154,74,0.30)] bg-[var(--cc-amber-tint)] text-[var(--cc-amber)]'
                                            : insight.tone === 'blue'
                                                ? 'border-[rgba(156, 86, 54,0.30)] bg-[var(--cc-copper-tint)] text-[var(--cc-copper-deep)]'
                                                : 'border-[rgba(95, 122, 70,0.30)] bg-[var(--cc-sage-tint)] text-[var(--cc-sage)]'
                                }`}
                            >
                                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-70">{insight.title}</p>
                                <p className="mt-1 text-xs font-bold leading-relaxed">{insight.body}</p>
                            </div>
                        ))}
                    </div>
                    {cocoCases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
                            <Bot className="h-10 w-10 text-[var(--cc-ink-faint)]" />
                            <p className="text-sm font-bold cc-text-secondary">Todavia no hay casos creados por CoCo.</p>
                            <p className="max-w-md text-xs cc-text-tertiary">
                                Cuando un residente reporte filtraciones, ruidos, seguridad o mantencion, apareceran aqui.
                            </p>
                        </div>
                    ) : visibleCocoCases.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
                            <Filter className="h-9 w-9 text-[var(--cc-ink-faint)]" />
                            <p className="text-sm font-bold cc-text-secondary">No hay casos para estos filtros.</p>
                            <button
                                onClick={() => {
                                    setCaseStatusFilter('all');
                                    setCaseUrgencyFilter('all');
                                }}
                                className="rounded-xl bg-elevated px-4 py-2 text-xs font-semibold cc-text-secondary hover:bg-[var(--cc-line)]"
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
                                                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${isHot ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]' : 'bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]'}`}>
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
                                                    <span className="rounded-full bg-[var(--cc-ink)] px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-[var(--cc-paper)]">
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
                                                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--cc-sage)] px-4 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                            <h2 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Tareas de Mantenimiento</h2>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {tasks.map((task: MaintenanceTask) => {
                            const asset = assets.find(a => a.id === task.assetId);
                            return (
                                <div key={task.id} className="bg-[var(--cc-paper)] p-8 rounded-lg border border-[var(--cc-line)] hover:border-[var(--cc-line-strong)] hover:shadow-sm transition-all flex flex-col md:flex-row md:items-center justify-between gap-6 group">
                                    <div className="flex items-center gap-6">
                                        <div className={`h-16 w-16 rounded-lg flex items-center justify-center ${task.status === 'overdue' ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]' : 'bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]'
                                            }`}>
                                            <Wrench className="h-7 w-7" />
                                        </div>
                                        <div className="space-y-1">
                                            <p className="text-[10px] font-semibold text-[var(--cc-copper)] uppercase tracking-widest">{asset?.name}</p>
                                            <h4 className="text-lg font-semibold cc-text-primary">{task.title}</h4>
                                            <p className="text-xs font-medium cc-text-tertiary uppercase tracking-widest flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                Vence: {new Date(task.dueDate).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className={`px-4 py-2 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${task.status === 'completed' ? 'bg-[var(--cc-sage-tint)] text-[var(--cc-sage)]' :
                                            task.priority === 'high' ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]' : 'bg-[var(--cc-paper-warm)] text-[var(--cc-ink-tertiary)]'
                                            }`}>
                                            {task.status === 'completed' ? 'Finalizada' : `Prioridad ${task.priority === 'high' ? 'Alta' : 'Media'}`}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setSelectedTask(task);
                                                setIsDetailOpen(true);
                                            }}
                                            className="p-4 bg-elevated rounded-lg group-hover:bg-[var(--cc-copper)] group-hover:text-white transition-all"
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
                        <h2 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>Historial Reciente</h2>
                    </div>

                    <div className="rounded-2xl border p-8 space-y-8 sm:p-10" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                        {logs.length === 0 && <p className="text-sm cc-text-tertiary">No hay historial reciente.</p>}
                        {logs.map((log: MaintenanceLog, i: number) => (
                            <div key={log.id} className="flex gap-4 relative">
                                {i !== logs.length - 1 && <div className="absolute left-[11px] top-10 bottom-0 w-[2px]" style={{ background: "var(--cc-line)" }} />}
                                <div className="h-6 w-6 shrink-0 rounded-full border-4 z-10" style={{ borderColor: "var(--cc-paper)", background: "var(--cc-copper)" }} />
                                <div className="space-y-1">
                                    <p className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">
                                        {new Date(log.date).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                                    </p>
                                    <p className="text-sm font-medium cc-text-primary">{log.description}</p>
                                    <div className="text-right flex-shrink-0">
                                        <p className="text-sm font-medium cc-text-primary">${(log.cost || 0).toLocaleString('es-CL')}</p>
                                        <p className="text-[10px] font-medium uppercase tracking-widest cc-text-tertiary">Costo</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                        <button className="w-full py-4 text-[10px] font-semibold text-[var(--cc-copper)] uppercase tracking-widest hover:text-[var(--cc-copper)] transition-colors">
                            Ver historial completo
                        </button>
                    </div>
                </div>
            </div>

            {/* Task Detail Dialog */}
            <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
                <DialogContent className="sm:max-w-[550px] bg-[var(--cc-paper)] border-[var(--cc-line)] rounded-lg p-10 shadow-sm">
                    {selectedTask && (
                        <div className="space-y-8">
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <span className={`px-4 py-1.5 rounded-xl text-[10px] font-semibold uppercase tracking-widest ${selectedTask.status === 'overdue' ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]' : 'bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]'
                                        }`}>
                                        {selectedTask.status === 'overdue' ? 'Vencida' : 'Pendiente'}
                                    </span>
                                    <span className="text-xs font-medium cc-text-tertiary">ID: {selectedTask.id}</span>
                                </div>
                                <h3 className="text-3xl font-semibold cc-text-primary leading-tight">{selectedTask.title}</h3>
                                <p className="cc-text-secondary font-medium leading-relaxed">{selectedTask.description}</p>
                            </div>

                            <div className="grid grid-cols-2 gap-6 p-6 bg-elevated/50 rounded-lg">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-medium cc-text-tertiary uppercase tracking-widest">Frecuencia</p>
                                    <p className="font-bold cc-text-primary capitalize">{selectedTask.frequency === 'weekly' ? 'Semanal' : selectedTask.frequency === 'monthly' ? 'Mensual' : selectedTask.frequency === 'quarterly' ? 'Trimestral' : 'Anual'}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-medium cc-text-tertiary uppercase tracking-widest">Vencimiento</p>
                                    <p className="font-bold cc-text-primary">{new Date(selectedTask.dueDate).toLocaleDateString()}</p>
                                </div>
                            </div>

                            <div className="p-4 bg-[var(--cc-copper-tint)] rounded-lg flex gap-3 border border-[rgba(156, 86, 54,0.20)]">
                                <Info className="h-5 w-5 text-[var(--cc-copper)] shrink-0" />
                                <p className="text-[11px] font-medium text-[var(--cc-copper)] leading-relaxed">
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
                                        className="flex-[2] h-16 rounded-lg bg-[var(--cc-copper)] hover:opacity-90 text-white font-semibold shadow-sm shadow-blue-500/20 transition-all"
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
                <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[760px] bg-[var(--cc-paper)] border-[var(--cc-line)] rounded-lg p-8 shadow-sm">
                    {selectedCase && (
                        <div className="space-y-6">
                            <div className="space-y-3 pr-8">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                        {selectedCase.status.replace('_', ' ')}
                                    </span>
                                    <span className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest ${selectedCase.urgency === 'emergencia' || selectedCase.urgency === 'alta' ? 'bg-[var(--cc-rose-tint)] text-[var(--cc-rose)]' : 'bg-[var(--cc-copper-tint)] text-[var(--cc-copper)]'}`}>
                                        {selectedCase.urgency}
                                    </span>
                                    <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary">
                                        {selectedCase.category}
                                    </span>
                                </div>
                                <h3 className="text-2xl leading-none" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-ink)" }}>{selectedCase.title}</h3>
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
                                                    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--cc-sage)]">
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
                                        className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--cc-sage)] px-5 text-xs font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
