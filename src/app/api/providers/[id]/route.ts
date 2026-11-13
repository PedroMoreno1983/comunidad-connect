import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent, getRequestId } from '@/lib/operations/audit';
import { providerProfileUpdate } from '@/lib/services/providerProfile';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Editar un perfil de proveedor. Lo puede hacer el propio maestro (si tiene
 * cuenta) o la administración de su comunidad. Solo la administración cambia
 * `verified`.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: 'Proveedor no válido.' }, { status: 400 });

    const { data: provider } = await supabaseAdmin.from('service_providers')
        .select('id, name, user_id, community_id, verified').eq('id', id).maybeSingle();
    if (!provider || provider.community_id !== profile.community_id) {
        return NextResponse.json({ error: 'Proveedor no encontrado.' }, { status: 404 });
    }
    const isAdmin = profile.role === 'admin';
    const isOwner = provider.user_id === profile.id;
    if (!isAdmin && !isOwner) return NextResponse.json({ error: 'Solo el proveedor o la administración pueden editar este perfil.' }, { status: 403 });

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const update: Record<string, unknown> = {};
    if (typeof body.verified === 'boolean') {
        if (!isAdmin) return NextResponse.json({ error: 'Solo la administración verifica proveedores.' }, { status: 403 });
        update.verified = body.verified;
    }
    const { verified: _verified, ...profileFields } = body;
    void _verified;
    if (Object.keys(profileFields).length > 0) {
        const result = providerProfileUpdate(profileFields);
        if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
        Object.assign(update, result.update);
    }
    if (Object.keys(update).length === 0) return NextResponse.json({ error: 'No hay cambios para guardar.' }, { status: 400 });

    const { error } = await supabaseAdmin.from('service_providers').update(update).eq('id', id).eq('community_id', profile.community_id);
    if (error) return NextResponse.json({ error: 'No se pudo guardar el perfil.' }, { status: 500 });

    await recordOperationEvent({
        communityId: profile.community_id,
        actorId: profile.id,
        actorRole: profile.role,
        action: 'verified' in update && Object.keys(update).length === 1 ? 'service_provider.verification_changed' : 'service_provider.profile_updated',
        entityType: 'service_provider',
        entityId: id,
        severity: 'success',
        status: 'success',
        summary: 'verified' in update
            ? `${provider.name}: ${update.verified ? 'verificado' : 'sin verificar'} por la administración`
            : `Perfil de ${provider.name} actualizado`,
        metadata: { fields: Object.keys(update) },
        requestId: getRequestId(request),
    });
    return NextResponse.json({ ok: true });
}
