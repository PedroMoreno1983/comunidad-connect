"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabase";
import {
    AlertTriangle,
    Bot,
    CheckCircle2,
    Clock,
    MessageSquare,
    ShieldAlert,
    Wrench
} from "lucide-react";

type CoCoCase = {
    id: string;
    title: string;
    type: string;
    category: string;
    urgency: "baja" | "media" | "alta" | "emergencia";
    action: string;
    status: "open" | "in_progress" | "resolved" | "closed" | "cancelled";
    reason: string | null;
    source_message: string;
    assistant_reply: string | null;
    unit_label: string | null;
    created_at: string;
    updated_at: string;
};

type CoCoCaseEvent = {
    id: string;
    case_id: string;
    event_type: "created" | "status_changed" | "comment" | "system";
    from_status: string | null;
    to_status: string | null;
    body: string | null;
    actor_role: string | null;
    created_at: string;
};

const statusCopy: Record<CoCoCase["status"], { label: string; icon: typeof Clock; className: string }> = {
    open: {
        label: "Recibido",
        icon: Clock,
        className: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:border-amber-500/30",
    },
    in_progress: {
        label: "En revision",
        icon: Wrench,
        className: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/10 dark:text-blue-300 dark:border-blue-500/30",
    },
    resolved: {
        label: "Resuelto",
        icon: CheckCircle2,
        className: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:border-emerald-500/30",
    },
    closed: {
        label: "Cerrado",
        icon: CheckCircle2,
        className: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/10 dark:text-slate-300 dark:border-slate-500/30",
    },
    cancelled: {
        label: "Cancelado",
        icon: AlertTriangle,
        className: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:border-rose-500/30",
    },
};

const urgencyClass: Record<CoCoCase["urgency"], string> = {
    baja: "bg-slate-100 text-slate-600 dark:bg-slate-500/10 dark:text-slate-300",
    media: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300",
    alta: "bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300",
    emergencia: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300",
};

function uniqueCases(cases: CoCoCase[]) {
    return Array.from(new Map(cases.map(item => [item.id, item])).values())
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export default function ResidentCasesPage() {
    const { user } = useAuth();
    const [cases, setCases] = useState<CoCoCase[]>([]);
    const [eventsByCase, setEventsByCase] = useState<Record<string, CoCoCaseEvent[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCases = async () => {
            if (!user) return;
            setLoading(true);

            const select = "id, title, type, category, urgency, action, status, reason, source_message, assistant_reply, unit_label, created_at, updated_at";
            const queries = [
                supabase
                    .from("coco_cases")
                    .select(select)
                    .eq("user_id", user.id)
                    .order("created_at", { ascending: false })
                    .limit(30),
            ];

            if (user.unitId) {
                queries.push(
                    supabase
                        .from("coco_cases")
                        .select(select)
                        .eq("unit_id", user.unitId)
                        .order("created_at", { ascending: false })
                        .limit(30)
                );
            }

            const results = await Promise.all(queries);
            const rows = results.flatMap(result => (result.data || []) as CoCoCase[]);
            const uniqueRows = uniqueCases(rows);
            setCases(uniqueRows);

            if (uniqueRows.length > 0) {
                const { data: events } = await supabase
                    .from("coco_case_events")
                    .select("id, case_id, event_type, from_status, to_status, body, actor_role, created_at")
                    .in("case_id", uniqueRows.map(item => item.id))
                    .order("created_at", { ascending: false });

                const grouped = ((events || []) as CoCoCaseEvent[]).reduce<Record<string, CoCoCaseEvent[]>>((acc, event) => {
                    acc[event.case_id] ||= [];
                    acc[event.case_id].push(event);
                    return acc;
                }, {});
                setEventsByCase(grouped);
            } else {
                setEventsByCase({});
            }
            setLoading(false);
        };

        fetchCases().catch(error => {
            console.error("[ResidentCasesPage] load error:", error);
            setLoading(false);
        });
    }, [user]);

    const summary = useMemo(() => ({
        open: cases.filter(item => item.status === "open" || item.status === "in_progress").length,
        hot: cases.filter(item => item.urgency === "alta" || item.urgency === "emergencia").length,
        resolved: cases.filter(item => item.status === "resolved" || item.status === "closed").length,
    }), [cases]);

    if (!user) return null;

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-600">
                        Seguimiento CoCo
                    </p>
                    <h1 className="text-3xl font-black cc-text-primary md:text-4xl">Mis Casos CoCo</h1>
                    <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                        Revisa los reportes que CoCo registro desde tus conversaciones y el avance de Administracion o Conserjeria.
                    </p>
                </div>
                <Link
                    href="/services"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-subtle bg-surface px-5 py-3 text-sm font-black cc-text-secondary shadow-sm transition-colors hover:bg-elevated"
                >
                    <Wrench className="h-4 w-4" />
                    Solicitar servicio
                </Link>
            </header>

            <section className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-widest cc-text-tertiary">Abiertos</p>
                    <p className="mt-2 text-3xl font-black cc-text-primary">{summary.open}</p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-widest cc-text-tertiary">Alta prioridad</p>
                    <p className="mt-2 text-3xl font-black text-orange-600">{summary.hot}</p>
                </div>
                <div className="rounded-2xl border border-subtle bg-surface p-5 shadow-sm">
                    <p className="text-xs font-black uppercase tracking-widest cc-text-tertiary">Resueltos</p>
                    <p className="mt-2 text-3xl font-black text-emerald-600">{summary.resolved}</p>
                </div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-subtle bg-surface shadow-xl shadow-slate-200/20 dark:shadow-black/30">
                {loading ? (
                    <div className="space-y-4 p-6">
                        {[0, 1, 2].map(item => (
                            <div key={item} className="h-28 animate-pulse rounded-2xl bg-elevated" />
                        ))}
                    </div>
                ) : cases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                        <div className="rounded-2xl bg-emerald-50 p-4 text-emerald-600 dark:bg-emerald-500/10">
                            <Bot className="h-10 w-10" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black cc-text-primary">Aun no tienes casos CoCo</h2>
                            <p className="mt-2 max-w-md text-sm cc-text-secondary">
                                Cuando le reportes a CoCo una filtracion, ruido, seguridad o mantencion, quedara aqui para seguimiento.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-subtle">
                        {cases.map(item => {
                            const status = statusCopy[item.status] || statusCopy.open;
                            const StatusIcon = status.icon;
                            const isHot = item.urgency === "alta" || item.urgency === "emergencia";
                            const latestEvent = eventsByCase[item.id]?.[0];

                            return (
                                <article key={item.id} className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${status.className}`}>
                                                <StatusIcon className="h-3.5 w-3.5" />
                                                {status.label}
                                            </span>
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${urgencyClass[item.urgency]}`}>
                                                {isHot && <ShieldAlert className="h-3.5 w-3.5" />}
                                                {item.urgency}
                                            </span>
                                            <span className="rounded-full bg-elevated px-3 py-1 text-[10px] font-black uppercase tracking-widest cc-text-secondary">
                                                {item.category}
                                            </span>
                                        </div>

                                        <div>
                                            <h2 className="truncate text-lg font-black cc-text-primary">{item.title}</h2>
                                            <p className="mt-1 line-clamp-2 text-sm font-medium cc-text-secondary">{item.source_message}</p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold cc-text-tertiary">
                                            <span>{new Date(item.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</span>
                                            {item.reason && <span className="line-clamp-1">Criterio: {item.reason}</span>}
                                        </div>
                                    </div>

                                    <div className="rounded-2xl bg-elevated p-4 lg:w-72">
                                        <div className="flex items-start gap-3">
                                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />
                                            <div>
                                                <p className="text-[10px] font-black uppercase tracking-widest cc-text-tertiary">
                                                    Ultimo movimiento
                                                </p>
                                                <p className="mt-1 line-clamp-4 text-xs font-medium cc-text-secondary">
                                                    {latestEvent?.body || item.assistant_reply || "CoCo registro el caso para seguimiento."}
                                                </p>
                                                <p className="mt-2 text-[10px] font-bold cc-text-tertiary">
                                                    {latestEvent
                                                        ? new Date(latestEvent.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
                                                        : new Date(item.updated_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>
        </div>
    );
}
