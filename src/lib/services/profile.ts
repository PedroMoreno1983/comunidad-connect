/**
 * ProfileService: perfil, unidad y configuracion del residente.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import { formatWhatsAppPhone } from '../whatsapp';
import type {
    ProfileSettings,
} from '../types';

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
