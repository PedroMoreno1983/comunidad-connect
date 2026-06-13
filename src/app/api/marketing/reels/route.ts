import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordOperationEvent } from '@/lib/operations/audit';
import { generateReelPackage, normalizeReelInput } from '@/lib/marketing/reelAgent';

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        if (profile.role !== 'admin') {
            return NextResponse.json({ error: 'Solo administracion puede generar piezas promocionales.' }, { status: 403 });
        }

        const rawBody = await req.json();
        const body = rawBody && typeof rawBody === 'object' ? rawBody as Record<string, unknown> : {};
        const input = normalizeReelInput(body);
        const reel = await generateReelPackage(input);

        await recordOperationEvent({
            communityId: profile.community_id || DEFAULT_COMMUNITY_ID,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'marketing.reel.generated',
            entityType: 'marketing_reel',
            entityId: reel.id,
            severity: 'info',
            status: 'success',
            summary: `Reel generado: ${reel.title}`,
            metadata: {
                featureFocus: input.featureFocus,
                audience: input.audience,
                tone: input.tone,
                modelSource: reel.modelSource,
            },
        });

        return NextResponse.json({ reel });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar el reel.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
