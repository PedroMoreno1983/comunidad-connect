"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
    AlertCircle,
    AlertTriangle,
    ArrowRight,
    Bell,
    CheckCheck,
    CheckCircle2,
    Info,
    Trash2,
} from "lucide-react";
import { DisplayHeading, Eyebrow } from "@/components/cc/Eyebrow";
import { EmptyState } from "@/components/cc/EmptyState";
import { useNotifications } from "@/lib/notificationContext";
import type { NotificationRowProps } from "@/lib/types";

const FILTERS = [
    { key: "all", label: "Todas" },
    { key: "unread", label: "Sin leer" },
    { key: "important", label: "Importantes" },
] as const;

const ICONS = {
    info: Info,
    success: CheckCircle2,
    warning: AlertTriangle,
    alert: AlertCircle,
};

const TONES = {
    info: { background: "var(--cc-copper-tint)", color: "var(--cc-copper)" },
    success: { background: "var(--cc-sage-tint)", color: "var(--cc-sage)" },
    warning: { background: "var(--cc-amber-tint)", color: "var(--cc-amber)" },
    alert: { background: "var(--cc-rose-tint)", color: "var(--cc-rose)" },
};

function isToday(value: Date) {
    const now = new Date();
    return value.getFullYear() === now.getFullYear()
        && value.getMonth() === now.getMonth()
        && value.getDate() === now.getDate();
}

function formatTimestamp(value: Date) {
    if (isToday(value)) {
        return value.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    }

    return value.toLocaleDateString("es-CL", {
        weekday: "short",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
    });
}

function NotificationRow({
    notification,
    onRead,
    onRemove,
}: NotificationRowProps) {
    const Icon = ICONS[notification.type];
    const tone = TONES[notification.type];

    const content = (
        <article
            className="group relative flex gap-4 border-t px-1 py-5 transition-colors first:border-t-0 sm:gap-5 sm:px-2"
            style={{ borderColor: "var(--cc-line)" }}
        >
            <div
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                style={tone}
            >
                <Icon className="h-5 w-5" strokeWidth={1.6} />
            </div>

            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                        {!notification.read && (
                            <span
                                aria-label="Sin leer"
                                className="h-1.5 w-1.5 shrink-0 rounded-full"
                                style={{ background: "var(--cc-copper)" }}
                            />
                        )}
                        <h2 className="text-[15px] font-medium leading-snug cc-text-primary">
                            {notification.title}
                        </h2>
                    </div>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] cc-text-tertiary">
                        {formatTimestamp(notification.timestamp)}
                    </span>
                </div>

                <p className="mt-1.5 max-w-3xl text-sm leading-6 cc-text-secondary">
                    {notification.message}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-4 text-xs">
                    {!notification.read && (
                        <button
                            type="button"
                            onClick={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                onRead();
                            }}
                            className="font-medium text-copper"
                        >
                            Marcar como leída
                        </button>
                    )}
                    {notification.link && (
                        <span className="inline-flex items-center gap-1 font-medium text-copper">
                            Abrir detalle <ArrowRight className="h-3.5 w-3.5" />
                        </span>
                    )}
                </div>
            </div>

            <button
                type="button"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onRemove();
                }}
                className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg opacity-60 transition hover:bg-[var(--cc-paper-warm)] hover:opacity-100"
                aria-label={`Eliminar ${notification.title}`}
            >
                <Trash2 className="h-4 w-4 cc-text-tertiary" />
            </button>
        </article>
    );

    if (!notification.link) return content;

    return (
        <Link href={notification.link} onClick={onRead} className="block">
            {content}
        </Link>
    );
}

export default function NotificationsPage() {
    const {
        notifications,
        unreadCount,
        markAsRead,
        markAllAsRead,
        removeNotification,
    } = useNotifications();
    const [filter, setFilter] = useState("all");

    const visible = useMemo(() => notifications.filter((notification) => {
        if (filter === "unread") return !notification.read;
        if (filter === "important") return notification.type === "warning" || notification.type === "alert";
        return true;
    }), [filter, notifications]);

    const today = visible.filter((notification) => isToday(notification.timestamp));
    const earlier = visible.filter((notification) => !isToday(notification.timestamp));

    return (
        <main className="mx-auto w-full max-w-5xl px-1 py-4 sm:px-4 sm:py-8">
            <header className="flex flex-col gap-6 border-b pb-7 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--cc-line-strong)" }}>
                <div>
                    <Eyebrow>Bandeja de entrada</Eyebrow>
                    <DisplayHeading size={48} className="mt-2">
                        Lo importante, <em className="font-normal italic text-copper">a tiempo.</em>
                    </DisplayHeading>
                    <p className="mt-3 max-w-2xl text-sm leading-6 cc-text-secondary">
                        Esta es tu bandeja personal de eventos automáticos: reservas, pagos, encomiendas y novedades. No se usa para redactar comunicados.
                    </p>
                </div>

                {unreadCount > 0 && (
                    <button
                        type="button"
                        onClick={markAllAsRead}
                        className="inline-flex items-center gap-2 self-start rounded-xl border px-4 py-2.5 text-sm font-medium cc-text-primary sm:self-auto"
                        style={{ borderColor: "var(--cc-line-strong)", background: "var(--cc-paper)" }}
                    >
                        <CheckCheck className="h-4 w-4 text-copper" />
                        Marcar todo como leído
                    </button>
                )}
            </header>

            <nav className="mt-6 flex gap-6 overflow-x-auto border-b" aria-label="Filtros de notificaciones" style={{ borderColor: "var(--cc-line)" }}>
                {FILTERS.map((item) => {
                    const count = item.key === "all"
                        ? notifications.length
                        : item.key === "unread"
                            ? unreadCount
                            : notifications.filter((notification) => notification.type === "warning" || notification.type === "alert").length;
                    const active = filter === item.key;

                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setFilter(item.key)}
                            className="shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors"
                            style={{
                                borderColor: active ? "var(--cc-copper)" : "transparent",
                                color: active ? "var(--cc-ink)" : "var(--cc-ink-tertiary)",
                            }}
                        >
                            {item.label} <span className="ml-1 font-mono text-[11px]">{count}</span>
                        </button>
                    );
                })}
            </nav>

            {visible.length === 0 ? (
                <div className="py-16">
                    <EmptyState
                        icon={<Bell className="h-6 w-6" />}
                        title={notifications.length === 0 ? "Todo al día" : "No hay notificaciones en este filtro"}
                        description={notifications.length === 0
                            ? "Cuando ocurra algo relevante en tu comunidad, aparecerá aquí."
                            : "Prueba con otra vista para revisar el resto de tu bandeja."}
                        cta={notifications.length > 0 ? (
                            <button type="button" onClick={() => setFilter("all")} className="text-sm font-medium text-copper">
                                Ver todas
                            </button>
                        ) : undefined}
                    />
                </div>
            ) : (
                <div className="mt-8 space-y-10">
                    {today.length > 0 && (
                        <section>
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 className="text-3xl font-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    Hoy
                                </h2>
                                <span className="font-mono text-[11px] cc-text-tertiary">{today.length} aviso{today.length === 1 ? "" : "s"}</span>
                            </div>
                            <div className="rounded-2xl border px-4 sm:px-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                {today.map((notification) => (
                                    <NotificationRow
                                        key={notification.id}
                                        notification={notification}
                                        onRead={() => markAsRead(notification.id)}
                                        onRemove={() => removeNotification(notification.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {earlier.length > 0 && (
                        <section>
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 className="text-3xl font-normal cc-text-primary" style={{ fontFamily: "var(--cc-font-display)" }}>
                                    Anteriores
                                </h2>
                                <span className="font-mono text-[11px] cc-text-tertiary">{earlier.length} aviso{earlier.length === 1 ? "" : "s"}</span>
                            </div>
                            <div className="rounded-2xl border px-4 sm:px-5" style={{ borderColor: "var(--cc-line)", background: "var(--cc-paper)" }}>
                                {earlier.map((notification) => (
                                    <NotificationRow
                                        key={notification.id}
                                        notification={notification}
                                        onRead={() => markAsRead(notification.id)}
                                        onRemove={() => removeNotification(notification.id)}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </main>
    );
}
