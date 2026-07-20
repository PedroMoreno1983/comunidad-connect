import { NextResponse } from 'next/server';
import { isAiBudgetExceededError } from '@/lib/ai/budget';
import { extractResidentsFromBuffer, MAX_ONBOARDING_FILE_BYTES } from '@/lib/onboarding/documentExtractor';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'onboarding.extract', { limit: 12, windowMs: 60_000 });
    if (limited) return limited;
    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
        if (profile.role !== 'admin') return NextResponse.json({ error: 'Permisos insuficientes' }, { status: 403 });
        const formData = await request.formData();
        const file = formData.get('file');
        if (!(file instanceof File)) return NextResponse.json({ error: 'No se adjunto ningun archivo.' }, { status: 400 });
        if (file.size > MAX_ONBOARDING_FILE_BYTES) return NextResponse.json({ error: 'Archivo demasiado grande. Maximo 10 MB.' }, { status: 413 });
        const extraction = await extractResidentsFromBuffer(file.name, file.type, Buffer.from(await file.arrayBuffer()), {
            userId: profile.id, communityId: profile.community_id, role: profile.role,
        });
        await recordOperationEvent({
            communityId: profile.community_id, actorId: profile.id, actorRole: profile.role,
            action: 'onboarding.roster_extracted', entityType: 'resident_roster',
            severity: extraction.assessment.warnings.length ? 'warning' : 'success',
            status: extraction.assessment.warnings.length ? 'pending' : 'success',
            summary: `Nomina analizada: ${extraction.assessment.validRows}/${extraction.assessment.totalRows} filas listas`,
            metadata: { fileName: file.name, fileSize: file.size, checksum: extraction.checksum, ...extraction.assessment },
            requestId: getRequestId(request),
        });
        return NextResponse.json({ data: extraction.rows, assessment: extraction.assessment });
    } catch (error) {
        if (isAiBudgetExceededError(error)) return NextResponse.json({ error: error.reason }, { status: 429 });
        console.warn('[OnboardingExtract]', error);
        return NextResponse.json({ error: 'No se pudo extraer el archivo.' }, { status: 500 });
    }
}
