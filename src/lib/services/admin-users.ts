/**
 * AdminUsersService: directorio de perfiles para administracion.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    AdminProfile,
    AdminUsersDirectory,
} from '../types';

// ==========================================
// Admin Users API
// ==========================================

export const AdminUsersService = {
    async getDirectory(currentUserId?: string): Promise<AdminUsersDirectory> {
        let communityId: string | null = null;
        let communityName = "Comunidad";
        let residentCode: string | null = null;
        let conciergeCode: string | null = null;

        if (currentUserId) {
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("community_id")
                .eq("id", currentUserId)
                .maybeSingle();

            if (profileError) throw profileError;
            communityId = typeof profile?.community_id === "string" ? profile.community_id : null;

            if (communityId) {
                const { data: community, error: communityError } = await supabase
                    .from("communities")
                    .select("name, resident_code, concierge_code")
                    .eq("id", communityId)
                    .maybeSingle();

                if (communityError) throw communityError;
                if (community) {
                    communityName = String(community.name || "Comunidad");
                    residentCode = typeof community.resident_code === "string" ? community.resident_code : null;
                    conciergeCode = typeof community.concierge_code === "string" ? community.concierge_code : null;
                }
            }
        }

        let query = supabase
            .from("profiles")
            .select("id, name, email, role, units(number)")
            .order("name");

        if (communityId) query = query.eq("community_id", communityId);

        const { data, error } = await query;
        if (error) throw error;

        return {
            users: (data || []) as AdminProfile[],
            communityName,
            residentCode,
            conciergeCode,
        };
    },
};
