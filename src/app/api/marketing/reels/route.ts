import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { recordOperationEvent } from '@/lib/operations/audit';
import {
    approveMarketingReel,
    createMarketingReel,
    deleteMarketingReel,
    getMarketingReelsDashboard,
    publishMarketingReel,
    renderMarketingReel,
    scheduleMarketingReel,
} from '@/lib/marketing/reelWorkflow';

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

export async function GET(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels.read', { limit: 80, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        const dashboard = await getMarketingReelsDashboard(profile);
        return NextResponse.json(dashboard);
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo cargar marketing.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}

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
        const action = cleanText(body.action, 40) || 'generate';
        const reelId = cleanText(body.reelId, 80);
        let reel;

        if (action === 'generate') {
            reel = await createMarketingReel(profile, body);
        } else if (action === 'approve') {
            if (!reelId) throw new Error('Falta reelId.');
            reel = await approveMarketingReel(profile, reelId);
        } else if (action === 'render') {
            if (!reelId) throw new Error('Falta reelId.');
            reel = await renderMarketingReel(profile, reelId);
        } else if (action === 'schedule') {
            if (!reelId) throw new Error('Falta reelId.');
            reel = await scheduleMarketingReel(profile, reelId, cleanText(body.scheduledAt, 80));
        } else if (action === 'publish') {
            if (!reelId) throw new Error('Falta reelId.');
            reel = await publishMarketingReel(profile, reelId);
        } else if (action === 'delete') {
            if (!reelId) throw new Error('Falta reelId.');
            reel = await deleteMarketingReel(profile, reelId);
        } else {
            throw new Error('Accion de marketing no soportada.');
        }

        await recordOperationEvent({
            communityId: profile.community_id || DEFAULT_COMMUNITY_ID,
            actorId: profile.id,
            actorRole: profile.role,
            action: `marketing.reel.${action}`,
            entityType: 'marketing_reel',
            entityId: reel.id,
            severity: reel.status === 'blocked' || reel.status === 'failed' ? 'warning' : 'info',
            status: reel.status === 'blocked' || reel.status === 'failed' ? 'blocked' : 'success',
            summary: `Reel ${action}: ${reel.title}`,
            metadata: {
                status: reel.status,
                featureFocus: reel.featureFocus,
                audience: reel.audience,
                tone: reel.tone,
                failureReason: reel.failureReason || null,
            },
        });

        const dashboard = await getMarketingReelsDashboard(profile);
        return NextResponse.json({ reel, ...dashboard });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar el reel.';
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
