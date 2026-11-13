import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { CANONICAL_SITE_URL } from '@/lib/config';
import { ProviderPortalError, createProviderInvite } from '@/lib/services/providerPortal';
import type { ProviderInviteLink } from '@/lib/types';

export const runtime = 'nodejs';

/**
 * La administración genera el enlace con que un maestro externo (sin cuenta)
 * gestiona su perfil y sus solicitudes. Generar uno nuevo revoca el anterior.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    if (profile.role !== 'admin') return NextResponse.json({ error: 'Solo la administración envía enlaces a proveedores.' }, { status: 403 });
    const { id } = await params;
    try {
        const invite = await createProviderInvite(profile.community_id, profile.id, id);
        const link: ProviderInviteLink = {
            url: `${CANONICAL_SITE_URL}/proveedor/${invite.token}`,
            expiresAt: invite.expiresAt,
            providerName: invite.providerName,
        };
        return NextResponse.json(link, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        if (error instanceof ProviderPortalError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo crear el enlace.' }, { status: 500 });
    }
}
