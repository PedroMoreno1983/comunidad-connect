/**
 * DirectoryService: directorio de vecinos.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    DirectoryNeighbor,
    User,
} from '../types';
import { getProfileName, getUnitLabel, isUuid } from './shared';

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
