import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { MEDIA_TTL_MS, mediaPublicUrl, mediaSigningSecret } from '@/lib/coco/outboundMedia';

export async function storeOutboundMedia(input: {
    communityId: string;
    createdBy?: string | null;
    filename: string;
    contentType: string;
    body: Buffer;
}): Promise<string | undefined> {
    if (!mediaSigningSecret()) return undefined;
    const expiresAt = new Date(Date.now() + MEDIA_TTL_MS);
    const { data, error } = await getSupabaseAdmin().from('coco_outbound_media').insert({
        community_id: input.communityId,
        created_by: input.createdBy || null,
        filename: input.filename.slice(0, 120),
        content_type: input.contentType.slice(0, 120),
        body: input.body.toString('base64'),
        expires_at: expiresAt.toISOString(),
    }).select('id').single();
    if (error || !data?.id) {
        console.error('[CoCo] No se pudo guardar el archivo temporal', error?.message);
        return undefined;
    }
    return mediaPublicUrl(String(data.id), expiresAt.getTime());
}
