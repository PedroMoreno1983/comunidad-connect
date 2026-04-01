import { supabase } from '../supabase';

export interface DbNotification {
    id: string;
    user_id: string;
    type: 'info' | 'success' | 'warning' | 'alert';
    category: string;
    title: string;
    body: string;
    link?: string;
    read: boolean;
    created_at: string;
}

export interface CreateNotificationPayload {
    user_id: string;
    type: 'info' | 'success' | 'warning' | 'alert';
    category?: string;
    title: string;
    body: string;
    link?: string;
}

export const NotificationService = {
    // Get all notifications for the current user (latest 30)
    async getNotifications(userId: string, limit = 30): Promise<DbNotification[]> {
        const { data, error } = await supabase
            .from('notifications')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) throw error;
        return data || [];
    },

    // Mark a single notification as read
    async markAsRead(notificationId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId);
        if (error) throw error;
    },

    // Mark all as read for the user
    async markAllAsRead(userId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .update({ read: true })
            .eq('user_id', userId)
            .eq('read', false);
        if (error) throw error;
    },

    // Delete a single notification
    async deleteNotification(notificationId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('id', notificationId);
        if (error) throw error;
    },

    // Delete all notifications for user
    async deleteAll(userId: string): Promise<void> {
        const { error } = await supabase
            .from('notifications')
            .delete()
            .eq('user_id', userId);
        if (error) throw error;
    },

    // Create a notification (called by other services)
    async create(payload: CreateNotificationPayload): Promise<DbNotification | null> {
        const { data, error } = await supabase
            .from('notifications')
            .insert({
                ...payload,
                category: payload.category || payload.type
            })
            .select()
            .single();
        if (error) {
            console.error('[NotificationService.create] Error:', error);
            return null;
        }
        return data;
    },

    // Subscribe to new notifications in real time for a given user
    subscribeToNotifications(userId: string, onNew: (n: DbNotification) => void) {
        const channel = supabase.channel(`notifications_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload: { new: Record<string, unknown> }) => {
                    onNew(payload.new as unknown as DbNotification);
                }
            )
            .subscribe();
        return channel;
    }
};
