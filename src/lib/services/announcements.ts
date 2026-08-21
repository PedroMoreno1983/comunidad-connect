/**
 * AnnouncementsService: anuncios del feed.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    Announcement,
    AnnouncementDatabaseRow,
    CreateAnnouncementInput,
} from '../types';

export function mapAnnouncement(row: AnnouncementDatabaseRow): Announcement {
    return {
        id: row.id,
        title: row.title,
        content: row.content,
        author: row.author_name || 'Administración',
        priority: row.priority,
        createdAt: row.created_at,
    };
}

export const AnnouncementsService = {
    async getAnnouncements(): Promise<Announcement[]> {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return ((data || []) as AnnouncementDatabaseRow[]).map(mapAnnouncement);
    },

    async createAnnouncement(announcementData: CreateAnnouncementInput): Promise<Announcement> {
        const { data, error } = await supabase
            .from('announcements')
            .insert([{
                title: announcementData.title,
                content: announcementData.content,
                priority: announcementData.priority,
                author_id: announcementData.authorId,
                author_name: announcementData.authorName,
                community_id: announcementData.communityId,
            }])
            .select()
            .single();

        if (error) throw error;

        return mapAnnouncement({
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.priority,
            author_name: data.author_name || announcementData.authorName,
            created_at: data.created_at,
        });
    }
};
