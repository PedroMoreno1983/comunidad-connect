import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { apiErrorResponse } from '@/lib/observability/logger';
import {
    approveCommitteeDigest,
    CommitteeDigestError,
    generateCommitteeDigest,
    listCommitteeDigestsForAdmin,
    updateCommitteeDigestDraft,
} from '@/lib/committeeDigest/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireAdmin() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) throw new CommitteeDigestError('Inicia sesión.', 401);
    if (profile.role !== 'admin' || !profile.community_id) throw new CommitteeDigestError('Solo administración revisa el resumen semanal.', 403);
    return profile as typeof profile & { community_id: string };
}

function respondError(req: NextRequest, error: unknown) {
    if (error instanceof CommitteeDigestError) return NextResponse.json({ error: error.message }, { status: error.status });
    return apiErrorResponse(req, '/api/agent-center/committee-digest', error, { publicMessage: 'No se pudo gestionar el resumen semanal.' });
}

/** Borrador vigente e historial (admin). */
export async function GET(req: NextRequest) {
    try {
        const profile = await requireAdmin();
        return NextResponse.json(await listCommitteeDigestsForAdmin(profile.community_id));
    } catch (error) { return respondError(req, error); }
}

/**
 * Acciones del admin:
 *   { action: 'generate' }                       genera el de esta semana (idempotente)
 *   { action: 'update', digestId, content }      guarda la edición del borrador
 *   { action: 'approve', digestId, content? }    aprueba y comparte con el comité
 */
export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'agent-center.committee-digest', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await requireAdmin();
        const body = await req.json().catch(() => ({})) as Record<string, unknown>;
        const digestId = typeof body.digestId === 'string' ? body.digestId.slice(0, 60) : '';
        const content = typeof body.content === 'string' ? body.content.slice(0, 6000) : undefined;
        if (body.action === 'generate') {
            const result = await generateCommitteeDigest(profile.community_id, { actorId: profile.id, trigger: 'manual' });
            return NextResponse.json(result, { status: result.created ? 201 : 200 });
        }
        if (body.action === 'update') {
            return NextResponse.json({ digest: await updateCommitteeDigestDraft(profile.community_id, profile.id, digestId, content) });
        }
        if (body.action === 'approve') {
            return NextResponse.json(await approveCommitteeDigest(profile.community_id, profile.id, digestId, content));
        }
        throw new CommitteeDigestError('Acción no soportada.');
    } catch (error) { return respondError(req, error); }
}
