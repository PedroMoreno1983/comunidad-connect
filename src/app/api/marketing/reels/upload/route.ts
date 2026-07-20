import { NextRequest, NextResponse } from 'next/server';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { isPlatformCreatorEmail } from '@/lib/platformAccess';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';
const MAX_VIDEO_BYTES = 100 * 1024 * 1024;
const ALLOWED_VIDEO_TYPES = new Map([
    ['video/mp4', 'mp4'],
    ['video/webm', 'webm'],
]);

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function getVideoType(file: File) {
    const baseType = file.type.toLowerCase().split(';')[0].trim();
    if (ALLOWED_VIDEO_TYPES.has(baseType)) {
        return { contentType: baseType, ext: ALLOWED_VIDEO_TYPES.get(baseType)! };
    }

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.mp4')) return { contentType: 'video/mp4', ext: 'mp4' };
    if (lowerName.endsWith('.webm')) return { contentType: 'video/webm', ext: 'webm' };
    return null;
}

export async function POST(req: NextRequest) {
    const limited = enforceRateLimit(req, 'marketing.reels.upload', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;

    try {
        const profile = await getAuthenticatedAgentProfile();
        if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
        if (!isPlatformCreatorEmail(profile.email)) {
            return NextResponse.json({ error: 'Solo el creador de la plataforma puede guardar videos de marketing.' }, { status: 403 });
        }

        const formData = await req.formData();
        const reelId = cleanText(formData.get('reelId'), 80);
        const file = formData.get('video');

        if (!reelId) return NextResponse.json({ error: 'Falta reelId.' }, { status: 400 });
        if (!(file instanceof File)) return NextResponse.json({ error: 'Video no recibido.' }, { status: 400 });
        if (file.size > MAX_VIDEO_BYTES) {
            return NextResponse.json({ error: 'El video no puede superar 100 MB.' }, { status: 400 });
        }

        const videoType = getVideoType(file);
        if (!videoType) {
            return NextResponse.json({ error: 'Formato no soportado. Usa MP4 o WEBM.' }, { status: 400 });
        }

        const admin = getSupabaseAdmin();
        const communityId = profile.community_id || DEFAULT_COMMUNITY_ID;
        const { data: reel, error: reelError } = await admin
            .from('marketing_reels')
            .select('id, title, community_id')
            .eq('id', reelId)
            .eq('community_id', communityId)
            .maybeSingle();

        if (reelError) throw reelError;
        if (!reel) return NextResponse.json({ error: 'Reel no encontrado.' }, { status: 404 });

        const buffer = Buffer.from(await file.arrayBuffer());
        const path = `${communityId}/${reelId}/render-${Date.now()}.${videoType.ext}`;
        const { error: uploadError } = await admin.storage
            .from('marketing-reels')
            .upload(path, buffer, {
                contentType: videoType.contentType,
                upsert: true,
            });

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = admin.storage
            .from('marketing-reels')
            .getPublicUrl(path);

        const { data: updated, error: updateError } = await admin
            .from('marketing_reels')
            .update({
                status: 'rendered',
                video_url: publicUrl,
                failure_reason: null,
                updated_at: new Date().toISOString(),
            })
            .eq('id', reelId)
            .eq('community_id', communityId)
            .select('*')
            .single();

        if (updateError) throw updateError;

        await recordOperationEvent({
            communityId,
            actorId: profile.id,
            actorRole: profile.role,
            action: 'marketing.reel.upload_render',
            entityType: 'marketing_reel',
            entityId: reelId,
            severity: 'info',
            status: 'success',
            summary: `Video guardado: ${cleanText(reel.title, 160)}`,
            metadata: {
                mimeType: videoType.contentType,
                size: file.size,
                videoUrl: publicUrl,
            },
        });

        return NextResponse.json({ reel: updated });
    } catch (error) {
        console.error('[marketing reels] upload failed', error);
        return NextResponse.json({ error: 'No se pudo guardar el video.' }, { status: 500 });
    }
}
