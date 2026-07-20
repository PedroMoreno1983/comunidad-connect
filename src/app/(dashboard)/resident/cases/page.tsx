"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/authContext";
import { CocoCasesService } from "@/lib/api";
import type { CocoCase, CocoCaseEvent } from "@/lib/types";
import {
    AlertTriangle,
    Bot,
    CheckCircle2,
    Clock,
    MessageSquare,
    ShieldAlert,
    Wrench
} from "lucide-react";
import { Eyebrow, DisplayHeading } from "@/components/cc/Eyebrow";

const statusCopy: Record<CocoCase["status"], { label: string; icon: typeof Clock; style: React.CSSProperties }> = {
    open: {
        label: "Recibido",
        icon: Clock,
        style: { background: "var(--cc-amber-tint)", color: "var(--cc-amber)", borderColor: "transparent" },
    },
    in_progress: {
        label: "En revisión",
        icon: Wrench,
        style: { background: "var(--cc-copper-tint)", color: "var(--cc-copper)", borderColor: "transparent" },
    },
    resolved: {
        label: "Resuelto",
        icon: CheckCircle2,
        style: { background: "var(--cc-sage-tint)", color: "var(--cc-sage)", borderColor: "transparent" },
    },
    closed: {
        label: "Cerrado",
        icon: CheckCircle2,
        style: { background: "var(--cc-paper-warm)", color: "var(--cc-ink-muted)", borderColor: "transparent" },
    },
    cancelled: {
        label: "Cancelado",
        icon: AlertTriangle,
        style: { background: "var(--cc-rose-tint)", color: "var(--cc-rose)", borderColor: "transparent" },
    },
};

const urgencyStyle: Record<CocoCase["urgency"], React.CSSProperties> = {
    baja: { background: "var(--cc-paper-warm)", color: "var(--cc-ink-muted)" },
    media: { background: "var(--cc-copper-tint)", color: "var(--cc-copper)" },
    alta: { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" },
    emergencia: { background: "var(--cc-rose-tint)", color: "var(--cc-rose)" },
};

export default function ResidentCasesPage() {
    const { user } = useAuth();
    const [cases, setCases] = useState<CocoCase[]>([]);
    const [eventsByCase, setEventsByCase] = useState<Record<string, CocoCaseEvent[]>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchCases = async () => {
            if (!user) return;
            setLoading(true);
            const summary = await CocoCasesService.getResidentCases(user);
            setCases(summary.cases);
            setEventsByCase(summary.eventsByCase);
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

    const reportWithCoco = () => {
        window.dispatchEvent(new CustomEvent("coco:compose", {
            detail: {
                message: "Quiero reportar un problema en mi comunidad y dejar un caso para seguimiento.",
            },
        }));
    };

    if (!user) return null;

    return (
        <div className="mx-auto max-w-6xl space-y-8">
            <header className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                    <Eyebrow>Seguimiento CoCo</Eyebrow>
                    <DisplayHeading size={32}>Mis Casos CoCo</DisplayHeading>
                    <p className="max-w-2xl text-sm font-medium cc-text-secondary">
                        Revisa los reportes que CoCo registró desde tus conversaciones y el avance de Administración o Conserjería.
                    </p>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        type="button"
                        onClick={reportWithCoco}
                        className="inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90"
                        style={{ background: "var(--cc-copper)" }}
                    >
                        <Bot className="h-4 w-4" />
                        Reportar con CoCo
                    </button>
                    <Link
                        href="/services"
                        className="inline-flex items-center justify-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold cc-text-secondary transition-colors hover:bg-[var(--cc-paper-warm)]"
                        style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}
                    >
                        <Wrench className="h-4 w-4" />
                        Solicitar servicio
                    </Link>
                </div>
            </header>

            <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="text-xs font-semibold uppercase tracking-widest cc-text-tertiary">Abiertos</p>
                    <p className="mt-2 text-3xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{summary.open}</p>
                </div>
                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="text-xs font-semibold uppercase tracking-widest cc-text-tertiary">Alta prioridad</p>
                    <p className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-amber)" }}>{summary.hot}</p>
                </div>
                <div className="rounded-2xl border p-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                    <p className="text-xs font-semibold uppercase tracking-widest cc-text-tertiary">Resueltos</p>
                    <p className="mt-2 text-3xl font-semibold" style={{ fontFamily: "var(--cc-font-display)", color: "var(--cc-sage)" }}>{summary.resolved}</p>
                </div>
            </section>

            <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                {loading ? (
                    <div className="space-y-4 p-6">
                        {[0, 1, 2].map(item => (
                            <div key={item} className="h-28 animate-pulse rounded-xl" style={{ background: "var(--cc-paper-warm)" }} />
                        ))}
                    </div>
                ) : cases.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
                        <div className="rounded-full p-4" style={{ background: "var(--cc-sage-tint)", color: "var(--cc-sage)" }}>
                            <Bot className="h-10 w-10" />
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>Aún no tienes casos CoCo</h2>
                            <p className="mt-2 max-w-md text-sm cc-text-secondary">
                                Cuando le reportes a CoCo una filtración, ruido, seguridad o mantención, quedará aquí para seguimiento.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--cc-line)]">
                        {cases.map(item => {
                            const status = statusCopy[item.status] || statusCopy.open;
                            const StatusIcon = status.icon;
                            const isHot = item.urgency === "alta" || item.urgency === "emergencia";
                            const latestEvent = eventsByCase[item.id]?.[0];

                            return (
                                <article key={item.id} className="grid gap-5 p-6 lg:grid-cols-[1fr_auto] lg:items-center">
                                    <div className="min-w-0 space-y-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={status.style}>
                                                <StatusIcon className="h-3.5 w-3.5" />
                                                {status.label}
                                            </span>
                                            <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest" style={urgencyStyle[item.urgency]}>
                                                {isHot && <ShieldAlert className="h-3.5 w-3.5" />}
                                                {item.urgency}
                                            </span>
                                            <span className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-widest cc-text-secondary" style={{ background: "var(--cc-paper-warm)" }}>
                                                {item.category}
                                            </span>
                                        </div>

                                        <div>
                                            <h2 className="truncate text-lg font-semibold cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>{item.title}</h2>
                                            <p className="mt-1 line-clamp-2 text-sm font-medium cc-text-secondary">{item.source_message}</p>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-bold cc-text-tertiary">
                                            <span>{new Date(item.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}</span>
                                            {item.reason && <span className="line-clamp-1">Criterio: {item.reason}</span>}
                                        </div>
                                    </div>

                                    <div className="rounded-xl p-4 lg:w-72" style={{ background: "var(--cc-paper-warm)" }}>
                                        <div className="flex items-start gap-3">
                                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 cc-text-tertiary" />
                                            <div>
                                                <p className="text-[10px] font-semibold uppercase tracking-widest cc-text-tertiary">
                                                    Último movimiento
                                                </p>
                                                <p className="mt-1 line-clamp-4 text-xs font-medium cc-text-secondary">
                                                    {latestEvent?.body || item.assistant_reply || "CoCo registró el caso para seguimiento."}
                                                </p>
                                                <p className="mt-2 text-[10px] font-bold cc-text-tertiary">
                                                    {latestEvent
                                                        ? new Date(latestEvent.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })
                                                        : new Date(item.updated_at || item.created_at).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" })}
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
