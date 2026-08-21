import type { DataClient } from './client';

export type CommunityNotificationInput = {
    userId: string;
    type: string;
    category: string;
    title: string;
    body: string;
    link?: string | null;
    communityId?: string | null;
};

function toRow(notification: CommunityNotificationInput) {
    return {
        user_id: notification.userId,
        type: notification.type,
        category: notification.category,
        title: notification.title,
        body: notification.body,
        link: notification.link ?? null,
        community_id: notification.communityId ?? null,
    };
}

export async function insertCommunityNotifications(
    client: DataClient,
    notifications: CommunityNotificationInput[],
) {
    if (notifications.length === 0) return { error: null as { message: string } | null };
    const { error } = await client.from('notifications').insert(notifications.map(toRow));
    return { error: error ? { message: error.message } : null };
}

export async function insertCommunityNotification(
    client: DataClient,
    notification: CommunityNotificationInput,
) {
    return insertCommunityNotifications(client, [notification]);
}
