import { createClient } from '@/lib/supabase/client';
import type { ServiceProvider, Review } from '@/lib/types';

// Standard client that works in both client and server (without cookies auto-handling on server)
const getSupabase = () => createClient();

/**
 * Service Providers CRUD operations
 */
export const providersService = {
    async getAll(): Promise<ServiceProvider[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .select('*')
            .order('rating', { ascending: false });
        if (error) throw error;
        
        return (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            reviewCount: p.review_count,
            contactPhone: p.contact_phone,
            email: p.email,
            photo: p.photo,
            bio: p.bio,
            yearsExperience: p.years_experience,
            specialties: p.specialties,
            certifications: p.certifications,
            hourlyRate: p.hourly_rate,
            availability: p.availability,
            responseTime: p.response_time,
            completedJobs: p.completed_jobs,
            verified: p.verified
        }));
    },

    async getByCategory(category: string): Promise<ServiceProvider[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .select('*')
            .eq('category', category)
            .order('rating', { ascending: false });
        if (error) throw error;
        
        return (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            reviewCount: p.review_count,
            contactPhone: p.contact_phone,
            email: p.email,
            photo: p.photo,
            bio: p.bio,
            yearsExperience: p.years_experience,
            specialties: p.specialties,
            certifications: p.certifications,
            hourlyRate: p.hourly_rate,
            availability: p.availability,
            responseTime: p.response_time,
            completedJobs: p.completed_jobs,
            verified: p.verified
        }));
    },

    async getById(id: string): Promise<ServiceProvider | null> {
        if (!id || id === 'undefined') return null;
        const supabase = getSupabase();
        const { data: p, error } = await supabase
            .from('service_providers')
            .select('*')
            .eq('id', id)
            .single();
        if (error) throw error;
        if (!p) return null;

        return {
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            reviewCount: p.review_count,
            contactPhone: p.contact_phone,
            email: p.email,
            photo: p.photo,
            bio: p.bio,
            yearsExperience: p.years_experience,
            specialties: p.specialties,
            certifications: p.certifications,
            hourlyRate: p.hourly_rate,
            availability: p.availability,
            responseTime: p.response_time,
            completedJobs: p.completed_jobs,
            verified: p.verified
        };
    },

    async getFeatured(limit: number = 6): Promise<ServiceProvider[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .select('*')
            .gte('rating', 4.5)
            .order('rating', { ascending: false })
            .limit(limit);
        if (error) throw error;
        
        return (data || []).map((p: any) => ({
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            reviewCount: p.review_count,
            contactPhone: p.contact_phone,
            email: p.email,
            photo: p.photo,
            bio: p.bio,
            yearsExperience: p.years_experience,
            specialties: p.specialties,
            certifications: p.certifications,
            hourlyRate: p.hourly_rate,
            availability: p.availability,
            responseTime: p.response_time,
            completedJobs: p.completed_jobs,
            verified: p.verified
        }));
    },

    async search(query: string): Promise<ServiceProvider[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .select('*')
            .or(`name.ilike.%${query}%,bio.ilike.%${query}%,specialties.cs.{${query}}`)
            .order('rating', { ascending: false });
        if (error) throw error;
        return data || [];
    },

    async create(provider: Omit<ServiceProvider, 'id' | 'rating' | 'reviewCount' | 'completedJobs'>): Promise<ServiceProvider | null> {
        const supabase = getSupabase();
        const newProvider = {
            name: provider.name,
            category: provider.category,
            contact_phone: provider.contactPhone,
            email: provider.email,
            photo: provider.photo,
            bio: provider.bio,
            years_experience: provider.yearsExperience,
            specialties: provider.specialties,
            certifications: provider.certifications,
            hourly_rate: provider.hourlyRate,
            availability: provider.availability,
            response_time: provider.responseTime,
            rating: 0,
            review_count: 0,
            completed_jobs: 0,
            verified: false
        };
        const { data: p, error } = await supabase
            .from('service_providers')
            .insert(newProvider)
            .select()
            .single();
        if (error) throw error;
        if (!p) return null;

        return {
            id: p.id,
            name: p.name,
            category: p.category,
            rating: p.rating,
            reviewCount: p.review_count,
            contactPhone: p.contact_phone,
            email: p.email,
            photo: p.photo,
            bio: p.bio,
            yearsExperience: p.years_experience,
            specialties: p.specialties,
            certifications: p.certifications,
            hourlyRate: p.hourly_rate,
            availability: p.availability,
            responseTime: p.response_time,
            completedJobs: p.completed_jobs,
            verified: p.verified
        };
    },

    async update(id: string, updates: Partial<ServiceProvider>): Promise<ServiceProvider | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .update(updates)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    async delete(id: string): Promise<boolean> {
        const supabase = getSupabase();
        const { error } = await supabase
            .from('service_providers')
            .delete()
            .eq('id', id);
        if (error) {
            console.error('Error deleting provider:', error);
            return false;
        }
        return true;
    },
};

/**
 * Reviews CRUD operations
 */
export const reviewsService = {
    async getByProvider(providerId: string): Promise<Review[]> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('reviews')
            .select('*')
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((review: { id: string; provider_id: string; user_id: string; rating: number; comment: string; service_type: string; created_at: string }) => ({
            id: review.id,
            providerId: review.provider_id,
            userId: review.user_id,
            userName: 'Usuario Anónimo',
            rating: review.rating,
            comment: review.comment,
            serviceType: review.service_type,
            createdAt: review.created_at,
        }));
    },

    async create(review: { providerId: string; userId: string; rating: number; comment: string; serviceType: string }): Promise<Review | null> {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('reviews')
            .insert({
                provider_id: review.providerId,
                user_id: review.userId,
                rating: review.rating,
                comment: review.comment,
                service_type: review.serviceType,
            })
            .select(`
                *,
                profiles:user_id (
                  name,
                  avatar_url
                )
            `)
            .single();

        if (error) throw error;

        await this.updateProviderRating(review.providerId);

        return {
            id: data.id,
            providerId: data.provider_id,
            userId: data.user_id,
            userName: data.profiles?.name || 'Usuario',
            userAvatar: data.profiles?.avatar_url,
            rating: data.rating,
            comment: data.comment,
            serviceType: data.service_type,
            createdAt: data.created_at,
        };
    },

    async updateProviderRating(providerId: string): Promise<void> {
        try {
            const supabase = getSupabase();
            const { data: reviews } = await supabase
                .from('reviews')
                .select('rating')
                .eq('provider_id', providerId);

            if (!reviews || reviews.length === 0) return;

            const totalRating = reviews.reduce((sum: number, review: { rating: number }) => sum + review.rating, 0);
            const avgRating = totalRating / reviews.length;

            await supabase
                .from('service_providers')
                .update({
                    rating: Math.round(avgRating * 10) / 10,
                    reviewCount: reviews.length,
                })
                .eq('id', providerId);
        } catch (error) {
            console.error('Error updating provider rating:', error);
        }
    },
};

/**
 * Service Requests operations
 */
export const serviceRequestsService = {
    async create(request: {
        providerId: string;
        userId: string;
        preferredDate: string;
        preferredTime: string;
        description: string;
    }) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_requests')
            .insert({
                provider_id: request.providerId,
                user_id: request.userId,
                preferred_date: request.preferredDate,
                preferred_time: request.preferredTime,
                description: request.description,
                status: 'pending',
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async getByUser(userId: string) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_requests')
            .select(`
                *,
                service_providers (
                  name,
                  category,
                  contact_phone
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async getByProvider(providerId: string) {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_requests')
            .select(`
                *,
                profiles:user_id (
                  name,
                  email,
                  phone
                )
            `)
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false });

        if (error) throw error;
        return data || [];
    },

    async updateStatus(requestId: string, status: 'pending' | 'accepted' | 'completed' | 'cancelled') {
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_requests')
            .update({ status })
            .eq('id', requestId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },
};
