/**
 * SocialService: muro vecinal, comentarios e imágenes.
 *
 * Extraído de `src/lib/services/supabaseServices.ts`. Se importa desde
 * `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';

export const SocialService = {
    async uploadPostImage(userId: string, file: File): Promise<string> {
        const ext = file.name.split('.').pop() || 'jpg';
        const path = `posts/${userId}/${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
            .from('social-images')
            .upload(path, file, { upsert: false });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
            .from('social-images')
            .getPublicUrl(path);

        return publicUrl;
    },

    async getPosts() {
        const { data, error } = await supabase
            .from('social_posts')
            .select(`
                *,
                profiles:author_id (name, avatar_url, unit_id),
                comments:social_comments(count)
            `)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Transform the nested comments count
        return data?.map((post: { comments?: { count: number }[] } & Record<string, unknown>) => ({
            ...post,
            comments_count: (post.comments && post.comments.length > 0) ? post.comments[0].count : 0
        }));
    },

    async createPost(post: { author_id: string; content: string; image_url?: string }) {
        const { data, error } = await supabase
            .from('social_posts')
            .insert(post)
            .select(`
                *,
                profiles:author_id (name, avatar_url, unit_id)
            `)
            .single();

        if (error) throw error;
        return { ...data, comments_count: 0 };
    },

    async likePost(postId: string) {
        // Increment likes count via rpc or simple update if RLS allows
        const { error } = await supabase.rpc('increment_post_likes', { post_id: postId });
        if (error) throw error;
    },

    async getComments(postId: string) {
        const { data, error } = await supabase
            .from('social_comments')
            .select(`
                *,
                profiles:author_id (name, avatar_url)
            `)
            .eq('post_id', postId)
            .order('created_at', { ascending: true });

        if (error) throw error;
        return data;
    },

    async createComment(comment: { post_id: string; author_id: string; content: string }) {
        const { data, error } = await supabase
            .from('social_comments')
            .insert(comment)
            .select(`
                *,
                profiles:author_id (name, avatar_url)
            `)
            .single();

        if (error) throw error;
        return data;
    }
};
