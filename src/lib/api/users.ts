import { supabase } from '../supabase';
import { formatWhatsAppPhone } from '../whatsapp';
import {
    AdminProfile,
    AdminUsersDirectory,
    DirectoryNeighbor,
    ProfileSettings,
    User,
} from '../types';
import { isUuid } from './_shared';

function getProfileName(profile: Record<string, unknown>) {
    const rawName = String(profile.name || profile.full_name || "").trim();
    const email = String(profile.email || "").trim();
    if (rawName && rawName !== email) return rawName;
    if (email) return email.split("@")[0];
    return "Vecino";
}

function getUnitLabel(profile: Record<string, unknown>, unit?: Record<string, unknown>) {
    const profileDepartment = String(profile.department_number || "").trim();
    if (profileDepartment) return profileDepartment;

    const unitNumber = String(unit?.number || unit?.unit_number || unit?.department_number || "").trim();
    const tower = String(unit?.tower || "").trim();
    if (unitNumber && tower) return `${tower}-${unitNumber}`;
    if (unitNumber) return unitNumber;

    const rawUnitId = String(profile.unit_id || "").trim();
    return rawUnitId && !isUuid(rawUnitId) ? rawUnitId : "";
}

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

// ==========================================
// Directory API
// ==========================================

export const DirectoryService = {
    async getNeighbors(user: Pick<User, "id" | "email">): Promise<DirectoryNeighbor[]> {

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .neq('id', user.id)
            .order('name');

        if (error) throw error;

        const profiles = Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
        const unitIds = Array.from(new Set(
            profiles
                .map(profile => String(profile.unit_id || ""))
                .filter(unitId => isUuid(unitId))
        ));

        let unitById = new Map<string, Record<string, unknown>>();
        if (unitIds.length > 0) {
            const { data: unitsData, error: unitsError } = await supabase
                .from('units')
                .select('*')
                .in('id', unitIds);

            if (!unitsError && Array.isArray(unitsData)) {
                unitById = new Map((unitsData as Array<Record<string, unknown>>).map(unit => [String(unit.id), unit]));
            }
        }

        return profiles.map(profile => {
            const unitId = String(profile.unit_id || "");
            const unit = unitById.get(unitId);

            return {
                id: String(profile.id),
                name: getProfileName(profile),
                avatar_url: typeof profile.avatar_url === "string" ? profile.avatar_url : undefined,
                role: (profile.role === "admin" || profile.role === "concierge" ? profile.role : "resident") as DirectoryNeighbor["role"],
                unit_id: unitId,
                unitLabel: getUnitLabel(profile, unit),
                email: typeof profile.email === "string" ? profile.email : undefined,
            };
        });
    },
};

// ==========================================
// Community Collaboration API
// ==========================================

async function updateUnitSafely(unitId: string, values: Record<string, unknown>) {
    const { error } = await supabase.from('units').update(values).eq('id', unitId);
    if (!error) return;

    if ('tower' in values) {
        const fallbackValues = { ...values };
        delete fallbackValues.tower;
        const fallback = await supabase.from('units').update(fallbackValues).eq('id', unitId);
        if (!fallback.error) return;
        throw fallback.error;
    }

    throw error;
}

async function insertUnitSafely(values: Record<string, unknown>) {
    const { error } = await supabase.from('units').insert(values);
    if (!error) return;

    if ('tower' in values) {
        const fallbackValues = { ...values };
        delete fallbackValues.tower;
        const fallback = await supabase.from('units').insert(fallbackValues);
        if (!fallback.error) return;
        throw fallback.error;
    }

    throw error;
}

// ==========================================
// Profile API
// ==========================================

export const ProfileService = {
    async getSettings(userId: string): Promise<ProfileSettings> {
        const { data } = await supabase
            .from('profiles')
            .select('name, avatar_url, phone_number, whatsapp_enabled')
            .eq('id', userId)
            .maybeSingle();

        const { data: unitData } = await supabase
            .from('units')
            .select('*')
            .eq('owner_id', userId)
            .maybeSingle();

        const unit = unitData as Record<string, string | null | undefined> | null;

        return {
            avatarUrl: typeof data?.avatar_url === "string" ? data.avatar_url : undefined,
            phoneNumber: typeof data?.phone_number === "string" ? data.phone_number.replace('+56', '') : "",
            whatsappEnabled: Boolean(data?.whatsapp_enabled),
            unitNumber: unit?.number || unit?.unit_number || "",
            unitTower: unit?.tower || "",
        };
    },

    async uploadAvatar(userId: string, file: File): Promise<string> {
        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('userId', userId);

        const response = await fetch('/api/profile/avatar', {
            method: 'POST',
            body: formData,
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(typeof data.error === 'string' ? data.error : 'No se pudo subir la foto.');
        }

        if (typeof data.avatarUrl !== 'string' || !data.avatarUrl) {
            throw new Error('La foto se subio, pero no se recibio la URL publica.');
        }

        return data.avatarUrl;
    },

    async saveProfile(userId: string, values: { fullName: string; unitNumber: string; unitTower: string }) {
        const unitNumber = values.unitNumber.trim();
        const unitTower = values.unitTower.trim();
        const departmentNumber = unitNumber || unitTower;
        const { error: profileError } = await supabase
            .from('profiles')
            .update({ name: values.fullName.trim(), department_number: departmentNumber || null })
            .eq('id', userId);

        if (profileError) throw profileError;

        if (!unitNumber) return;

        const { data: existingUnit } = await supabase
            .from('units')
            .select('id')
            .eq('owner_id', userId)
            .maybeSingle();

        if (existingUnit) {
            await updateUnitSafely(existingUnit.id, { number: unitNumber, tower: unitTower });
            return;
        }

        const { data: foundUnit } = await supabase
            .from('units')
            .select('id')
            .eq('number', unitNumber)
            .is('owner_id', null)
            .maybeSingle();

        if (foundUnit) {
            await updateUnitSafely(foundUnit.id, { owner_id: userId, tower: unitTower });
            return;
        }

        await insertUnitSafely({
            number: unitNumber,
            tower: unitTower,
            owner_id: userId,
            floor: parseInt(unitNumber.substring(0, 1)) || 1,
        });
    },

    async sendPasswordReset(email: string, redirectTo: string) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
    },

    async saveWhatsapp(userId: string, phoneNumber: string, whatsappEnabled: boolean) {
        const { error } = await supabase.from('profiles').update({
            phone_number: formatWhatsAppPhone(phoneNumber),
            whatsapp_enabled: whatsappEnabled,
        }).eq('id', userId);

        if (error) throw error;

        const consentResponse = await fetch('/api/privacy/consents', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ consentType: 'whatsapp', granted: whatsappEnabled }),
        });
        if (!consentResponse.ok) {
            const consentResult = await consentResponse.json().catch(() => ({})) as { error?: string };
            throw new Error(consentResult.error || 'No se pudo registrar el consentimiento de WhatsApp.');
        }
    },
};

// ==========================================
// Resident Home API
// ==========================================
