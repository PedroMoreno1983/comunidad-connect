import { randomBytes } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { hashSecret } from '@/lib/security/apiKeys';
import { getMonthlyReport, getReserveFund } from '@/lib/finance/reportingService';
import { getCommunityBalances } from '@/lib/finance/collectionService';
import { currentMonthInChile } from '@/lib/finance/chileDates';
import type { OversightLink, OversightReport } from '@/lib/types';

const MAX_DAYS = 180;
const MONTHS_SHOWN = 6;
const LINK_COLUMNS = 'id, label, expires_at, created_at, revoked_at, last_viewed_at, view_count';

export class OversightError extends Error {
    constructor(message: string, public status = 400) {
        super(message);
    }
}

function toLink(row: Record<string, unknown>): OversightLink {
    return {
        id: String(row.id),
        label: String(row.label),
        expiresAt: String(row.expires_at),
        createdAt: String(row.created_at),
        revokedAt: (row.revoked_at as string | null) ?? null,
        lastViewedAt: (row.last_viewed_at as string | null) ?? null,
        viewCount: Number(row.view_count || 0),
    };
}

export async function listOversightLinks(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('oversight_links').select(LINK_COLUMNS)
        .eq('community_id', communityId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toLink);
}

export async function createOversightLink(communityId: string, createdBy: string, input: { label: string; days: number }) {
    const label = input.label.trim().slice(0, 120);
    if (label.length < 2) throw new OversightError('Indica para quién es el acceso.');
    const days = Math.round(Number(input.days));
    if (!(days >= 1 && days <= MAX_DAYS)) throw new OversightError(`El acceso dura entre 1 y ${MAX_DAYS} días.`);
    const token = randomBytes(24).toString('base64url');
    const { data, error } = await getSupabaseAdmin().from('oversight_links').insert({
        community_id: communityId,
        label,
        token_hash: hashSecret(token),
        expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
        created_by: createdBy,
    }).select(LINK_COLUMNS).single();
    if (error) throw error;
    return { link: toLink(data), token };
}

export async function revokeOversightLink(communityId: string, linkId: string) {
    const { error } = await getSupabaseAdmin().from('oversight_links')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', linkId).eq('community_id', communityId).is('revoked_at', null);
    if (error) throw error;
}

function previousMonths(count: number) {
    const [year, month] = currentMonthInChile().split('-').map(Number);
    return Array.from({ length: count }, (_, index) => {
        const date = new Date(Date.UTC(year, month - 1 - index, 1));
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    });
}

/**
 * Lo que ve el fiscalizador: rendición de los últimos meses, fondo de reserva
 * y morosidad agregada. Nunca deudas por unidad ni datos de personas.
 */
export async function getOversightReport(token: string): Promise<OversightReport> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new OversightError('Enlace inválido.', 404);
    const admin = getSupabaseAdmin();
    const { data: link, error } = await admin.from('oversight_links')
        .select('id, community_id, label, expires_at, revoked_at, view_count')
        .eq('token_hash', hashSecret(token)).maybeSingle();
    if (error) throw error;
    if (!link || link.revoked_at) throw new OversightError('Este enlace no existe o fue revocado.', 404);
    if (new Date(link.expires_at).getTime() <= Date.now()) throw new OversightError('Este enlace venció. Pide uno nuevo a la administración.', 410);

    const communityId = String(link.community_id);
    const [{ data: community }, reports, reserve, balances] = await Promise.all([
        admin.from('communities').select('name, address').eq('id', communityId).maybeSingle(),
        Promise.all(previousMonths(MONTHS_SHOWN).map(month => getMonthlyReport(communityId, month))),
        getReserveFund(communityId),
        getCommunityBalances(communityId),
    ]);

    await admin.from('oversight_links').update({
        last_viewed_at: new Date().toISOString(),
        view_count: Number(link.view_count || 0) + 1,
    }).eq('id', link.id);

    return {
        community: { name: String(community?.name || 'Comunidad'), address: (community?.address as string | null) ?? null },
        label: String(link.label),
        expiresAt: String(link.expires_at),
        generatedAt: new Date().toISOString(),
        months: reports,
        reserveFundBalance: reserve.balance,
        debt: {
            totalDebt: balances.totalDebt,
            totalOverdue: balances.totalOverdue,
            unitsWithDebt: balances.unitsWithDebt,
            unitsOverdue: balances.unitsOverdue,
            totalUnits: balances.units.length,
        },
    };
}
