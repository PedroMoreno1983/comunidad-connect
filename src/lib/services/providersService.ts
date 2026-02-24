import { createClient } from '@/lib/supabase/client';
import type { ServiceProvider, Review } from '@/lib/types';
import { MOCK_PROVIDERS, MOCK_REVIEWS, MOCK_REQUESTS } from '../mockData';

// Standard client that works in both client and server (without cookies auto-handling on server)
const getSupabase = () => createClient();

/**
 * Service Providers CRUD operations
 */
export const providersService = {
    /**
     * Get all providers
     */
    async getAll(): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .order('rating', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return MOCK_PROVIDERS;
        }
    },

    /**
     * Get providers by category
     */
    async getByCategory(category: string): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .eq('category', category)
                .order('rating', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return MOCK_PROVIDERS.filter(p => p.category === category);
        }
    },

    /**
     * Get provider by ID
     */
    async getById(id: string): Promise<ServiceProvider | null> {
        if (!id || id === 'undefined') return MOCK_PROVIDERS[0];

        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .eq('id', id)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            // Only log if it's not a expected missing provider in demo mode
            if (id && id !== 'undefined') {
                console.warn('Using mock provider fallback:', id);
            }
            return MOCK_PROVIDERS.find(p => p.id === id) || MOCK_PROVIDERS[0];
        }
    },

    /**
     * Get featured providers (top rated)
     */
    async getFeatured(limit: number = 6): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .gte('rating', 4.5)
                .order('rating', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return MOCK_PROVIDERS
                .filter(p => p.rating >= 4.5)
                .sort((a, b) => b.rating - a.rating)
                .slice(0, limit);
        }
    },

    /**
     * Search providers by name or specialty
     */
    async search(query: string): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .or(`name.ilike.%${query}%,bio.ilike.%${query}%,specialties.cs.{${query}}`)
                .order('rating', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            const lowerQuery = query.toLowerCase();
            return MOCK_PROVIDERS.filter(p =>
                p.name.toLowerCase().includes(lowerQuery) ||
                p.bio.toLowerCase().includes(lowerQuery) ||
                p.specialties.some(s => s.toLowerCase().includes(lowerQuery))
            );
        }
    },

    /**
     * Create new provider
     */
    async create(provider: Omit<ServiceProvider, 'id' | 'rating' | 'reviewCount' | 'completedJobs'>): Promise<ServiceProvider | null> {
        try {
            const supabase = getSupabase();

            const newProvider = {
                ...provider,
                rating: 0,
                reviewCount: 0,
                completedJobs: 0,
            };

            const { data, error } = await supabase
                .from('service_providers')
                .insert(newProvider)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Error creating provider (Mock only):', error);
            return {
                ...provider,
                id: Math.random().toString(36).substr(2, 9),
                rating: 0,
                reviewCount: 0,
                completedJobs: 0,
            };
        }
    },

    /**
     * Update provider
     */
    async update(id: string, updates: Partial<ServiceProvider>): Promise<ServiceProvider | null> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .update(updates)
                .eq('id', id)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('Error updating provider (Mock only):', error);
            const provider = MOCK_PROVIDERS.find(p => p.id === id);
            return provider ? { ...provider, ...updates } : null;
        }
    },

    /**
     * Delete provider
     */
    async delete(id: string): Promise<boolean> {
        try {
            const supabase = getSupabase();
            const { error } = await supabase
                .from('service_providers')
                .delete()
                .eq('id', id);

            if (error) throw error;
            return true;
        } catch (error) {
            console.error('Error deleting provider:', error);
            return false;
        }
    },
};

/**
 * Reviews CRUD operations
 */
export const reviewsService = {
    /**
     * Get reviews for a provider
     */
    async getByProvider(providerId: string): Promise<Review[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('reviews')
                .select('*')
                .eq('provider_id', providerId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            return (data || []).map((review: any) => ({
                id: review.id,
                providerId: review.provider_id,
                userId: review.user_id,
                userName: 'Usuario Anónimo',
                rating: review.rating,
                comment: review.comment,
                serviceType: review.service_type,
                createdAt: review.created_at,
            }));
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return MOCK_REVIEWS.filter(r => r.providerId === providerId);
        }
    },

    /**
     * Create new review
     */
    async create(review: { providerId: string; userId: string; rating: number; comment: string; serviceType: string }): Promise<Review | null> {
        try {
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
              full_name,
              avatar_url
            )
          `)
                .single();

            if (error) throw error;

            // Update provider ratings
            await this.updateProviderRating(review.providerId);

            return {
                id: data.id,
                providerId: data.provider_id,
                userId: data.user_id,
                userName: data.profiles?.full_name || 'Usuario',
                userAvatar: data.profiles?.avatar_url,
                rating: data.rating,
                comment: data.comment,
                serviceType: data.service_type,
                createdAt: data.created_at,
            };
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return {
                id: Math.random().toString(36).substr(2, 9),
                ...review,
                userName: 'Usuario Demo',
                createdAt: new Date().toISOString(),
            };
        }
    },

    /**
     * Update provider rating based on all reviews
     */
    async updateProviderRating(providerId: string): Promise<void> {
        try {
            const supabase = getSupabase();

            // Get all reviews for the provider
            const { data: reviews } = await supabase
                .from('reviews')
                .select('rating')
                .eq('provider_id', providerId);

            if (!reviews || reviews.length === 0) return;

            // Calculate average rating
            const totalRating = reviews.reduce((sum: number, review: any) => sum + review.rating, 0);
            const avgRating = totalRating / reviews.length;

            // Update provider
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
    /**
     * Create new service request
     */
    async create(request: {
        providerId: string;
        userId: string;
        preferredDate: string;
        preferredTime: string;
        description: string;
    }) {
        try {
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
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return {
                id: Math.random().toString(36).substr(2, 9),
                provider_id: request.providerId,
                user_id: request.userId,
                preferred_date: request.preferredDate,
                preferred_time: request.preferredTime,
                description: request.description,
                status: 'pending',
                created_at: new Date().toISOString(),
            };
        }
    },

    /**
     * Get requests for a user
     */
    async getByUser(userId: string) {
        try {
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
        } catch (error) {
            // Silent fallback for demo mode
            return MOCK_REQUESTS
                .filter(r => r.requesterId === userId)
                .map(r => {
                    const provider = MOCK_PROVIDERS.find(p => p.id === r.providerId) ||
                        MOCK_PROVIDERS.find(p => p.category === r.serviceType) ||
                        MOCK_PROVIDERS[0];
                    return {
                        ...r,
                        user_id: r.requesterId,
                        provider_id: r.providerId || provider.id,
                        preferred_date: r.createdAt.split('T')[0],
                        preferred_time: '10:00',
                        service_providers: {
                            name: provider.name,
                            category: provider.category,
                            contact_phone: provider.contactPhone
                        }
                    };
                });
        }
    },

    /**
     * Get requests for a provider
     */
    async getByProvider(providerId: string) {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_requests')
                .select(`
            *,
            profiles:user_id (
              full_name,
              email,
              phone
            )
          `)
                .eq('provider_id', providerId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return [];
        }
    },

    /**
     * Update request status
     */
    async updateStatus(requestId: string, status: 'pending' | 'accepted' | 'completed' | 'cancelled') {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_requests')
                .update({ status })
                .eq('id', requestId)
                .select()
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Using mock fallback for this operation');
            return { id: requestId, status };
        }
    },
};
