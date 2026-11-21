/**
 * Auxiliares compartidos por los ejecutores de herramientas de CoCo (21-11-2026).
 * Se movieron tal cual desde tools.ts al dividirlo por dominio.
 */
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';

/** Lo devuelve un ejecutor de dominio cuando la herramienta no es suya. */
export const NOT_HANDLED = Symbol('coco-tool-not-handled');

// ── Executor ─────────────────────────────────────────────────────────────────

export interface UserContext {
    user_id?: string;
    unit_id?: string;
    role?: string;
    community_id?: string;
    name?: string;
    channel?: string;
    currentPage?: string;
    /** Ver CoCoUserContext.syncReply en agent.ts. */
    syncReply?: boolean;
}

export function isStaff(userCtx: UserContext) {
    return userCtx.role === 'admin' || userCtx.role === 'concierge' || userCtx.role === 'system';
}

export function isAdmin(userCtx: UserContext) {
    return userCtx.role === 'admin' || userCtx.role === 'system';
}

export function isUuid(value?: string) {
    return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function isIsoDate(value?: string) {
    return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)));
}

export function isTime(value?: string) {
    return Boolean(value && /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value));
}

/** Monto en pesos desde texto: descarta separadores y símbolos ("$150.000" -> 150000). */
export function parsePesos(raw?: string): number {
    return Number(String(raw ?? '').replace(/[^\d]/g, ''));
}

export async function scopedUnit(userCtx: UserContext, requestedUnitId?: string) {
    const communityId = scopedCommunity(userCtx);
    if (!communityId) return undefined;
    let unitReference = isStaff(userCtx) ? requestedUnitId || userCtx.unit_id : userCtx.unit_id;

    if (!isStaff(userCtx) && !unitReference && userCtx.user_id) {
        const { data: ownedUnits } = await supabaseAdmin
            .from('units')
            .select('id')
            .eq('community_id', communityId)
            .eq('owner_id', userCtx.user_id)
            .limit(2);
        if (ownedUnits?.length === 1) unitReference = ownedUnits[0].id;
    }
    if (!unitReference) return undefined;

    if (isUuid(unitReference)) {
        const { data } = await supabaseAdmin
            .from('units')
            .select('id')
            .eq('community_id', communityId)
            .eq('id', unitReference)
            .maybeSingle();
        return data?.id;
    }

    const cleanReference = unitReference.trim().slice(0, 80);
    const byNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('number', cleanReference)
        .limit(2);
    if (byNumber.data?.length === 1) return byNumber.data[0].id;

    const byLegacyNumber = await supabaseAdmin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('unit_number', cleanReference)
        .limit(2);
    return byLegacyNumber.data?.length === 1 ? byLegacyNumber.data[0].id : undefined;
}

export function scopedCommunity(userCtx: UserContext, _requestedCommunityId?: string) {
    void _requestedCommunityId;
    return isUuid(userCtx.community_id) ? userCtx.community_id : undefined;
}

export function forbidden(message = 'No tienes permiso para ejecutar esta herramienta.') {
    return { error: message };
}
