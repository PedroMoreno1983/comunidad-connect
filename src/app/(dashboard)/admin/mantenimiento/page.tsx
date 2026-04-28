"use client";

import { useState, useEffect } from "react";
import { AssetInventory } from "@/components/admin/AssetInventory";
import { MaintenanceDashboard } from "@/components/admin/MaintenanceDashboard";
import {
    Wrench, ClipboardList, Activity,
    Plus, Download, Filter, Search,
    BarChart3, ShieldCheck, HeartPulse, DollarSign, X, Loader2
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/components/ui/Toast";
import { useAuth } from "@/lib/authContext";

interface MaintenanceKPIs {
    healthPct: number;
    completedThisMonth: number;
    totalThisMonth: number;
    operatingCost: number;
}

const CATEGORIES = ['plomería', 'eléctrico', 'cerrajería', 'limpieza', 'pintura', 'jardinería', 'ascensor', 'otro'] as const;
const PRIORITIES = ['urgente', 'alta', 'media', 'baja'] as const;

export default function MantenimientoAdminPage() {
    const [activeTab, setActiveTab] = useState<'overview' | 'assets' | 'iot'>('overview');
    const [kpis, setKpis] = useState<MaintenanceKPIs | null>(null);
    const { toast } = useToast();
    const { user } = useAuth();

    // Nueva Tarea modal
    const [showNewTask, setShowNewTask] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        title: '',
        description: '',
        category: 'otro' as typeof CATEGORIES[number],
        priority: 'media' as typeof PRIORITIES[number],
        scheduled_date: '',
        estimated_cost: '',
    });

    const handleExport = async () => {
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const { data, error } = await supabase
            .from('service_requests')
            .select('id, category, description, status, estimated_cost, created_at')
            .gte('created_at', monthStart)
            .order('created_at', { ascending: false });

        if (error || !data?.length) {
            toast({ title: 'Sin datos', description: 'No hay solicitudes este mes para exportar.', variant: 'destructive' });
            return;
        }

        const headers = ['ID', 'Categoría', 'Descripción', 'Estado', 'Costo Est.', 'Fecha'];
        const rows = data.map((r: Record<string, string | number | null>) => [
            r.id, r.category, `"${String(r.description ?? '').replace(/"/g, '""')}"`,
            r.status, r.estimated_cost ?? 0,
            new Date(r.created_at as string).toLocaleDateString('es-CL')
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mantenimiento_${now.toISOString().slice(0,7)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        toast({ title: 'Reporte exportado', variant: 'success' });
    };

    const handleSaveTask = async () => {
        if (!form.title.trim() || !form.description.trim()) {
            toast({ title: 'Campos requeridos', description: 'Título y descripción son obligatorios.', variant: 'destructive' });
            return;
        }
        setSaving(true);
        const { error } = await supabase.from('service_requests').insert({
            category: form.category,
            description: `[${form.title}] ${form.description}`,
            status: 'pending',
            priority: form.priority,
            scheduled_date: form.scheduled_date || null,
            estimated_cost: form.estimated_cost ? Number(form.estimated_cost) : null,
            requester_id: user?.id,
        });
        setSaving(false);
        if (error) {
            toast({ title: 'Error al guardar', description: error.message, variant: 'destructive' });
        } else {
            toast({ title: 'Tarea creada', variant: 'success' });
            setShowNewTask(false);
            setForm({ title: '', description: '', category: 'otro', priority: 'media', scheduled_date: '', estimated_cost: '' });
            // Refresca KPIs
            const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
            const [allRes, monthRes] = await Promise.all([
                supabase.from('service_requests').select('status, estimated_cost'),
                supabase.from('service_requests').select('status, estimated_cost').gte('created_at', monthStart),
            ]);
            if (!allRes.error && !monthRes.error) {
                const all = allRes.data ?? [];
                const month = monthRes.data ?? [];
                const completed = all.filter((r: { status: string }) => r.status === 'completed').length;
                setKpis({
                    healthPct: all.length > 0 ? Math.round((completed / all.length) * 100) : 100,
                    completedThisMonth: month.filter((r: { status: string }) => r.status === 'completed').length,
                    totalThisMonth: month.length,
                    operatingCost: month.reduce((s: number, r: { estimated_cost?: number }) => s + (Number(r.estimated_cost) || 0), 0),
                });
            }
        }
    };

    useEffect(() => {
        const fetchKPIs = async () => {
            const now = new Date();
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

            const [allRes, monthRes] = await Promise.all([
                supabase.from('service_requests').select('status, estimated_cost'),
                supabase.from('service_requests').select('status, estimated_cost').gte('created_at', monthStart),
            ]);

            if (allRes.error || monthRes.error) return;

            const all = allRes.data ?? [];
            const month = monthRes.data ?? [];

            const completed = all.filter((r: { status: string }) => r.status === 'completed').length;
            const healthPct = all.length > 0 ? Math.round((completed / all.length) * 100) : 100;

            const completedMonth = month.filter((r: { status: string }) => r.status === 'completed').length;

            const operatingCost = month.reduce((sum: number, r: { estimated_cost?: number }) => {
                return sum + (Number(r.estimated_cost) || 0);
            }, 0);

            setKpis({ healthPct, completedThisMonth: completedMonth, totalThisMonth: month.length, operatingCost });
        };

        fetchKPIs();
    }, []);

    return (
        <div className="max-w-7xl mx-auto py-10 px-4 md:px-8 space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
                <div className="space-y-2">
                    <h2 className="text-[10px] font-black text-blue-600 dark:text-blue-400 uppercase tracking-[0.3em]">Operaciones Técnicas</h2>
                    <h1 className="text-4xl font-black cc-text-primary">Mantenimiento Preventivo</h1>
                </div>

                <div className="flex items-center gap-4">
                    <button onClick={handleExport} className="flex items-center gap-3 px-8 py-4 bg-surface cc-text-primary font-black rounded-2xl border border-subtle hover:bg-slate-50 transition-all shadow-xl active:scale-95">
                        <Download className="h-5 w-5 text-blue-600" />
                        Exportar Reporte
                    </button>
                    <button onClick={() => setShowNewTask(true)} className="flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-slate-800 text-white font-black rounded-2xl hover:bg-slate-800 transition-all shadow-xl active:scale-95">
                        <Plus className="h-5 w-5" />
                        Nueva Tarea
                    </button>
                </div>
            </div>

            {/* Administrative Management KPIs (Differentiated View) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none relative overflow-hidden group">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-success-bg rounded-2xl text-emerald-600">
                            <HeartPulse className="h-6 w-6" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest leading-tight">Salud Global Infraestructura</h3>
                    </div>
                    <div className="flex items-end gap-3">
                        <p className="text-4xl font-black cc-text-primary">{kpis ? `${kpis.healthPct}%` : '—'}</p>
                        <span className={`text-xs font-bold mb-1.5 uppercase tracking-widest ${(kpis?.healthPct ?? 0) >= 80 ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {(kpis?.healthPct ?? 0) >= 80 ? 'Óptimo' : 'Atención'}
                        </span>
                    </div>
                    <div className="mt-4 h-1.5 w-full bg-elevated rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: kpis ? `${kpis.healthPct}%` : '0%' }}
                            className={`h-full ${(kpis?.healthPct ?? 0) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        />
                    </div>
                </div>

                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-blue-50 dark:bg-blue-500/10 rounded-2xl text-blue-600">
                            <BarChart3 className="h-6 w-6" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest leading-tight">Mantenimientos al Día</h3>
                    </div>
                    <p className="text-4xl font-black cc-text-primary">
                        {kpis ? `${kpis.completedThisMonth}/${kpis.totalThisMonth}` : '—'}
                    </p>
                    <p className="text-[10px] font-bold cc-text-tertiary uppercase tracking-widest mt-2">
                        {kpis && kpis.totalThisMonth > 0
                            ? `${Math.round((kpis.completedThisMonth / kpis.totalThisMonth) * 100)}% cumplimiento mensual`
                            : 'Sin solicitudes este mes'}
                    </p>
                </div>

                <div className="bg-surface p-8 rounded-[2.5rem] border border-subtle shadow-xl shadow-slate-200/20 dark:shadow-none">
                    <div className="flex items-center gap-4 mb-4">
                        <div className="p-3 bg-role-admin-bg rounded-2xl text-brand-600">
                            <DollarSign className="h-6 w-6" />
                        </div>
                        <h3 className="font-black cc-text-primary uppercase text-[10px] tracking-widest leading-tight">Gasto Operativo Mes</h3>
                    </div>
                    <p className="text-4xl font-black cc-text-primary">
                        {kpis ? (kpis.operatingCost > 0 ? `$${(kpis.operatingCost / 1000).toFixed(0)}k` : '$0') : '—'}
                    </p>
                    <p className="text-[10px] font-bold cc-text-tertiary uppercase tracking-widest mt-2">Basado en solicitudes del mes</p>
                </div>

                <div className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl relative overflow-hidden group border border-white/10">
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:rotate-12 transition-transform duration-500">
                        <ShieldCheck className="h-20 w-20 text-white" />
                    </div>
                    <div className="relative z-10 space-y-4">
                        <div>
                            <h3 className="font-black text-white text-sm">Seguros & Certificaciones</h3>
                            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest">Al día</p>
                        </div>
                        <div className="pt-2">
                            <button className="text-[10px] font-black text-white uppercase tracking-widest border-b border-white/20 hover:border-white transition-all pb-1">Ver certificados</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Tabs System */}
            <div className="flex items-center gap-8 border-b border-subtle px-4">
                <button
                    onClick={() => setActiveTab('overview')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'overview' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                >
                    Vista General
                    {activeTab === 'overview' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('assets')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'assets' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                        }`}
                >
                    Inventario de Activos
                    {activeTab === 'assets' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-blue-600 rounded-full" />
                    )}
                </button>
                <button
                    onClick={() => setActiveTab('iot')}
                    className={`pb-6 text-sm font-black uppercase tracking-widest transition-all relative ${activeTab === 'iot' ? 'text-indigo-600' : 'text-slate-400 hover:text-indigo-600'
                        }`}
                >
                    Sensores IoT
                    {activeTab === 'iot' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-1 bg-brand-600 rounded-full" />
                    )}
                </button>
            </div>

            {/* Content Rendering */}
            <div className="min-h-[600px]">
                <ErrorBoundary name="Maintenance Tab Error">
                <AnimatePresence mode="wait">
                    {activeTab === 'overview' ? (
                        <motion.div
                            key="overview"
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                        >
                            <MaintenanceDashboard />
                        </motion.div>
                    ) : activeTab === 'assets' ? (
                        <motion.div
                            key="assets"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="space-y-8">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-elevated rounded-2xl">
                                            <Activity className="h-6 w-6 cc-text-primary" />
                                        </div>
                                        <h2 className="text-2xl font-black cc-text-primary">Equipamiento Crítico</h2>
                                    </div>
                                    <div className="flex items-center gap-4 h-12">
                                        <div className="relative">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                            <input
                                                className="h-full pl-12 pr-6 bg-surface border border-subtle rounded-2xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                                placeholder="Buscar activo..."
                                            />
                                        </div>
                                        <button className="h-full px-6 bg-elevated rounded-2xl text-slate-500 hover:bg-slate-200 transition-colors">
                                            <Filter className="h-4 w-4" />
                                        </button>
                                    </div>
                                </div>
                                <AssetInventory />
                            </div>
                        </motion.div>
                    ) : (
                        <motion.div
                            key="iot"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <div className="space-y-8">
                                <div className="flex items-center justify-between px-2">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-role-admin-bg rounded-2xl">
                                            <Activity className="h-6 w-6 text-role-admin-fg" />
                                        </div>
                                        <h2 className="text-2xl font-black cc-text-primary">Hub IoT & Nodos Activos</h2>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {/* Shelly Mock */}
                                    <div className="p-6 rounded-3xl border border-subtle bg-surface shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Sensor de Agua</span>
                                                </div>
                                                <h3 className="font-bold cc-text-primary">SN-AGUA-402</h3>
                                            </div>
                                            <span className="px-3 py-1 bg-elevated rounded-full text-xs font-bold cc-text-secondary">
                                                Depto 402
                                            </span>
                                        </div>
                                        <p className="text-sm cc-text-secondary mb-6 font-medium">Batería: 98% • Señal: Excelente</p>
                                        <button
                                            onClick={async () => {
                                                try {
                                                    const res = await fetch('/api/iot/test-trigger', {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({
                                                            sensor_id: 'SN-AGUA-402',
                                                            type: 'FILTRACION_CRITICA',
                                                            unit_id: '402',
                                                            community_id: '1',
                                                            severity: 'URGENTE',
                                                            location_detail: 'Cocina - Lavaplatos'
                                                        })
                                                    });
                                                    if (res.ok) {
                                                        toast({ title: 'Evento enviado', description: 'CoCo activado. Revisa el panel de mantención.' });
                                                    } else {
                                                        toast({ title: 'Error', description: 'No se pudo enviar el evento de prueba.', variant: 'destructive' });
                                                    }
                                                } catch(e) { console.error(e); }
                                            }}
                                            className="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-500/10 dark:hover:bg-red-500/20 dark:text-red-400 rounded-xl font-bold transition-all text-sm flex justify-center items-center gap-2"
                                        >
                                            <HeartPulse className="h-4 w-4" />
                                            Test: Simular Filtración
                                        </button>
                                    </div>
                                    
                                    {/* Smart Lock Mock */}
                                    <div className="p-6 rounded-3xl border border-subtle bg-surface shadow-sm relative overflow-hidden">
                                        <div className="flex justify-between items-start mb-6">
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cerradura Inteligente</span>
                                                </div>
                                                <h3 className="font-bold cc-text-primary">LK-MAIN-402</h3>
                                            </div>
                                            <span className="px-3 py-1 bg-elevated rounded-full text-xs font-bold cc-text-secondary">
                                                Depto 402
                                            </span>
                                        </div>
                                        <p className="text-sm cc-text-secondary font-medium">Estado: Cerrado (Seguro)</p>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                </ErrorBoundary>
            </div>

            {/* Modal: Nueva Tarea */}
            <AnimatePresence>
                {showNewTask && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
                        onClick={() => setShowNewTask(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.92, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.92, opacity: 0, y: 20 }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="bg-surface rounded-3xl shadow-2xl border border-subtle w-full max-w-lg"
                            onClick={e => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-6 border-b border-subtle">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-blue-50 dark:bg-blue-500/10 rounded-xl">
                                        <Wrench className="h-5 w-5 text-blue-600" />
                                    </div>
                                    <h2 className="text-xl font-black cc-text-primary">Nueva Tarea de Mantenimiento</h2>
                                </div>
                                <button onClick={() => setShowNewTask(false)} className="p-2 hover:bg-elevated rounded-xl transition-colors">
                                    <X className="h-5 w-5 cc-text-secondary" />
                                </button>
                            </div>

                            <div className="p-6 space-y-4">
                                <div>
                                    <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Título *</label>
                                    <input
                                        value={form.title}
                                        onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                        placeholder="Ej: Revisar bomba de agua"
                                        className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Descripción *</label>
                                    <textarea
                                        value={form.description}
                                        onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                        placeholder="Detalla el trabajo a realizar..."
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Categoría</label>
                                        <select
                                            value={form.category}
                                            onChange={e => setForm(f => ({ ...f, category: e.target.value as typeof CATEGORIES[number] }))}
                                            className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Prioridad</label>
                                        <select
                                            value={form.priority}
                                            onChange={e => setForm(f => ({ ...f, priority: e.target.value as typeof PRIORITIES[number] }))}
                                            className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        >
                                            {PRIORITIES.map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                                        </select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Fecha Programada</label>
                                        <input
                                            type="date"
                                            value={form.scheduled_date}
                                            onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))}
                                            className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black cc-text-secondary uppercase tracking-widest mb-1.5">Costo Estimado ($)</label>
                                        <input
                                            type="number"
                                            value={form.estimated_cost}
                                            onChange={e => setForm(f => ({ ...f, estimated_cost: e.target.value }))}
                                            placeholder="0"
                                            min="0"
                                            className="w-full px-4 py-3 rounded-xl border border-subtle bg-elevated text-sm font-medium cc-text-primary focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3 p-6 pt-0">
                                <button onClick={() => setShowNewTask(false)} className="flex-1 py-3 rounded-xl border border-subtle cc-text-secondary font-bold text-sm hover:bg-elevated transition-colors">
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleSaveTask}
                                    disabled={saving}
                                    className="flex-1 py-3 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-black text-sm hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> : <><ClipboardList className="h-4 w-4" /> Crear Tarea</>}
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
