import { supabase } from '../supabase';
import { CreateAnnouncementInput } from '../types';
import type { AnnouncementDatabaseRow } from '../types';

export const AnnouncementsService = {
    async getAnnouncements(): Promise<AnnouncementDatabaseRow[]> {
        const { data, error } = await supabase
            .from('announcements')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return (data || []) as AnnouncementDatabaseRow[];
    },

    async createAnnouncement(announcementData: CreateAnnouncementInput) {
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

        return {
            id: data.id,
            title: data.title,
            content: data.content,
            priority: data.priority,
            author_name: data.author_name || announcementData.authorName,
            created_at: data.created_at
        };
    }
};
