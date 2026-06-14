import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { decryptMetaToken, isInstagramOAuthConfigured } from '@/lib/marketing/instagramOAuth';
import { buildReelRenderSpec, generateReelPackage, normalizeReelInput } from '@/lib/marketing/reelAgent';
import type {
    InstagramConnectionSummary,
    MarketingCampaign,
    MarketingCampaignStatus,
    MarketingReelRecord,
    MarketingReelStatus,
    ReelAgentInput,
    ReelAudience,
    ReelCreativePackage,
    ReelRenderSpec,
    ReelTone,
} from '@/lib/types';

type MarketingProfile = {
    id: string;
    role: string;
    community_id?: string | null;
};

type ReelRow = Record<string, unknown>;
type CampaignRow = Record<string, unknown>;
type ConnectionRow = Record<string, unknown>;

const DEFAULT_COMMUNITY_ID = '00000000-0000-0000-0000-000000000000';
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION || 'v21.0';

function requireAdmin(profile: MarketingProfile) {
    if (profile.role !== 'admin') {
        throw new Error('Solo administracion puede gestionar campañas de marketing.');
    }
}

function communityIdFor(profile: MarketingProfile) {
    return profile.community_id || DEFAULT_COMMUNITY_ID;
}

function asString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
    return Array.isArray(value) ? value.map(item => String(item)).filter(Boolean) : [];
}

function asPackage(value: unknown): ReelCreativePackage {
    return value && typeof value === 'object' ? value as ReelCreativePackage : {
        id: '',
        title: 'Reel sin contenido',
        angle: '',
        hook: '',
        audienceLabel: '',
        durationSeconds: 35,
        coverText: '',
        scenes: [],
        caption: '',
        hashtags: [],
        audioDirection: '',
        productionChecklist: [],
        editingPrompt: '',
        createdAt: new Date().toISOString(),
        modelSource: 'template',
    };
}

function asRenderSpec(value: unknown): ReelRenderSpec {
    if (value && typeof value === 'object') return value as ReelRenderSpec;
    return {
        format: 'vertical_9_16',
        width: 1080,
        height: 1920,
        durationSeconds: 35,
        brand: {
            name: 'ConviveConnect',
            domain: 'conviveconnect.com',
            primaryColor: '#B5664E',
            backgroundColor: '#FBF8F3',
        },
        scenes: [],
        caption: '',
        hashtags: [],
    };
}

function mapCampaign(row: CampaignRow): MarketingCampaign {
    return {
        id: asString(row.id),
        title: asString(row.title),
        objective: asString(row.objective),
        audience: asString(row.audience, 'administrators') as ReelAudience,
        tone: asString(row.tone, 'premium') as ReelTone,
        status: asString(row.status, 'draft') as MarketingCampaignStatus,
        createdAt: asString(row.created_at, new Date().toISOString()),
        updatedAt: asString(row.updated_at) || null,
    };
}

function mapReel(row: ReelRow): MarketingReelRecord {
    const creativePackage = asPackage(row.creative_package);
    return {
        id: asString(row.id),
        campaignId: asString(row.campaign_id) || null,
        title: asString(row.title, creativePackage.title),
        objective: asString(row.objective),
        audience: asString(row.audience, 'administrators') as ReelAudience,
        tone: asString(row.tone, 'premium') as ReelTone,
        durationSeconds: asNumber(row.duration_seconds, creativePackage.durationSeconds || 35),
        featureFocus: asString(row.feature_focus, 'Agent Center'),
        status: asString(row.status, 'draft') as MarketingReelStatus,
        creativePackage,
        renderSpec: asRenderSpec(row.render_spec),
        videoUrl: asString(row.video_url) || null,
        thumbnailUrl: asString(row.thumbnail_url) || null,
        caption: asString(row.caption, creativePackage.caption),
        hashtags: asStringArray(row.hashtags),
        scheduledAt: asString(row.scheduled_at) || null,
        publishedAt: asString(row.published_at) || null,
        instagramMediaId: asString(row.instagram_media_id) || null,
        failureReason: asString(row.failure_reason) || null,
        createdAt: asString(row.created_at, new Date().toISOString()),
        updatedAt: asString(row.updated_at) || null,
    };
}

function mapConnection(row: ConnectionRow | null): InstagramConnectionSummary {
    if (!row) return { status: 'not_connected' };
    return {
        status: asString(row.status, 'not_connected') as InstagramConnectionSummary['status'],
        username: asString(row.username) || null,
        instagramUserId: asString(row.instagram_user_id) || null,
        pageId: asString(row.page_id) || null,
        connectedAt: asString(row.connected_at) || null,
        lastError: asString(row.last_error) || null,
    };
}

export async function getMarketingReelsDashboard(profile: MarketingProfile) {
    requireAdmin(profile);
    const admin = getSupabaseAdmin();
    const communityId = communityIdFor(profile);

    const [campaigns, reels, connection] = await Promise.all([
        admin
            .from('marketing_reel_campaigns')
            .select('*')
            .eq('community_id', communityId)
            .order('created_at', { ascending: false })
            .limit(20),
        admin
            .from('marketing_reels')
            .select('*')
            .eq('community_id', communityId)
            .order('created_at', { ascending: false })
            .limit(30),
        admin
            .from('instagram_connections')
            .select('status, username, instagram_user_id, page_id, connected_at, last_error')
            .eq('community_id', communityId)
            .maybeSingle(),
    ]);

    return {
        campaigns: (campaigns.data || []).map(row => mapCampaign(row as CampaignRow)),
        reels: (reels.data || []).map(row => mapReel(row as ReelRow)),
        instagram: mapConnection((connection.data as ConnectionRow | null) || null),
        capabilities: getMarketingCapabilities(),
    };
}

export function getMarketingCapabilities() {
    return {
        aiScriptGeneration: Boolean(process.env.ANTHROPIC_API_KEY),
        videoRendering: Boolean(process.env.MARKETING_VIDEO_RENDER_WEBHOOK_URL),
        instagramPublishing: Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID),
        instagramOAuth: isInstagramOAuthConfigured(),
        cronSecretConfigured: Boolean(process.env.CRON_SECRET),
    };
}

async function ensureDefaultCampaign(profile: MarketingProfile, input: ReelAgentInput) {
    const admin = getSupabaseAdmin();
    const communityId = communityIdFor(profile);
    const title = `Campaña ${input.featureFocus}`;

    const { data: existing } = await admin
        .from('marketing_reel_campaigns')
        .select('*')
        .eq('community_id', communityId)
        .eq('title', title)
        .maybeSingle();

    if (existing) return mapCampaign(existing as CampaignRow);

    const { data, error } = await admin
        .from('marketing_reel_campaigns')
        .insert({
            community_id: communityId,
            title,
            objective: input.objective,
            audience: input.audience,
            tone: input.tone,
            status: 'active',
            created_by: profile.id,
        })
        .select('*')
        .single();

    if (error) throw error;
    return mapCampaign(data as CampaignRow);
}

export async function createMarketingReel(profile: MarketingProfile, rawInput: Record<string, unknown>) {
    requireAdmin(profile);
    const input = normalizeReelInput(rawInput);
    const campaign = await ensureDefaultCampaign(profile, input);
    const creativePackage = await generateReelPackage(input);
    const renderSpec = buildReelRenderSpec(creativePackage);
    const admin = getSupabaseAdmin();
    const communityId = communityIdFor(profile);

    const { data, error } = await admin
        .from('marketing_reels')
        .insert({
            community_id: communityId,
            campaign_id: campaign.id,
            created_by: profile.id,
            title: creativePackage.title,
            objective: input.objective,
            audience: input.audience,
            tone: input.tone,
            duration_seconds: input.durationSeconds,
            feature_focus: input.featureFocus,
            proof_point: input.proofPoint || null,
            offer: input.offer || null,
            call_to_action: input.callToAction || null,
            creative_package: creativePackage,
            render_spec: renderSpec,
            caption: creativePackage.caption,
            hashtags: creativePackage.hashtags,
            status: 'generated',
        })
        .select('*')
        .single();

    if (error) throw error;
    return mapReel(data as ReelRow);
}

async function loadReelForCommunity(reelId: string, communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('marketing_reels')
        .select('*')
        .eq('id', reelId)
        .eq('community_id', communityId)
        .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Reel no encontrado.');
    return mapReel(data as ReelRow);
}

async function updateReel(reelId: string, payload: Record<string, unknown>) {
    const { data, error } = await getSupabaseAdmin()
        .from('marketing_reels')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', reelId)
        .select('*')
        .single();

    if (error) throw error;
    return mapReel(data as ReelRow);
}

export async function approveMarketingReel(profile: MarketingProfile, reelId: string) {
    requireAdmin(profile);
    await loadReelForCommunity(reelId, communityIdFor(profile));
    return updateReel(reelId, { status: 'approved', failure_reason: null });
}

type RenderResult = {
    videoUrl: string;
    thumbnailUrl?: string | null;
    providerJobId?: string | null;
};

async function requestVideoRender(reel: MarketingReelRecord): Promise<RenderResult> {
    const webhookUrl = process.env.MARKETING_VIDEO_RENDER_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('Falta configurar MARKETING_VIDEO_RENDER_WEBHOOK_URL para generar el MP4 final.');
    }

    const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(process.env.MARKETING_VIDEO_RENDER_TOKEN ? { Authorization: `Bearer ${process.env.MARKETING_VIDEO_RENDER_TOKEN}` } : {}),
        },
        body: JSON.stringify({
            reelId: reel.id,
            title: reel.title,
            renderSpec: reel.renderSpec,
            creativePackage: reel.creativePackage,
        }),
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(asString(data.error, 'El proveedor de video no pudo renderizar el reel.'));
    }

    const videoUrl = asString(data.videoUrl);
    if (!videoUrl) throw new Error('El proveedor de video no devolvio videoUrl.');

    return {
        videoUrl,
        thumbnailUrl: asString(data.thumbnailUrl) || null,
        providerJobId: asString(data.providerJobId) || null,
    };
}

export async function renderMarketingReel(profile: MarketingProfile, reelId: string) {
    requireAdmin(profile);
    const reel = await loadReelForCommunity(reelId, communityIdFor(profile));
    await updateReel(reel.id, { status: 'rendering', failure_reason: null });

    try {
        const result = await requestVideoRender(reel);
        return updateReel(reel.id, {
            status: 'rendered',
            video_url: result.videoUrl,
            thumbnail_url: result.thumbnailUrl || null,
            failure_reason: null,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo generar el video final.';
        return updateReel(reel.id, { status: 'blocked', failure_reason: message });
    }
}

export async function scheduleMarketingReel(profile: MarketingProfile, reelId: string, scheduledAt: string) {
    requireAdmin(profile);
    const date = new Date(scheduledAt);
    if (Number.isNaN(date.getTime())) throw new Error('Fecha de publicacion invalida.');
    await loadReelForCommunity(reelId, communityIdFor(profile));
    return updateReel(reelId, {
        status: 'scheduled',
        scheduled_at: date.toISOString(),
        failure_reason: null,
    });
}

type InstagramPublishResult = {
    mediaId: string;
};

async function publishToInstagram(reel: MarketingReelRecord, connection?: ConnectionRow | null): Promise<InstagramPublishResult> {
    const instagramUserId = process.env.INSTAGRAM_USER_ID || asString(connection?.instagram_user_id);
    const storedToken = asString(connection?.encrypted_access_token);
    const accessToken = process.env.INSTAGRAM_ACCESS_TOKEN || (storedToken ? decryptMetaToken(storedToken) : '');

    if (!instagramUserId || !accessToken) {
        throw new Error('Instagram no esta conectado. Configura OAuth/Meta token antes de publicar automaticamente.');
    }
    if (!reel.videoUrl) {
        throw new Error('El reel aun no tiene video final. Genera el MP4 antes de publicar.');
    }
    if (reel.videoUrl.toLowerCase().split('?')[0].endsWith('.webm')) {
        throw new Error('El video automatico del navegador sirve como vista previa. Para publicar en Instagram automaticamente, conecta un renderizador MP4.');
    }

    const mediaEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${instagramUserId}/media`;
    const mediaBody = new URLSearchParams({
        media_type: 'REELS',
        video_url: reel.videoUrl,
        caption: `${reel.caption}\n\n${reel.hashtags.join(' ')}`.trim(),
        share_to_feed: 'true',
        access_token: accessToken,
    });
    const createResponse = await fetch(mediaEndpoint, { method: 'POST', body: mediaBody });
    const createData = await createResponse.json().catch(() => ({})) as Record<string, unknown>;
    const creationId = asString(createData.id);
    if (!createResponse.ok || !creationId) {
        throw new Error(asString(createData.error && typeof createData.error === 'object' ? (createData.error as Record<string, unknown>).message : createData.error, 'Instagram rechazo la creacion del contenedor del reel.'));
    }

    const publishEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${instagramUserId}/media_publish`;
    const publishBody = new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
    });
    const publishResponse = await fetch(publishEndpoint, { method: 'POST', body: publishBody });
    const publishData = await publishResponse.json().catch(() => ({})) as Record<string, unknown>;
    const mediaId = asString(publishData.id);
    if (!publishResponse.ok || !mediaId) {
        throw new Error(asString(publishData.error && typeof publishData.error === 'object' ? (publishData.error as Record<string, unknown>).message : publishData.error, 'Instagram rechazo la publicacion del reel.'));
    }

    return { mediaId };
}

async function getConnectionForCommunity(communityId: string) {
    const { data } = await getSupabaseAdmin()
        .from('instagram_connections')
        .select('*')
        .eq('community_id', communityId)
        .maybeSingle();
    return (data as ConnectionRow | null) || null;
}

export async function publishMarketingReel(profile: MarketingProfile, reelId: string) {
    requireAdmin(profile);
    const communityId = communityIdFor(profile);
    const reel = await loadReelForCommunity(reelId, communityId);
    await updateReel(reel.id, { status: 'publishing', failure_reason: null });

    try {
        const connection = await getConnectionForCommunity(communityId);
        const result = await publishToInstagram(reel, connection);
        return updateReel(reel.id, {
            status: 'published',
            instagram_media_id: result.mediaId,
            published_at: new Date().toISOString(),
            failure_reason: null,
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo publicar en Instagram.';
        return updateReel(reel.id, { status: 'blocked', failure_reason: message });
    }
}

export async function publishDueMarketingReels(limit = 5) {
    const now = new Date().toISOString();
    const { data, error } = await getSupabaseAdmin()
        .from('marketing_reels')
        .select('*')
        .eq('status', 'scheduled')
        .lte('scheduled_at', now)
        .order('scheduled_at', { ascending: true })
        .limit(limit);

    if (error) throw error;
    const rows = (data || []) as ReelRow[];
    const results: Array<{ reelId: string; status: MarketingReelStatus; detail?: string | null }> = [];

    for (const row of rows) {
        const reel = mapReel(row);
        await updateReel(reel.id, { status: 'publishing', failure_reason: null });
        try {
            const connection = await getConnectionForCommunity(asString(row.community_id, DEFAULT_COMMUNITY_ID));
            const result = await publishToInstagram(reel, connection);
            const updated = await updateReel(reel.id, {
                status: 'published',
                instagram_media_id: result.mediaId,
                published_at: new Date().toISOString(),
                failure_reason: null,
            });
            results.push({ reelId: updated.id, status: updated.status });
        } catch (error) {
            const message = error instanceof Error ? error.message : 'No se pudo publicar en Instagram.';
            const updated = await updateReel(reel.id, { status: 'blocked', failure_reason: message });
            results.push({ reelId: updated.id, status: updated.status, detail: message });
        }
    }

    return { processed: results.length, results };
}
