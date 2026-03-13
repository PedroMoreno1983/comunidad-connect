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

export function NotificationProvider({ children }: { children: ReactNode }) {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState<Notification[]>([]);

    // Load from Supabase when user changes
    useEffect(() => {
        if (!user) {
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
        try { await NotificationService.markAsRead(id); } catch { }
    }, []);

    const markAllAsRead = useCallback(async () => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        if (!user) return;
        try { await NotificationService.markAllAsRead(user.id); } catch { }
    }, [user]);

    const removeNotification = useCallback(async (id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
        try { await NotificationService.deleteNotification(id); } catch { }
    }, []);

    const clearAll = useCallback(async () => {
        setNotifications([]);
        if (!user) return;
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
