"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    AlertTriangle,
    ArrowRight,
    Bot,
    CalendarDays,
    CheckCircle2,
    Download,
    Droplets,
    Gauge,
    Loader2,
    Plus,
    RadioTower,
    ShieldCheck,
    Wrench,
    X,
    Zap,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/authContext";
import { useToast } from "@/components/ui/Toast";

type ServiceRow = {
    id: string;
    service_type?: string | null;
    category?: string | null;
    description?: string | null;
    status?: string | null;
    scheduled_date?: string | null;
    preferred_date?: string | null;
    created_at?: string | null;
};

type CaseRow = {
    id: string;
    title?: string | null;
    category?: string | null;
    urgency?: string | null;
    status?: string | null;
    unit_label?: string | null;
    source_message?: string | null;
    created_at?: string | null;
};

type AssetRow = {
    id: string;
    name?: string | null;
    category?: string | null;
    brand?: string | null;
    model?: string | null;
    location?: string | null;
    health_status?: string | null;
    healthStatus?: string | null;
    next_maintenance?: string | null;
    nextMaintenance?: string | null;
};

type LogRow = {
    id: string;
    description?: string | null;
    cost?: number | null;
    date?: string | null;
    performed_by?: string | null;
};

const fallbackServices: ServiceRow[] = [
    { id: "demo-s1", service_type: "plomeria", description: "Revision preventiva sala de bombas torre A", status: "pending", scheduled_date: new Date().toISOString(), created_at: new Date().toISOString() },
    { id: "demo-s2", service_type: "ascensor", description: "Mantencion mensual ascensor B y prueba de rescate", status: "completed", scheduled_date: new Date().toISOString(), created_at: new Date().toISOString() },
    { id: "demo-s3", service_type: "seguridad", description: "Ajuste de camaras en estacionamiento subterraneo", status: "in-progress", scheduled_date: new Date().toISOString(), created_at: new Date().toISOString() },
];

const fallbackCases: CaseRow[] = [
    { id: "demo-c1", title: "Filtracion reportada en 1204", category: "plomeria", urgency: "alta", status: "open", unit_label: "1204", source_message: "Agua cayendo desde el cielo del bano", created_at: new Date().toISOString() },
    { id: "demo-c2", title: "Ruidos recurrentes fuera de horario", category: "ruido", urgency: "media", status: "in_progress", unit_label: "1505", source_message: "Cuarto reporte del mes", created_at: new Date(Date.now() - 5 * 36e5).toISOString() },
];

const fallbackAssets: AssetRow[] = [
    { id: "demo-a1", name: "Bomba presurizadora A", category: "pump", brand: "Grundfos", model: "CME 10", location: "Sala bombas -1", health_status: "warning", next_maintenance: new Date(Date.now() + 2 * 864e5).toISOString() },
    { id: "demo-a2", name: "Ascensor torre B", category: "elevator", brand: "Otis", model: "Gen2", location: "Torre B", health_status: "optimal", next_maintenance: new Date(Date.now() + 9 * 864e5).toISOString() },
    { id: "demo-a3", name: "Tablero emergencia", category: "electrical", brand: "Schneider", model: "Prisma", location: "Sala electrica", health_status: "critical", next_maintenance: new Date(Date.now() + 864e5).toISOString() },
];

const fallbackLogs: LogRow[] = [
    { id: "demo-l1", description: "Cambio de sello y prueba de presion", cost: 180000, date: new Date().toISOString(), performed_by: "Mantencion interna" },
    { id: "demo-l2", description: "Limpieza de sensores y ajuste de puertas", cost: 95000, date: new Date(Date.now() - 4 * 864e5).toISOString(), performed_by: "Proveedor ascensores" },
];

const categories = ["plomeria", "electrico", "ascensor", "seguridad", "limpieza", "otro"] as const;

function dateLabel(value?: string | null) {
    if (!value) return "Sin fecha";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function money(value: number) {
    return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
}

function statusLabel(status?: string | null) {
    if (status === "completed" || status === "resolved" || status === "closed") return "Resuelto";
    if (status === "in-progress" || status === "in_progress" || status === "accepted") return "En curso";
    if (status === "cancelled") return "Cancelado";
    return "Pendiente";
}

function healthOf(asset: AssetRow) {
    return asset.health_status || asset.healthStatus || "optimal";
}

function serviceTypeOf(item: ServiceRow) {
    return item.service_type || item.category || "otro";
}

function serviceDateOf(item: ServiceRow) {
    return item.scheduled_date || item.preferred_date || item.created_at;
}

export default function MantenimientoAdminPage() {
    const { user } = useAuth();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"operacion" | "activos" | "sensores">("operacion");
    const [services, setServices] = useState<ServiceRow[]>([]);
    const [cases, setCases] = useState<CaseRow[]>([]);
    const [assets, setAssets] = useState<AssetRow[]>([]);
    const [logs, setLogs] = useState<LogRow[]>([]);
    const [showTask, setShowTask] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        title: "",
        description: "",
        service_type: "plomeria",
        scheduled_date: "",
    });

    async function loadData() {
        setLoading(true);
        const [serviceRes, caseRes, assetRes, logRes] = await Promise.allSettled([
            supabase.from("service_requests").select("*").order("created_at", { ascending: false }).limit(12),
            supabase.from("coco_cases").select("id, title, category, urgency, status, unit_label, source_message, created_at").order("created_at", { ascending: false }).limit(12),
            supabase.from("building_assets").select("id, name, category, brand, model, location, health_status, next_maintenance").order("name", { ascending: true }),
            supabase.from("maintenance_logs").select("id, description, cost, date, performed_by").order("date", { ascending: false }).limit(8),
        ]);

        const serviceData = serviceRes.status === "fulfilled" && !serviceRes.value.error ? serviceRes.value.data ?? [] : [];
        const caseData = caseRes.status === "fulfilled" && !caseRes.value.error ? caseRes.value.data ?? [] : [];
        const assetData = assetRes.status === "fulfilled" && !assetRes.value.error ? assetRes.value.data ?? [] : [];
        const logData = logRes.status === "fulfilled" && !logRes.value.error ? logRes.value.data ?? [] : [];

        setServices(serviceData.length ? serviceData : fallbackServices);
        setCases(caseData.length ? caseData : fallbackCases);
        setAssets(assetData.length ? assetData : fallbackAssets);
        setLogs(logData.length ? logData : fallbackLogs);
        setLoading(false);
    }

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        loadData();
    }, []);

    const metrics = useMemo(() => {
        const activeCases = cases.filter(item => !["resolved", "closed", "cancelled"].includes(item.status || ""));
        const criticalCases = activeCases.filter(item => item.urgency === "alta" || item.urgency === "emergencia");
        const completed = services.filter(item => item.status === "completed").length;
        const healthScore = assets.length
            ? Math.round((assets.filter(item => healthOf(item) === "optimal").length / assets.length) * 100)
            : 100;
        const cost = logs.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
        return { activeCases: activeCases.length, criticalCases: criticalCases.length, completed, total: services.length, healthScore, cost };
    }, [assets, cases, logs, services]);

    async function saveTask() {
        if (!form.title.trim() || !form.description.trim()) {
            toast({ title: "Faltan datos", description: "Completa titulo y descripcion.", variant: "destructive" });
            return;
        }

        setSaving(true);
        const { error } = await supabase.from("service_requests").insert({
            requester_id: user?.id,
            unit_id: user?.unitId || "administracion",
            service_type: form.service_type,
            description: `[${form.title}] ${form.description}`,
            status: "pending",
            scheduled_date: form.scheduled_date || null,
            scheduled_time: null,
        });
        setSaving(false);

        if (error) {
            toast({ title: "No se pudo crear", description: error.message, variant: "destructive" });
            return;
        }

        toast({ title: "Tarea creada", description: "Quedo en la cola operativa.", variant: "success" });
        setShowTask(false);
        setForm({ title: "", description: "", service_type: "plomeria", scheduled_date: "" });
        loadData();
    }

    async function closeService(id: string) {
        setServices(prev => prev.map(item => item.id === id ? { ...item, status: "completed" } : item));
        await supabase.from("service_requests").update({ status: "completed" }).eq("id", id);
    }

    function exportCsv() {
        const rows = [
            ["ID", "Tipo", "Estado", "Fecha", "Descripcion"],
            ...services.map(item => [item.id, serviceTypeOf(item), statusLabel(item.status), dateLabel(serviceDateOf(item)), `"${String(item.description || "").replace(/"/g, '""')}"`]),
        ];
        const blob = new Blob([rows.map(row => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `mantenimiento_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return (
        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 md:px-8">
            <header className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
                <section className="overflow-hidden rounded-2xl border border-subtle bg-slate-950 text-white shadow-xl">
                    <div className="grid gap-6 p-6 md:grid-cols-[1fr_auto] md:p-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-3">
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                                    <ShieldCheck className="h-5 w-5" />
                                </span>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-emerald-300">Centro operativo</p>
                                    <h1 className="text-3xl font-black tracking-tight md:text-4xl">Mantenimiento</h1>
                                </div>
                            </div>
                            <p className="max-w-2xl text-sm font-medium leading-6 text-slate-300">
                                Control de casos CoCo, solicitudes tecnicas, activos criticos y sensores. Datos reales cuando existen, fallback demo cuando la base aun esta incompleta.
                            </p>
                        </div>
                        <div className="grid min-w-[220px] grid-cols-2 gap-3">
                            <button onClick={() => setShowTask(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-slate-950 transition-transform active:scale-95">
                                <Plus className="h-4 w-4" />
                                Nueva tarea
                            </button>
                            <button onClick={exportCsv} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-white/10">
                                <Download className="h-4 w-4" />
                                Exportar
                            </button>
                        </div>
                    </div>
                </section>

                <section className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Pulso del edificio</p>
                            <p className="mt-2 text-3xl font-black cc-text-primary">{metrics.healthScore}%</p>
                            <p className="text-xs font-bold cc-text-secondary">Salud global de activos</p>
                        </div>
                        <Gauge className="h-9 w-9 text-emerald-500" />
                    </div>
                    <div className="mt-5 h-2 overflow-hidden rounded-full bg-elevated">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${metrics.healthScore}%` }} />
                    </div>
                </section>
            </header>

            <section className="grid gap-4 md:grid-cols-4">
                <Metric icon={<Bot className="h-5 w-5" />} label="Casos CoCo activos" value={metrics.activeCases} tone="emerald" detail={`${metrics.criticalCases} alta prioridad`} />
                <Metric icon={<Wrench className="h-5 w-5" />} label="Solicitudes cerradas" value={`${metrics.completed}/${metrics.total}`} tone="blue" detail="Ciclo mensual" />
                <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Activos criticos" value={assets.filter(item => healthOf(item) === "critical").length} tone="amber" detail="Requieren seguimiento" />
                <Metric icon={<Activity className="h-5 w-5" />} label="Costo mantencion" value={money(metrics.cost)} tone="slate" detail="Ultimos registros" />
            </section>

            <nav className="flex gap-2 overflow-x-auto border-b border-subtle">
                {[
                    ["operacion", "Operacion"],
                    ["activos", "Activos"],
                    ["sensores", "Sensores"],
                ].map(([key, label]) => (
                    <button
                        key={key}
                        onClick={() => setActiveTab(key as typeof activeTab)}
                        className={`border-b-2 px-4 py-3 text-sm font-black transition-colors ${activeTab === key ? "border-emerald-500 text-emerald-600" : "border-transparent cc-text-secondary hover:text-slate-900"}`}
                    >
                        {label}
                    </button>
                ))}
            </nav>

            {loading ? (
                <div className="flex h-80 items-center justify-center rounded-2xl border border-subtle bg-surface">
                    <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
                </div>
            ) : activeTab === "operacion" ? (
                <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
                    <section className="space-y-4">
                        <SectionTitle icon={<CalendarDays className="h-5 w-5" />} title="Cola operativa" />
                        {services.map(item => (
                            <article key={item.id} className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                    <div className="min-w-0 space-y-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge>{serviceTypeOf(item)}</Badge>
                                            <Badge tone={item.status === "completed" ? "green" : "blue"}>{statusLabel(item.status)}</Badge>
                                            <span className="text-xs font-bold cc-text-tertiary">{dateLabel(serviceDateOf(item))}</span>
                                        </div>
                                        <h3 className="font-black cc-text-primary">{item.description || "Solicitud tecnica"}</h3>
                                    </div>
                                    <button onClick={() => closeService(item.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white disabled:opacity-40" disabled={item.status === "completed"}>
                                        <CheckCircle2 className="h-4 w-4" />
                                        Cerrar
                                    </button>
                                </div>
                            </article>
                        ))}
                    </section>

                    <aside className="space-y-4">
                        <SectionTitle icon={<Bot className="h-5 w-5" />} title="Casos detectados por CoCo" />
                        {cases.map(item => (
                            <article key={item.id} className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                                <div className="mb-3 flex items-center justify-between gap-3">
                                    <Badge tone={item.urgency === "alta" || item.urgency === "emergencia" ? "red" : "blue"}>{item.urgency || "media"}</Badge>
                                    <span className="text-[10px] font-black uppercase tracking-widest cc-text-tertiary">{item.unit_label || "Comunidad"}</span>
                                </div>
                                <h3 className="font-black cc-text-primary">{item.title || "Caso operativo"}</h3>
                                <p className="mt-2 line-clamp-2 text-sm font-medium cc-text-secondary">{item.source_message || item.category || "Sin detalle adicional."}</p>
                            </article>
                        ))}
                    </aside>
                </div>
            ) : activeTab === "activos" ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {assets.map(asset => {
                        const health = healthOf(asset);
                        return (
                            <article key={asset.id} className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                                <div className="mb-6 flex items-start justify-between gap-4">
                                    <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${health === "critical" ? "bg-rose-50 text-rose-600" : health === "warning" ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                                        {asset.category === "pump" ? <Droplets className="h-5 w-5" /> : asset.category === "electrical" ? <Zap className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
                                    </div>
                                    <Badge tone={health === "critical" ? "red" : health === "warning" ? "amber" : "green"}>{health}</Badge>
                                </div>
                                <h3 className="text-lg font-black cc-text-primary">{asset.name || "Activo tecnico"}</h3>
                                <p className="mt-1 text-sm font-bold cc-text-secondary">{asset.brand} {asset.model}</p>
                                <p className="mt-4 text-xs font-bold uppercase tracking-widest cc-text-tertiary">{asset.location || "Sin ubicacion"}</p>
                                <div className="mt-5 flex items-center justify-between rounded-xl bg-elevated px-4 py-3">
                                    <span className="text-xs font-black cc-text-secondary">Proxima revision</span>
                                    <span className="text-xs font-black cc-text-primary">{dateLabel(asset.next_maintenance || asset.nextMaintenance)}</span>
                                </div>
                            </article>
                        );
                    })}
                </div>
            ) : (
                <div className="grid gap-4 md:grid-cols-3">
                    {[
                        ["SN-AGUA-402", "Sensor de agua", "Depto 402", "98%", <Droplets key="d" className="h-5 w-5" />],
                        ["ASC-B-MOTOR", "Telemetria ascensor", "Torre B", "Online", <RadioTower key="r" className="h-5 w-5" />],
                        ["TAB-EMERG-01", "Tablero emergencia", "Sala electrica", "Revision", <Zap key="z" className="h-5 w-5" />],
                    ].map(([id, title, location, status, icon]) => (
                        <article key={String(id)} className="rounded-2xl border border-subtle bg-surface p-6 shadow-sm">
                            <div className="mb-5 flex items-center justify-between">
                                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">{icon}</span>
                                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                            </div>
                            <h3 className="font-black cc-text-primary">{title}</h3>
                            <p className="mt-1 text-sm font-bold cc-text-secondary">{id}</p>
                            <div className="mt-5 flex items-center justify-between text-xs font-black">
                                <span className="cc-text-tertiary">{location}</span>
                                <span className="text-emerald-600">{status}</span>
                            </div>
                        </article>
                    ))}
                </div>
            )}

            {showTask && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={() => setShowTask(false)}>
                    <div className="w-full max-w-lg rounded-2xl border border-subtle bg-surface p-6 shadow-2xl" onClick={event => event.stopPropagation()}>
                        <div className="mb-6 flex items-center justify-between">
                            <h2 className="text-xl font-black cc-text-primary">Nueva tarea</h2>
                            <button onClick={() => setShowTask(false)} className="rounded-xl p-2 hover:bg-elevated"><X className="h-5 w-5" /></button>
                        </div>
                        <div className="space-y-4">
                            <input value={form.title} onChange={event => setForm(prev => ({ ...prev, title: event.target.value }))} className="w-full rounded-xl border border-subtle bg-elevated px-4 py-3 text-sm font-bold outline-none" placeholder="Titulo" />
                            <textarea value={form.description} onChange={event => setForm(prev => ({ ...prev, description: event.target.value }))} className="h-28 w-full resize-none rounded-xl border border-subtle bg-elevated px-4 py-3 text-sm font-bold outline-none" placeholder="Descripcion del trabajo" />
                            <div className="grid grid-cols-2 gap-3">
                                <select value={form.service_type} onChange={event => setForm(prev => ({ ...prev, service_type: event.target.value }))} className="rounded-xl border border-subtle bg-elevated px-4 py-3 text-sm font-bold outline-none">
                                    {categories.map(category => <option key={category} value={category}>{category}</option>)}
                                </select>
                                <input type="date" value={form.scheduled_date} onChange={event => setForm(prev => ({ ...prev, scheduled_date: event.target.value }))} className="rounded-xl border border-subtle bg-elevated px-4 py-3 text-sm font-bold outline-none" />
                            </div>
                            <button onClick={saveTask} disabled={saving} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 text-sm font-black text-white disabled:opacity-50">
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                                Crear tarea
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Metric({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: React.ReactNode; detail: string; tone: "emerald" | "blue" | "amber" | "slate" }) {
    const colors = {
        emerald: "bg-emerald-50 text-emerald-600",
        blue: "bg-blue-50 text-blue-600",
        amber: "bg-amber-50 text-amber-600",
        slate: "bg-slate-100 text-slate-700",
    };

    return (
        <article className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
            <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${colors[tone]}`}>{icon}</div>
            <p className="text-2xl font-black cc-text-primary">{value}</p>
            <p className="text-xs font-black uppercase tracking-wide cc-text-secondary">{label}</p>
            <p className="mt-2 text-xs font-bold cc-text-tertiary">{detail}</p>
        </article>
    );
}

function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "blue" | "green" | "red" | "amber" }) {
    const colors = {
        slate: "bg-slate-100 text-slate-600",
        blue: "bg-blue-50 text-blue-600",
        green: "bg-emerald-50 text-emerald-600",
        red: "bg-rose-50 text-rose-600",
        amber: "bg-amber-50 text-amber-600",
    };

    return <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${colors[tone]}`}>{children}</span>;
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-elevated cc-text-primary">{icon}</span>
            <h2 className="text-xl font-black cc-text-primary">{title}</h2>
            <ArrowRight className="h-4 w-4 text-slate-300" />
        </div>
    );
}
