import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { CommunityDocumentError, createDocumentUpload, documentFailureCode } from '@/lib/coco/communityDocuments';

export const dynamic = 'force-dynamic';

/**
 * Prepara la subida de un documento para CoCo directo al bucket privado. Así un
 * PDF de 7 MB no pasa por Vercel, que corta los cuerpos en 4,5 MB.
 */
export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'coco.document_upload', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'Inicia sesión para adjuntar documentos.' }, { status: 401 });
    const body = await request.json().catch(() => null) as { fileName?: unknown; size?: unknown } | null;
    if (typeof body?.fileName !== 'string' || typeof body?.size !== 'number') {
        return NextResponse.json({ error: 'Adjunta un documento.' }, { status: 400 });
    }
    try {
        return NextResponse.json(await createDocumentUpload(profile.community_id, profile.id, body.fileName, body.size));
    } catch (error) {
        if (error instanceof CommunityDocumentError) return NextResponse.json({ error: error.message, code: documentFailureCode(error) }, { status: error.status });
        console.error('[coco documents] upload url failed', error);
        return NextResponse.json({ error: 'No pude preparar la subida.', code: 'upload_failed' }, { status: 500 });
    }
}
