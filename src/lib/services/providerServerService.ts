import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Review, ServiceProvider, ServiceProviderDatabaseRow } from "@/lib/types";

function mapProvider(provider: ServiceProviderDatabaseRow): ServiceProvider {
    return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        rating: provider.rating,
        reviewCount: provider.review_count,
        contactPhone: provider.contact_phone,
        email: provider.email,
        photo: provider.photo,
        bio: provider.bio,
        yearsExperience: provider.years_experience,
        specialties: provider.specialties,
        certifications: provider.certifications,
        hourlyRate: provider.hourly_rate,
        availability: provider.availability,
        responseTime: provider.response_time,
        completedJobs: provider.completed_jobs,
        verified: provider.verified,
    };
}

export const providerServerService = {
    async getAll(): Promise<ServiceProvider[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("service_providers")
            .select("*")
            .order("rating", { ascending: false });

        if (error) {
            console.warn("[providerServerService] Providers unavailable:", error.message);
            return [];
        }

        return ((data ?? []) as ServiceProviderDatabaseRow[]).map(mapProvider);
    },

    async getByCategory(category: string): Promise<ServiceProvider[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("service_providers")
            .select("*")
            .eq("category", category)
            .order("rating", { ascending: false });

        if (error) {
            console.warn("[providerServerService] Category unavailable:", error.message);
            return [];
        }

        return ((data ?? []) as ServiceProviderDatabaseRow[]).map(mapProvider);
    },

    async getById(id: string): Promise<ServiceProvider | null> {
        if (!id || id === "undefined") return null;

        const supabase = await createClient();
        const { data, error } = await supabase
            .from("service_providers")
            .select("*")
            .eq("id", id)
            .maybeSingle();

        if (error) {
            console.warn("[providerServerService] Provider unavailable:", error.message);
            return null;
        }

        return data ? mapProvider(data as ServiceProviderDatabaseRow) : null;
    },

    async getReviews(providerId: string): Promise<Review[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("reviews")
            .select("id, provider_id, user_id, rating, comment, service_type, created_at, profiles:user_id(name, avatar_url)")
            .eq("provider_id", providerId)
            .order("created_at", { ascending: false });

        if (error) {
            console.warn("[providerServerService] Reviews unavailable:", error.message);
            return [];
        }

        return (data ?? []).map(review => {
            const joined = review.profiles;
            const profile = Array.isArray(joined) ? joined[0] : joined;
            return {
                id: review.id,
                providerId: review.provider_id,
                userId: review.user_id,
                userName: profile?.name || "Residente",
                userAvatar: profile?.avatar_url || undefined,
                rating: review.rating,
                comment: review.comment,
                serviceType: review.service_type,
                createdAt: review.created_at,
            };
        });
    },
};
