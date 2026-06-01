"use client";

import { useEffect, useMemo, useState } from "react";
import {
    Activity,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Database,
    RefreshCw,
    Server,
    ShieldCheck,
    Signal,
    Zap,
} from "lucide-react";
import { useAuth } from "@/lib/authContext";

type OperationEvent = {
    id: string;
    action: string;
    entity_type: string;
    entity_id?: string | null;
    severity: "info" | "success" | "warning" | "error";
    status: "success" | "error" | "blocked" | "pending";
    summary: string;
    metadata?: Record<string, unknown> | null;
    created_at: string;
};

type OperationsResponse = {
    summary: {
        total: number;
        success: number;
        warnings: number;
        errors: number;
        pending: number;
    };
    events: OperationEvent[];
};

type HealthResponse = {
    status?: string;
    checkedAt?: string;
    checks?: Record<string, Record<string, boolean>>;
};


function statusTone(status: OperationEvent["status"], severity: OperationEvent["severity"]) {
    if (status === "error" || severity === "error") return "border-danger-border bg-danger-bg text-danger-fg";
    if (status === "blocked" || severity === "warning") return "border-warning-border bg-warning-bg text-warning-fg";
    if (status === "pending") return "border-brand-200 bg-brand-50 text-brand-700";
    return "border-success-border bg-success-bg text-success-fg";
}

function statusLabel(status: OperationEvent["status"]) {
    if (status === "blocked") return "Bloqueado";
    if (status === "pending") return "Pendiente";
    if (status === "error") return "Error";
    return "Exitoso";
}

function timeAgo(value: string) {
    const date = new Date(value);
    const diff = Date.now() - date.getTime();
    if (Number.isNaN(diff)) return "Sin fecha";
    const minutes = Math.round(diff / 60000);
    if (minutes < 2) return "Ahora";
    if (minutes < 60) return `Hace ${minutes} min`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `Hace ${hours} h`;
    return date.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
}

function countHealthyChecks(health: HealthResponse | null) {
    const groups = Object.values(health?.checks || {});
    const total = groups.flatMap(group => Object.values(group)).length;
    const ok = groups.flatMap(group => Object.values(group)).filter(Boolean).length;
    return { ok, total };
}

export default function AdminOperationsPage() {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [events, setEvents] = useState<OperationEvent[]>([]);
    const [summary, setSummary] = useState<OperationsResponse["summary"]>({
        total: 0,
        success: 0,
        warnings: 0,
        errors: 0,
        pending: 0,
    });
    const [health, setHealth] = useState<HealthResponse | null>(null);

    async function load() {
        setLoading(true);
        setError("");


        try {
            const [opsRes, healthRes] = await Promise.all([
                fetch("/api/operations/events?limit=80", { cache: "no-store" }),
                fetch("/api/health", { cache: "no-store" }),
            ]);

            if (!opsRes.ok) {
                const data = await opsRes.json().catch(() => ({}));
                throw new Error(data.error || "No se pudo cargar el centro operativo");
            }

            const ops = await opsRes.json() as OperationsResponse;
            const healthData = await healthRes.json().catch(() => null) as HealthResponse | null;

            setEvents(ops.events);
            setSummary(ops.summary);
            setHealth(healthData);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Error desconocido");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        if (!user) return;
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const healthyChecks = useMemo(() => countHealthyChecks(health), [health]);
    const grouped = useMemo(() => {
        return events.reduce<Record<string, number>>((acc, event) => {
            acc[event.action] = (acc[event.action] || 0) + 1;
            return acc;
        }, {});
    }, [events]);
    const topActions = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6">
            <header className="flex flex-col gap-5 border-b border-subtle pb-6 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="inline-flex items-center gap-2 rounded-md bg-brand-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                        <Activity className="h-3.5 w-3.5" />
                        Operacion comercial
                    </p>
                    <h1 className="mt-3 text-3xl font-semibold cc-text-primary">Centro operativo</h1>
                    <p className="mt-2 max-w-3xl text-sm leading-6 cc-text-secondary">
                        Revisa acciones criticas, salud de integraciones y eventos que explican que paso, quien lo hizo y que queda pendiente.
                    </p>
                </div>

                <button
                    onClick={load}
                    disabled={loading}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-subtle bg-surface px-4 py-2.5 text-sm font-semibold cc-text-primary shadow-sm transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                    Actualizar
                </button>
            </header>

            {error && (
                <div className="rounded-lg border border-danger-border bg-danger-bg p-4 text-sm font-semibold text-danger-fg">
                    {error}
                </div>
            )}

            <section className="grid gap-4 md:grid-cols-4">
                <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Eventos 24h</span>
                        <Signal className="h-4 w-4 text-brand-600" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold cc-text-primary">{summary.total}</p>
                    <p className="mt-1 text-xs cc-text-secondary">Acciones registradas</p>
                </div>

                <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Correctas</span>
                        <CheckCircle2 className="h-4 w-4 text-success-fg" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold cc-text-primary">{summary.success}</p>
                    <p className="mt-1 text-xs cc-text-secondary">Flujos completados</p>
                </div>

                <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Revisar</span>
                        <AlertTriangle className="h-4 w-4 text-warning-fg" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold cc-text-primary">{summary.warnings + summary.pending}</p>
                    <p className="mt-1 text-xs cc-text-secondary">Pendientes o alertas</p>
                </div>

                <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                    <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[0.14em] cc-text-secondary">Integraciones</span>
                        <Database className="h-4 w-4 text-slate-500" />
                    </div>
                    <p className="mt-4 text-3xl font-semibold cc-text-primary">{healthyChecks.ok}/{healthyChecks.total || 0}</p>
                    <p className="mt-1 text-xs cc-text-secondary">Checks configurados</p>
                </div>
            </section>

            <section className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
                <div className="rounded-lg border border-subtle bg-surface shadow-sm">
                    <div className="flex flex-col gap-2 border-b border-subtle p-5 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold cc-text-primary">Bitacora operacional</h2>
                            <p className="mt-1 text-sm cc-text-secondary">Ultimos eventos criticos de la comunidad.</p>
                        </div>
                        <span className="inline-flex w-fit items-center gap-2 rounded-md border border-subtle bg-canvas px-3 py-1.5 text-xs font-semibold cc-text-secondary">
                            <Clock className="h-3.5 w-3.5" />
                            Tiempo real por recarga
                        </span>
                    </div>

                    <div className="divide-y divide-subtle">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="p-5">
                                    <div className="h-4 w-2/3 animate-pulse rounded bg-elevated" />
                                    <div className="mt-3 h-3 w-1/3 animate-pulse rounded bg-elevated" />
                                </div>
                            ))
                        ) : events.length === 0 ? (
                            <div className="p-10 text-center">
                                <Server className="mx-auto h-8 w-8 cc-text-tertiary" />
                                <h3 className="mt-4 text-base font-semibold cc-text-primary">Aun no hay eventos operativos</h3>
                                <p className="mt-1 text-sm cc-text-secondary">Cuando se creen votaciones, cargas, servicios o envios, quedaran auditados aqui.</p>
                            </div>
                        ) : (
                            events.map(event => (
                                <article key={event.id} className="grid gap-4 p-5 md:grid-cols-[1fr_auto]">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`rounded-md border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.12em] ${statusTone(event.status, event.severity)}`}>
                                                {statusLabel(event.status)}
                                            </span>
                                            <span className="text-xs font-semibold cc-text-tertiary">{event.action}</span>
                                        </div>
                                        <h3 className="mt-3 text-base font-semibold cc-text-primary">{event.summary}</h3>
                                        <p className="mt-1 text-sm cc-text-secondary">
                                            {event.entity_type}{event.entity_id ? ` - ${event.entity_id.slice(0, 8)}` : ""}
                                        </p>
                                    </div>
                                    <div className="text-left md:text-right">
                                        <p className="text-sm font-semibold cc-text-primary">{timeAgo(event.created_at)}</p>
                                        <p className="mt-1 text-xs cc-text-tertiary">
                                            {new Date(event.created_at).toLocaleString("es-CL", { dateStyle: "medium", timeStyle: "short" })}
                                        </p>
                                    </div>
                                </article>
                            ))
                        )}
                    </div>
                </div>

                <aside className="space-y-5">
                    <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <ShieldCheck className="h-5 w-5 text-success-fg" />
                            <h2 className="text-lg font-semibold cc-text-primary">Salud plataforma</h2>
                        </div>
                        <p className="mt-2 text-sm cc-text-secondary">
                            Estado actual: <span className="font-semibold cc-text-primary">{health?.status || "sin datos"}</span>
                        </p>
                        <div className="mt-5 space-y-3">
                            {Object.entries(health?.checks || {}).map(([group, checks]) => (
                                <div key={group}>
                                    <p className="text-[11px] font-bold uppercase tracking-[0.14em] cc-text-tertiary">{group}</p>
                                    <div className="mt-2 space-y-1.5">
                                        {Object.entries(checks).map(([key, ok]) => (
                                            <div key={key} className="flex items-center justify-between rounded-md bg-canvas px-3 py-2 text-sm">
                                                <span className="cc-text-secondary">{key}</span>
                                                <span className={ok ? "font-semibold text-success-fg" : "font-semibold text-warning-fg"}>
                                                    {ok ? "OK" : "Pendiente"}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-lg border border-subtle bg-surface p-5 shadow-sm">
                        <div className="flex items-center gap-3">
                            <Zap className="h-5 w-5 text-brand-600" />
                            <h2 className="text-lg font-semibold cc-text-primary">Acciones frecuentes</h2>
                        </div>
                        <div className="mt-4 space-y-2">
                            {topActions.length ? topActions.map(([action, count]) => (
                                <div key={action} className="flex items-center justify-between rounded-md border border-subtle px-3 py-2 text-sm">
                                    <span className="truncate cc-text-secondary">{action}</span>
                                    <span className="font-semibold cc-text-primary">{count}</span>
                                </div>
                            )) : (
                                <p className="text-sm cc-text-secondary">Sin actividad suficiente todavia.</p>
                            )}
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}
