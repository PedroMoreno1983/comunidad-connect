import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { Review, ServiceProvider, ServiceProviderDatabaseRow } from "@/lib/types";
import { realPhotoUrl } from "@/lib/utils/stockPhoto";

function mapProvider(provider: ServiceProviderDatabaseRow): ServiceProvider {
    return {
        id: provider.id,
        name: provider.name,
        category: provider.category,
        rating: provider.rating,
        reviewCount: provider.review_count,
        contactPhone: provider.contact_phone,
        email: provider.email,
        photo: realPhotoUrl(provider.photo),
        bio: provider.bio,
        yearsExperience: provider.years_experience,
        specialties: provider.specialties,
        certifications: provider.certifications,
        hourlyRate: provider.hourly_rate,
        availability: provider.availability,
        responseTime: provider.response_time,
        completedJobs: provider.completed_jobs,
        verified: provider.verified,
        network: provider.community_id === null,
        backgroundCheckedAt: provider.background_checked_at ?? null,
        identityCheckedAt: provider.identity_checked_at ?? null,
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

        if (!data) return null;
        const { data: photos } = await supabase
            .from("service_provider_photos")
            .select("id, url, caption, created_at")
            .eq("provider_id", id)
            .order("created_at", { ascending: false })
            .limit(24);
        return {
            ...mapProvider(data as ServiceProviderDatabaseRow),
            workPhotos: (photos ?? []).map(photo => ({
                id: String(photo.id), url: String(photo.url), caption: photo.caption ? String(photo.caption) : null, createdAt: String(photo.created_at),
            })),
        };
    },

    async getReviews(providerId: string): Promise<Review[]> {
        const supabase = await createClient();
        const { data, error } = await supabase
            .from("reviews")
            .select("id, provider_id, user_id, rating, comment, service_type, created_at, verified_service, profiles:user_id(name, avatar_url)")
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
                userAvatar: realPhotoUrl(profile?.avatar_url),
                rating: review.rating,
                comment: review.comment,
                serviceType: review.service_type,
                createdAt: review.created_at,
                verifiedService: review.verified_service === true,
            };
        });
    },
};
