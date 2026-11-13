import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { CANONICAL_SITE_URL } from '@/lib/config';
import { createProviderInvite } from '@/lib/services/providerPortal';
import { providerProfileUpdate } from '@/lib/services/providerProfile';
import type { NetworkProviderInput, NetworkProviderRow, ProviderInviteLink, SuperAdminProvidersResponse } from '@/lib/types';

/**
 * Lo que hace Convive (superadmin) con la Red de maestros: ver la red y los
 * maestros de cada comunidad, sumar uno a la red (o devolverlo a una
 * comunidad), registrar uno directo en la red, verificarlo y enviarle su
 * enlace. Corre con la service role: la ruta ya comprobó que es superadmin.
 */

export class ProviderNetworkError extends Error {
    constructor(message: string, readonly status: number) {
        super(message);
    }
}

const CATEGORIES = ['plumbing', 'electrical', 'locksmith', 'cleaning', 'general'] as const;
const COLUMNS = 'id, name, category, contact_phone, email, verified, rating, review_count, completed_jobs, community_id, user_id';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Row = Record<string, unknown>;

function toRow(row: Row, communityNames: Map<string, string>): NetworkProviderRow {
    const communityId = row.community_id ? String(row.community_id) : null;
    return {
        id: String(row.id),
        name: String(row.name),
        category: String(row.category || 'general'),
        contactPhone: String(row.contact_phone || ''),
        email: row.email ? String(row.email) : null,
        verified: row.verified === true,
        rating: Number(row.rating || 0),
        reviewCount: Number(row.review_count || 0),
        completedJobs: Number(row.completed_jobs || 0),
        communityId,
        communityName: communityId ? communityNames.get(communityId) || 'Comunidad' : null,
        hasAccount: Boolean(row.user_id),
    };
}

export async function listProviderNetwork(): Promise<SuperAdminProvidersResponse> {
    const admin = getSupabaseAdmin();
    const [network, community, communities] = await Promise.all([
        admin.from('service_providers').select(COLUMNS).is('community_id', null).order('name').limit(500),
        // Candidatos para la red: los mejor evaluados de cada comunidad.
        admin.from('service_providers').select(COLUMNS).not('community_id', 'is', null)
            .order('rating', { ascending: false }).order('completed_jobs', { ascending: false }).limit(300),
        admin.from('communities').select('id, name').order('name'),
    ]);
    if (network.error || community.error || communities.error) throw new ProviderNetworkError('No se pudo cargar la red de maestros.', 500);
    const names = new Map((communities.data || []).map(row => [String(row.id), String(row.name || 'Comunidad')]));
    return {
        network: (network.data || []).map(row => toRow(row, names)),
        community: (community.data || []).map(row => toRow(row, names)),
        communities: (communities.data || []).map(row => ({ id: String(row.id), name: String(row.name || 'Comunidad') })),
    };
}

export async function createNetworkProvider(input: NetworkProviderInput) {
    const category = CATEGORIES.includes(input.category as typeof CATEGORIES[number]) ? input.category : null;
    if (!category) throw new ProviderNetworkError('Elige el oficio del maestro.', 400);
    const result = providerProfileUpdate({
        name: input.name, contactPhone: input.contactPhone, email: input.email ?? '', bio: input.bio ?? '',
        specialties: input.specialties ?? [],
    });
    if ('error' in result) throw new ProviderNetworkError(result.error, 400);
    if (!result.update.name || !result.update.contact_phone) throw new ProviderNetworkError('Nombre y teléfono son obligatorios.', 400);

    const admin = getSupabaseAdmin();
    const digits = String(result.update.contact_phone).replace(/\D/g, '').slice(-8);
    const { data: same } = await admin.from('service_providers').select('id, name, contact_phone')
        .is('community_id', null).ilike('contact_phone', `%${digits.split('').join('%')}`);
    const duplicate = (same || []).find(row => String(row.contact_phone || '').replace(/\D/g, '').slice(-8) === digits);
    if (duplicate) throw new ProviderNetworkError(`${duplicate.name} ya está en la red con ese teléfono.`, 409);

    const { data, error } = await admin.from('service_providers').insert({
        ...result.update,
        category,
        community_id: null,
        user_id: null,
        verified: false,
        availability: 'available',
        rating: 0,
        review_count: 0,
        completed_jobs: 0,
    }).select('id').single();
    if (error || !data) throw new ProviderNetworkError('No se pudo registrar al maestro.', 500);
    return { id: String(data.id) };
}

/** Suma un maestro a la red (communityId null) o lo deja en una comunidad. */
export async function moveProvider(providerId: string, communityId: string | null) {
    if (!UUID.test(providerId)) throw new ProviderNetworkError('Proveedor no válido.', 400);
    const admin = getSupabaseAdmin();
    if (communityId !== null) {
        if (!UUID.test(communityId)) throw new ProviderNetworkError('Comunidad no válida.', 400);
        const { data: community } = await admin.from('communities').select('id').eq('id', communityId).maybeSingle();
        if (!community) throw new ProviderNetworkError('Esa comunidad no existe.', 404);
    }
    const { data: provider } = await admin.from('service_providers').select('id, user_id, community_id').eq('id', providerId).maybeSingle();
    if (!provider) throw new ProviderNetworkError('Proveedor no encontrado.', 404);
    // Un maestro con cuenta pertenece a la comunidad de su perfil: su panel y
    // sus permisos dependen de ella.
    if (provider.user_id) throw new ProviderNetworkError('Este maestro tiene cuenta en una comunidad; por ahora solo se suman a la red maestros externos.', 409);
    const { error } = await admin.from('service_providers').update({ community_id: communityId }).eq('id', providerId);
    if (error) throw new ProviderNetworkError('No se pudo mover al maestro.', 500);
    // Los enlaces del alcance anterior ya no sirven (resolveLink también lo
    // comprueba); se revocan para que no queden vivos.
    await admin.from('service_provider_links').update({ revoked_at: new Date().toISOString() })
        .eq('provider_id', providerId).is('revoked_at', null);
}

export async function setNetworkProviderVerified(providerId: string, verified: boolean) {
    if (!UUID.test(providerId)) throw new ProviderNetworkError('Proveedor no válido.', 400);
    const { data, error } = await getSupabaseAdmin().from('service_providers')
        .update({ verified }).eq('id', providerId).is('community_id', null).select('id').maybeSingle();
    if (error) throw new ProviderNetworkError('No se pudo guardar.', 500);
    if (!data) throw new ProviderNetworkError('Ese maestro no está en la red.', 404);
}

export async function createNetworkInvite(providerId: string, superAdminId: string): Promise<ProviderInviteLink> {
    if (!UUID.test(providerId)) throw new ProviderNetworkError('Proveedor no válido.', 400);
    // created_by apunta a profiles: solo si el superadmin tiene perfil.
    const { data: profile } = await getSupabaseAdmin().from('profiles').select('id').eq('id', superAdminId).maybeSingle();
    const invite = await createProviderInvite(null, profile ? superAdminId : null, providerId);
    return { url: `${CANONICAL_SITE_URL}/proveedor/${invite.token}`, expiresAt: invite.expiresAt, providerName: invite.providerName };
}
