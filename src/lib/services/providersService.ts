import { createClient } from '@/lib/supabase/client';
import type { ServiceProvider, Review } from '@/lib/types';

// Standard client that works in both client and server (without cookies auto-handling on server)
const getSupabase = () => createClient();

const demoProviders: ServiceProvider[] = [
    {
        id: 'demo-provider-plumbing',
        name: 'Aguas Norte SpA',
        category: 'plumbing',
        rating: 4.8,
        reviewCount: 36,
        contactPhone: '+56 9 8123 4567',
        email: 'contacto@aguasnorte.cl',
        photo: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?q=80&w=800&auto=format&fit=crop',
        bio: 'Equipo certificado para filtraciones, mantencion de bombas, matrices y emergencias en comunidades residenciales.',
        yearsExperience: 9,
        specialties: ['Filtraciones', 'Bombas de agua', 'Mantencion preventiva'],
        certifications: ['SEC instalaciones sanitarias', 'Emergencias 24/7'],
        hourlyRate: 28000,
        availability: 'available',
        responseTime: '< 2 horas',
        completedJobs: 184,
        verified: true,
    },
    {
        id: 'demo-provider-electrical',
        name: 'ElectroComunidad',
        category: 'electrical',
        rating: 4.7,
        reviewCount: 28,
        contactPhone: '+56 9 7234 1188',
        email: 'agenda@electrocomunidad.cl',
        photo: 'https://images.unsplash.com/photo-1621905252507-b35492cc74b4?q=80&w=800&auto=format&fit=crop',
        bio: 'Electricistas para tableros, luminarias, citofonia, portones y diagnostico de fallas en departamentos.',
        yearsExperience: 7,
        specialties: ['Tableros electricos', 'Luminarias', 'Portones'],
        certifications: ['SEC clase B'],
        hourlyRate: 32000,
        availability: 'available',
        responseTime: '< 3 horas',
        completedJobs: 141,
        verified: true,
    },
    {
        id: 'demo-provider-cleaning',
        name: 'Brillo Urbano',
        category: 'cleaning',
        rating: 4.6,
        reviewCount: 22,
        contactPhone: '+56 9 6642 9001',
        email: 'operaciones@brillourbano.cl',
        photo: 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?q=80&w=800&auto=format&fit=crop',
        bio: 'Limpieza profunda post obra, sanitizacion, alfombras y apoyo para eventos en espacios comunes.',
        yearsExperience: 6,
        specialties: ['Sanitizacion', 'Post obra', 'Eventos'],
        certifications: ['Protocolos MINSAL'],
        hourlyRate: 22000,
        availability: 'busy',
        responseTime: '< 24 horas',
        completedJobs: 96,
        verified: true,
    },
    {
        id: 'demo-provider-general',
        name: 'Mantenciones Pro',
        category: 'general',
        rating: 4.5,
        reviewCount: 31,
        contactPhone: '+56 9 5571 2300',
        email: 'servicios@mantencionespro.cl',
        photo: 'https://images.unsplash.com/photo-1504917595217-d4dc5ebe6122?q=80&w=800&auto=format&fit=crop',
        bio: 'Reparaciones generales, pintura, ajuste de puertas, quincalleria y mantencion menor para unidades.',
        yearsExperience: 11,
        specialties: ['Pintura', 'Quincalleria', 'Reparaciones menores'],
        certifications: ['Prevencion de riesgos'],
        hourlyRate: 25000,
        availability: 'available',
        responseTime: '< 4 horas',
        completedJobs: 219,
        verified: true,
    },
];

function mapProvider(p: any): ServiceProvider {
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
}

/**
 * Service Providers CRUD operations
 */
export const providersService = {
    async getAll(): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .order('rating', { ascending: false });
            if (error) throw error;

            const providers = (data || []).map(mapProvider);
            return providers.length ? providers : demoProviders;
        } catch (error) {
            console.warn('[providersService] Falling back to demo providers:', error);
            return demoProviders;
        }
    },

    async getByCategory(category: string): Promise<ServiceProvider[]> {
        try {
            const supabase = getSupabase();
            const { data, error } = await supabase
                .from('service_providers')
                .select('*')
                .eq('category', category)
                .order('rating', { ascending: false });
            if (error) throw error;

            const providers = (data || []).map(mapProvider);
            return providers.length ? providers : demoProviders.filter(provider => provider.category === category);
        } catch (error) {
            console.warn('[providersService] Falling back to demo category providers:', error);
            return demoProviders.filter(provider => provider.category === category);
        }
    },

    async getById(id: string): Promise<ServiceProvider | null> {
        if (!id || id === 'undefined') return null;
        const demoProvider = demoProviders.find(provider => provider.id === id);
        if (demoProvider) return demoProvider;

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

    async getByUser(userId: string): Promise<ServiceProvider[]> {
        if (!userId) return [];
        const supabase = getSupabase();
        const { data, error } = await supabase
            .from('service_providers')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

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
            .select(`
                *,
                profiles:user_id (
                  name,
                  avatar_url
                )
            `)
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        return (data || []).map((review: {
            id: string;
            provider_id: string;
            user_id: string;
            rating: number;
            comment: string;
            service_type: string;
            created_at: string;
            profiles?: { name?: string | null; avatar_url?: string | null } | { name?: string | null; avatar_url?: string | null }[] | null;
        }) => {
            const profile = Array.isArray(review.profiles) ? review.profiles[0] : review.profiles;

            return {
                id: review.id,
                providerId: review.provider_id,
                userId: review.user_id,
                userName: profile?.name || 'Residente',
                userAvatar: profile?.avatar_url || undefined,
                rating: review.rating,
                comment: review.comment,
                serviceType: review.service_type,
                createdAt: review.created_at,
            };
        });
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
                    review_count: reviews.length,
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
            .select('*')
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const requests = data || [];
        const userIds = Array.from(new Set(requests.map((request: { user_id?: string }) => request.user_id).filter(Boolean)));

        if (userIds.length === 0) {
            return requests;
        }

        const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name, email')
            .in('id', userIds);

        const profileById = new Map((profiles || []).map((profile: { id: string; name?: string; email?: string }) => [profile.id, profile]));

        return requests.map((request: { user_id?: string }) => ({
            ...request,
            profiles: request.user_id ? profileById.get(request.user_id) || null : null,
        }));
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
