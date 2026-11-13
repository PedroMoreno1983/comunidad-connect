import 'server-only';

import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { ProviderMediaError, type MediaActor } from '@/lib/services/providerMedia';
import { ProviderPortalError } from '@/lib/services/providerPortal';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ProviderManager = {
    providerId: string;
    actor: MediaActor;
    /** Administración de la comunidad del proveedor: puede revisar documentos. */
    isReviewer: boolean;
};

/**
 * Quién gestiona un proveedor con sesión: el propio maestro (si tiene cuenta) o
 * la administración de su comunidad. Un maestro de la Red Convive lo gestiona
 * Convive (rutas de superadmin) o él mismo con su enlace.
 */
export async function requireProviderManager(providerId: string): Promise<ProviderManager | NextResponse> {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (!UUID.test(providerId)) return NextResponse.json({ error: 'Proveedor no válido.' }, { status: 400 });
    const { data: provider } = await supabaseAdmin.from('service_providers')
        .select('id, user_id, community_id').eq('id', providerId).maybeSingle();
    if (!provider) return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    const isOwner = provider.user_id === profile.id;
    const isCommunityAdmin = profile.role === 'admin' && provider.community_id === profile.community_id;
    if (!isOwner && !isCommunityAdmin) {
        return NextResponse.json({
            error: provider.community_id === null
                ? 'Este maestro es de la Red Convive: lo gestiona Convive.'
                : 'Solo el maestro o la administración de su comunidad pueden gestionar este perfil.',
        }, { status: 403 });
    }
    return { providerId: String(provider.id), actor: { id: profile.id, role: isCommunityAdmin ? 'admin' : 'provider' }, isReviewer: isCommunityAdmin };
}

export function mediaFailure(error: unknown) {
    if (error instanceof ProviderMediaError || error instanceof ProviderPortalError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error('[provider media]', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'No se pudo completar la operación.' }, { status: 500 });
}
