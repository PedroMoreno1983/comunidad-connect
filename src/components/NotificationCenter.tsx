"use client";

import { useState, useRef, useEffect } from 'react';
import { useNotifications, Notification } from '@/lib/notificationContext';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Bell, Check, X, Info, CheckCircle, AlertTriangle, AlertCircle,
    ExternalLink, Trash2, CheckCheck
} from 'lucide-react';
import Link from 'next/link';

const iconMap = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    alert: AlertCircle,
};

const colorMap = {
    info: 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400',
    success: 'bg-success-bg text-success-fg',
    warning: 'bg-warning-bg text-warning-fg',
    alert: 'bg-danger-bg text-danger-fg',
};

function formatTimeAgo(date: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Ahora';
    if (diffMins < 60) return `Hace ${diffMins}m`;
    if (diffHours < 24) return `Hace ${diffHours}h`;
    return `Hace ${diffDays}d`;
}

function NotificationItem({ notification, onRead, onRemove }: {
    notification: Notification;
    onRead: () => void;
    onRemove: () => void;
}) {
    const Icon = iconMap[notification.type];

    const content = (
        <div className={`relative p-4 rounded-xl border transition-all ${notification.read
                ? 'bg-elevated/50 border-subtle/50'
                : 'bg-surface border-subtle shadow-sm'
            }`}>
            {!notification.read && (
                <div className="absolute top-4 right-4 w-2 h-2 bg-indigo-500 rounded-full" />
            )}
            <div className="flex gap-3">
                <div className={`p-2 rounded-lg flex-shrink-0 ${colorMap[notification.type]}`}>
                    <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                        <p className={`text-sm font-semibold ${notification.read ? 'cc-text-secondary' : 'cc-text-primary'}`}>
                            {notification.title}
                        </p>
                    </div>
                    <p className="text-sm cc-text-secondary mt-0.5 line-clamp-2">
                        {notification.message}
                    </p>
                    <div className="flex items-center gap-3 mt-2">
                        <span className="text-xs cc-text-tertiary">
                            {formatTimeAgo(notification.timestamp)}
                        </span>
                        {!notification.read && (
                            <button
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRead(); }}
                                className="text-xs font-medium text-role-admin-fg hover:text-indigo-700 dark:hover:text-indigo-300"
                            >
                                Marcar leído
                            </button>
                        )}
                    </div>
                </div>
                <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
                    className="p-1.5 rounded-lg hover:bg-elevated text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>
        </div>
    );

    if (notification.link) {
        return (
            <Link href={notification.link} onClick={onRead}>
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

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Close on escape
    useEffect(() => {
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') setIsOpen(false);
        }
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2.5 rounded-xl bg-elevated hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
                <Bell className="h-5 w-5 cc-text-secondary" />
                {unreadCount > 0 && (
                    <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center"
                    >
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                )}
            </button>

            {/* Dropdown */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 mt-2 w-96 max-h-[70vh] bg-surface rounded-2xl shadow-2xl shadow-slate-200/50 dark:shadow-slate-950/50 border border-subtle overflow-hidden z-50"
                    >
                        {/* Header */}
                        <div className="p-4 border-b border-subtle flex items-center justify-between">
                            <div>
                                <h3 className="font-bold cc-text-primary">Notificaciones</h3>
                                <p className="text-xs cc-text-secondary">
                                    {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {unreadCount > 0 && (
                                    <button
                                        onClick={markAllAsRead}
                                        className="p-2 rounded-lg hover:bg-elevated text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                        title="Marcar todo como leído"
                                    >
                                        <CheckCheck className="h-4 w-4" />
                                    </button>
                                )}
                                {notifications.length > 0 && (
                                    <button
                                        onClick={clearAll}
                                        className="p-2 rounded-lg hover:bg-elevated text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                                        title="Limpiar todo"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Notifications List */}
                        <div className="overflow-y-auto max-h-[50vh] p-3 space-y-2">
                            {notifications.length === 0 ? (
                                <div className="text-center py-8">
                                    <div className="w-12 h-12 mx-auto mb-3 bg-elevated rounded-full flex items-center justify-center">
                                        <Bell className="h-6 w-6 text-slate-400" />
                                    </div>
                                    <p className="text-sm cc-text-secondary">No hay notificaciones</p>
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
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

// Compact version for sidebar
export function NotificationBell() {
    const { unreadCount } = useNotifications();

    return (
        <div className="relative">
            <Bell className="h-5 w-5 cc-text-secondary" />
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9' : unreadCount}
                </span>
            )}
        </div>
    );
}
