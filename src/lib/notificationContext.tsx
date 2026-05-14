"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { useAuth } from './authContext';
import { NotificationService, DbNotification } from './services/notificationService';

// The Notification type used by the UI (maps from DbNotification)
export interface Notification {
    id: string;
    type: 'info' | 'success' | 'warning' | 'alert';
    title: string;
    message: string;
    timestamp: Date;
    read: boolean;
    link?: string;
}

interface NotificationContextType {
    notifications: Notification[];
    unreadCount: number;
    addNotification: (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    removeNotification: (id: string) => void;
    clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

function dbToUi(n: DbNotification): Notification {
    return {
        id: n.id,
        type: n.type,
        title: n.title,
        message: n.body,
        timestamp: new Date(n.created_at),
        read: n.read,
        link: n.link
    };
}

function demoNotifications(role: string): Notification[] {
    const now = Date.now();
    const common: Notification[] = [
        {
            id: 'demo-notification-maintenance',
            type: 'info',
            title: 'Mantención programada',
            message: 'Ascensor B tendrá revisión preventiva mañana entre 10:00 y 12:00.',
            timestamp: new Date(now - 35 * 60 * 1000),
            read: false,
            link: '/admin/mantenimiento',
        },
    ];

    if (role === 'concierge') {
        return [
            {
                id: 'demo-notification-package',
                type: 'success',
                title: 'Paquete registrado',
                message: 'Nueva encomienda para Depto 1204 pendiente de retiro.',
                timestamp: new Date(now - 12 * 60 * 1000),
                read: false,
                link: '/concierge/packages',
            },
            ...common,
        ];
    }

    if (role === 'resident') {
        return [
            {
                id: 'demo-notification-expense',
                type: 'warning',
                title: 'Gasto común por vencer',
                message: 'Tu gasto común de mayo vence el 15 de mayo.',
                timestamp: new Date(now - 18 * 60 * 1000),
                read: false,
                link: '/resident/finances',
            },
            ...common,
        ];
    }

    return [
        {
            id: 'demo-notification-coco',
            type: 'alert',
            title: 'Caso CoCo requiere revisión',
            message: 'Se detectó recurrencia en reportes de ruido del piso 12.',
            timestamp: new Date(now - 8 * 60 * 1000),
            read: false,
            link: '/resident/cases',
        },
        ...common,
    ];
}

export function NotificationProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    // Load from Supabase when user changes
    useEffect(() => {
        if (!user) {
            queueMicrotask(() => setNotifications([]));
            return;
        }

        if (user.email.toLowerCase().endsWith('@demo.com')) {
            queueMicrotask(() => setNotifications(demoNotifications(user.role)));
            return;
        }

        // Initial load
        NotificationService.getNotifications(user.id)
            .then(data => setNotifications(data.map(dbToUi)))
            .catch(err => console.error('[NotificationContext] load error:', err));

        // Realtime subscription — bell animates on new notification
        const subscription = NotificationService.subscribeToNotifications(user.id, (newN) => {
            setNotifications(prev => [dbToUi(newN), ...prev]);
        });

        return () => { subscription.unsubscribe(); };
    }, [user]);

    const visibleNotifications = user ? notifications : [];
    const unreadCount = visibleNotifications.filter(n => !n.read).length;

    // addNotification: optimistically adds to UI and persists to Supabase
    const addNotification = useCallback(async (notification: Omit<Notification, 'id' | 'timestamp' | 'read'>) => {
        if (!user) return;
        // Optimistic local add
        const tmpId = Math.random().toString(36).substr(2, 9);
        const optimistic: Notification = {
            ...notification,
            id: tmpId,
            timestamp: new Date(),
            read: false,
        };
        setNotifications(prev => [optimistic, ...prev]);
        if (user.email.toLowerCase().endsWith('@demo.com')) return;

        // Persist
        try {
            await NotificationService.create({
                user_id: user.id,
                type: notification.type,
                title: notification.title,
                body: notification.message,
                link: notification.link
            });
        } catch (err) {
            console.error('[NotificationContext] create error:', err);
        }
    }, [user]);

    const markAsRead = useCallback(async (id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        if (id.startsWith('demo-')) return;
        try { await NotificationService.markAsRead(id); } catch { }
    }, []);

    const markAllAsRead = useCallback(async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        if (!user) return;
        if (user.email.toLowerCase().endsWith('@demo.com')) return;
        try { await NotificationService.markAllAsRead(user.id); } catch { }
    }, [user]);

    const removeNotification = useCallback(async (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        if (id.startsWith('demo-')) return;
        try { await NotificationService.deleteNotification(id); } catch { }
    }, []);

    const clearAll = useCallback(async () => {
        setNotifications([]);
        if (!user) return;
        if (user.email.toLowerCase().endsWith('@demo.com')) return;
        try { await NotificationService.deleteAll(user.id); } catch { }
    }, [user]);

    return (
        <NotificationContext.Provider value={{
            notifications: visibleNotifications,
            unreadCount,
            addNotification,
            markAsRead,
            markAllAsRead,
            removeNotification,
            clearAll,
        }}>
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within a NotificationProvider');
    }
    return context;
}
