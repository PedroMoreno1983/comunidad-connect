import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { apiErrorResponse } from '@/lib/observability/logger';
import { CommitteeDigestError, listPublishedCommitteeDigests } from '@/lib/committeeDigest/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Vista de solo lectura para el comité vigente (y admins): resúmenes ya aprobados. */
export async function GET(req: NextRequest) {
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) throw new CommitteeDigestError('Inicia sesión.', 401);
        if (!profile.community_id || !['admin', 'resident'].includes(profile.role)) {
            throw new CommitteeDigestError('El resumen semanal está disponible para el comité.', 403);
        }
        return NextResponse.json({ digests: await listPublishedCommitteeDigests(profile.community_id, profile) });
    } catch (error) {
        if (error instanceof CommitteeDigestError) return NextResponse.json({ error: error.message }, { status: error.status });
        return apiErrorResponse(req, '/api/committee-digests', error, { publicMessage: 'No se pudo cargar el resumen semanal.' });
    }
}
