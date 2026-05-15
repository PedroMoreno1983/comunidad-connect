"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, Bell, CheckCheck, CheckCircle, Info, Trash2, X } from "lucide-react";
import { Notification, useNotifications } from "@/lib/notificationContext";

const iconMap = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    alert: AlertCircle,
};

const colorMap = {
    info: "bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400",
    success: "bg-success-bg text-success-fg",
    warning: "bg-warning-bg text-warning-fg",
    alert: "bg-danger-bg text-danger-fg",
};

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return "Ahora";
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
}

function NotificationItem({
    notification,
    onRead,
    onRemove,
}: {
    notification: Notification;
    onRead: () => void;
    onRemove: () => void;
}) {
    const Icon = iconMap[notification.type];

    const content = (
        <div
            className={`group relative rounded-lg border p-3.5 transition-colors sm:p-4 ${
                notification.read ? "border-subtle/60 bg-elevated/50" : "border-subtle bg-surface shadow-sm"
            }`}
        >
            {!notification.read && <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-brand-500" />}

            <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${colorMap[notification.type]}`}>
                    <Icon className="h-4 w-4" />
                </div>

                <div className="min-w-0 flex-1 pr-6">
                    <p className={`text-sm font-semibold leading-5 ${notification.read ? "cc-text-secondary" : "cc-text-primary"}`}>
                        {notification.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 cc-text-secondary">{notification.message}</p>

                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-xs cc-text-tertiary">{formatTimeAgo(notification.timestamp)}</span>
                        {!notification.read && (
                            <button
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    onRead();
                                }}
                                className="text-xs font-semibold text-brand-600 transition-colors hover:text-brand-700 dark:hover:text-brand-300"
                            >
                                Marcar leído
                            </button>
                        )}
                    </div>
                </div>

                <button
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onRemove();
                    }}
                    className="absolute right-2 top-8 rounded-md p-1.5 text-slate-400 opacity-80 transition-colors hover:bg-elevated hover:text-slate-600 group-hover:opacity-100 dark:hover:text-slate-300"
                    aria-label="Eliminar notificación"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );

    if (notification.link) {
        return (
            <Link href={notification.link} onClick={onRead} className="block">
                {content}
            </Link>
        );
    }

    return content;
}

export function NotificationCenter() {
    const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification, clearAll } = useNotifications();
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        function handleEscape(event: KeyboardEvent) {
            if (event.key === "Escape") setIsOpen(false);
        }

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, []);

    return (
        <div ref={dropdownRef} className="relative">
            <button
                onClick={() => setIsOpen((open) => !open)}
                className="relative inline-flex h-11 w-11 items-center justify-center overflow-visible rounded-lg bg-elevated transition-colors hover:bg-surface"
                aria-label="Abrir notificaciones"
                aria-expanded={isOpen}
            >
                <Bell className="h-5 w-5 cc-text-secondary" />
                {unreadCount > 0 && (
                    <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold leading-none text-white">
                        {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-12 z-50 max-h-[min(72vh,620px)] w-[min(18rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-subtle bg-surface shadow-2xl shadow-slate-200/60 dark:shadow-slate-950/50 sm:w-[22rem]">
                    <div className="flex items-center justify-between border-b border-subtle p-4">
                        <div>
                            <h3 className="text-base font-semibold cc-text-primary">Notificaciones</h3>
                            <p className="text-xs cc-text-secondary">
                                {unreadCount > 0 ? `${unreadCount} sin leer` : "Todo al día"}
                            </p>
                        </div>

                        <div className="flex items-center gap-1">
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-elevated hover:text-slate-700 dark:hover:text-slate-300"
                                    title="Marcar todo como leído"
                                    aria-label="Marcar todo como leído"
                                >
                                    <CheckCheck className="h-4 w-4" />
                                </button>
                            )}
                            {notifications.length > 0 && (
                                <button
                                    onClick={clearAll}
                                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-elevated hover:text-slate-700 dark:hover:text-slate-300"
                                    title="Limpiar todo"
                                    aria-label="Limpiar todo"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="max-h-[calc(min(72vh,620px)-74px)] space-y-2 overflow-y-auto bg-canvas/45 p-3">
                        {notifications.length === 0 ? (
                            <div className="py-8 text-center">
                                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-elevated">
                                    <Bell className="h-6 w-6 text-slate-400" />
                                </div>
                                <p className="text-sm font-semibold cc-text-primary">Todo al día</p>
                                <p className="mx-auto mt-1 max-w-[220px] text-xs leading-5 cc-text-secondary">
                                    Aquí aparecerán avisos, reservas, pagos y novedades relevantes.
                                </p>
                            </div>
                        ) : (
                            notifications.map((notification) => (
                                <NotificationItem
                                    key={notification.id}
                                    notification={notification}
                                    onRead={() => markAsRead(notification.id)}
                                    onRemove={() => removeNotification(notification.id)}
                                />
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export function NotificationBell() {
    const { unreadCount } = useNotifications();

    return (
        <div className="relative">
            <Bell className="h-5 w-5 cc-text-secondary" />
            {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? "9" : unreadCount}
                </span>
            )}
        </div>
    );
}
