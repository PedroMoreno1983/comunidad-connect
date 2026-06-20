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
const FACEBOOK_GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
const INSTAGRAM_GRAPH_BASE_URL = `https://graph.instagram.com/${GRAPH_VERSION}`;
const MARKETING_REELS_MIME_TYPES = ['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/aac'];
const MARKETING_REELS_FILE_SIZE_LIMIT = 524288000;

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

function compactJson(value: unknown, max = 600) {
    try {
        return JSON.stringify(value).slice(0, max);
    } catch {
        return '';
    }
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
    const useCreatomateTemplate = process.env.CREATOMATE_USE_TEMPLATE === 'true';
    const creatomateReady = Boolean(process.env.CREATOMATE_API_KEY)
        && (!useCreatomateTemplate || Boolean(process.env.CREATOMATE_TEMPLATE_ID));
    const heygenReady = Boolean(process.env.HEYGEN_API_KEY);
    const higgsfieldReady = Boolean(getHiggsfieldCredentials());
    const cocoVoiceReady = Boolean(process.env.OPENAI_API_KEY && process.env.CREATOMATE_API_KEY);

    return {
        aiScriptGeneration: Boolean(process.env.ANTHROPIC_API_KEY),
        videoRendering: higgsfieldReady || heygenReady || creatomateReady || Boolean(process.env.MARKETING_VIDEO_RENDER_WEBHOOK_URL),
        professionalAudio: (higgsfieldReady && cocoVoiceReady) || (!higgsfieldReady && heygenReady) || Boolean(process.env.CREATOMATE_MUSIC_URL || process.env.CREATOMATE_VOICE_PROVIDER),
        videoAiGeneration: higgsfieldReady || heygenReady,
        videoAiProvider: higgsfieldReady ? 'higgsfield' : heygenReady ? 'heygen' : null,
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

export async function deleteMarketingReel(profile: MarketingProfile, reelId: string) {
    requireAdmin(profile);
    const communityId = communityIdFor(profile);
    const reel = await loadReelForCommunity(reelId, communityId);
    const admin = getSupabaseAdmin();
    const storagePrefix = `${communityId}/${reel.id}`;
    const { data: storedFiles } = await admin.storage
        .from('marketing-reels')
        .list(storagePrefix, { limit: 100 });
    const filesToRemove = (storedFiles || []).map(file => `${storagePrefix}/${file.name}`).filter(Boolean);
    if (filesToRemove.length > 0) {
        await admin.storage.from('marketing-reels').remove(filesToRemove);
    }

    const { error } = await admin
        .from('marketing_reels')
        .delete()
        .eq('id', reel.id)
        .eq('community_id', communityId);

    if (error) throw error;
    return reel;
}

type RenderResult = {
    videoUrl: string;
    thumbnailUrl?: string | null;
    providerJobId?: string | null;
};

class PendingVideoRenderError extends Error {
    providerJobId: string;

    constructor(providerJobId: string) {
        super(`HEYGEN_PENDING:${providerJobId}`);
        this.providerJobId = providerJobId;
    }
}

class PendingHiggsfieldRenderError extends Error {
    stage: 'image' | 'video';
    providerJobId: string;
    imageUrl: string | null;

    constructor(stage: 'image' | 'video', providerJobId: string, imageUrl?: string | null) {
        const encodedImageUrl = imageUrl ? ` IMAGE_URL:${encodeURIComponent(imageUrl)}` : '';
        super(`HIGGSFIELD_${stage.toUpperCase()}_PENDING:${providerJobId}${encodedImageUrl}`);
        this.stage = stage;
        this.providerJobId = providerJobId;
        this.imageUrl = imageUrl || null;
    }
}

class HiggsfieldQueuedJobError extends Error {
    providerJobId: string;

    constructor(providerJobId: string) {
        super(`Higgsfield job queued: ${providerJobId}`);
        this.providerJobId = providerJobId;
    }
}

function firstSceneText(reel: MarketingReelRecord, index: number) {
    return reel.creativePackage.scenes[index]?.onScreenText
        || reel.creativePackage.scenes[index]?.voiceOver
        || reel.creativePackage.angle
        || reel.title;
}

function buildCreatomateModifications(reel: MarketingReelRecord) {
    const cta = reel.creativePackage.coverText || 'Agenda una demo guiada';
    const website = reel.renderSpec.brand.domain || 'conviveconnect.com';
    const hook = reel.creativePackage.hook || firstSceneText(reel, 0);
    const headline = reel.title || reel.creativePackage.title || 'ConviveConnect';
    const scene1 = firstSceneText(reel, 0);
    const scene2 = firstSceneText(reel, 1);
    const scene3 = firstSceneText(reel, 2);
    const values: Record<string, string> = {
        headline,
        hook,
        scene_1: scene1,
        scene_2: scene2,
        scene_3: scene3,
        cta,
        website,
        brand_name: reel.renderSpec.brand.name || 'ConviveConnect',
        caption: reel.caption,
    };

    const envMap = process.env.CREATOMATE_MODIFICATION_MAP;
    if (envMap) {
        const modifications: Record<string, string> = {};
        envMap.split(',').map(item => item.trim()).filter(Boolean).forEach(pair => {
            const [creatomateKey, valueKey] = pair.split(':').map(item => item.trim());
            if (creatomateKey && valueKey && values[valueKey]) modifications[creatomateKey] = values[valueKey];
        });
        if (Object.keys(modifications).length > 0) return modifications;
    }

    return {
        headline,
        hook,
        scene_1: scene1,
        scene_2: scene2,
        scene_3: scene3,
        cta,
        website,
        brand_name: reel.renderSpec.brand.name || 'ConviveConnect',
        caption: reel.caption,
        'Name.text.hook': hook,
        'Name.text': hook,
    };
}

type CreatomateElement = Record<string, unknown>;

type CreatomateRenderScript = {
    output_format: 'mp4';
    width: number;
    height: number;
    duration: number;
    elements: CreatomateElement[];
};

function clampText(value: string, maxLength: number) {
    const clean = value.replace(/\s+/g, ' ').trim();
    return clean.length > maxLength ? `${clean.slice(0, Math.max(0, maxLength - 1)).trim()}...` : clean;
}

function normalizeDurationSeconds(reel: MarketingReelRecord) {
    return Math.max(15, Math.min(60, Math.round(reel.durationSeconds || reel.renderSpec.durationSeconds || 35)));
}

function rectangleElement(time: number, duration: number, fillColor: string): CreatomateElement {
    return {
        type: 'shape',
        time,
        duration,
        width: '100%',
        height: '100%',
        x: '50%',
        y: '50%',
        path: 'M 0% 0% L 100% 0% L 100% 100% L 0% 100% Z',
        fill_color: fillColor,
    };
}

function boxElement(time: number, duration: number, x: string, y: string, width: string, height: string, fillColor: string): CreatomateElement {
    return {
        type: 'shape',
        time,
        duration,
        width,
        height,
        x,
        y,
        path: 'M 0% 0% L 100% 0% L 100% 100% L 0% 100% Z',
        fill_color: fillColor,
    };
}

function circleElement(time: number, duration: number, x: string, y: string, size: string, fillColor: string): CreatomateElement {
    return {
        type: 'shape',
        time,
        duration,
        width: size,
        height: size,
        x,
        y,
        path: 'M 50% 0% C 77.6% 0% 100% 22.4% 100% 50% C 100% 77.6% 77.6% 100% 50% 100% C 22.4% 100% 0% 77.6% 0% 50% C 0% 22.4% 22.4% 0% 50% 0% Z',
        fill_color: fillColor,
    };
}

function textElement(
    text: string,
    time: number,
    duration: number,
    x: string,
    y: string,
    width: string,
    height: string,
    fontSize: number,
    fillColor: string,
    fontWeight: number,
    alignment: '0%' | '50%' = '0%',
): CreatomateElement {
    return {
        type: 'text',
        text: clampText(text, 220),
        time,
        duration,
        x,
        y,
        width,
        height,
        fill_color: fillColor,
        font_family: 'Arial',
        font_size: fontSize,
        font_weight: fontWeight,
        x_alignment: alignment,
        y_alignment: '50%',
        text_wrap: true,
    };
}

function buildVoiceoverText(reel: MarketingReelRecord) {
    const sceneVoice = reel.creativePackage.scenes
        .map(scene => scene.voiceOver)
        .filter(Boolean)
        .join(' ');
    return clampText(`${sceneVoice} ${reel.creativePackage.coverText}. ${reel.renderSpec.brand.domain}.`, 1600);
}

function buildCocoVoiceoverText(reel: MarketingReelRecord) {
    const sceneVoice = reel.creativePackage.scenes
        .slice(0, 3)
        .map(scene => scene.voiceOver)
        .filter(Boolean)
        .join(' ');
    return clampText([
        'Hola, soy CoCo.',
        'Soy la agente operativa de ConviveConnect.',
        sceneVoice,
        reel.creativePackage.coverText || 'Agenda una demo en conviveconnect.com.',
    ].join(' '), 650);
}

async function ensureMarketingReelsBucketAllows(contentType: string) {
    if (!contentType.startsWith('audio/')) return;
    const admin = getSupabaseAdmin();
    const { error } = await admin.storage.updateBucket('marketing-reels', {
        public: true,
        fileSizeLimit: MARKETING_REELS_FILE_SIZE_LIMIT,
        allowedMimeTypes: MARKETING_REELS_MIME_TYPES,
    });
    if (error) throw error;
}

async function uploadMarketingAsset(communityId: string, reelId: string, fileName: string, buffer: Buffer, contentType: string) {
    const admin = getSupabaseAdmin();
    const path = `${communityId}/${reelId}/${fileName}`;
    await ensureMarketingReelsBucketAllows(contentType);
    let { error } = await admin.storage
        .from('marketing-reels')
        .upload(path, buffer, { contentType, upsert: true });
    if (error && contentType.startsWith('audio/')) {
        const { error: bucketError } = await admin.storage.updateBucket('marketing-reels', {
            public: true,
            fileSizeLimit: MARKETING_REELS_FILE_SIZE_LIMIT,
            allowedMimeTypes: MARKETING_REELS_MIME_TYPES,
        });
        if (bucketError) throw bucketError;
        const retry = await admin.storage
            .from('marketing-reels')
            .upload(path, buffer, { contentType, upsert: true });
        error = retry.error;
    }
    if (error) throw error;
    const { data: { publicUrl } } = admin.storage.from('marketing-reels').getPublicUrl(path);
    return publicUrl;
}

async function requestCocoVoiceoverAudio(reel: MarketingReelRecord, communityId: string) {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('Falta OPENAI_API_KEY para generar la voz femenina de CoCo.');
    }

    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
            voice: process.env.OPENAI_TTS_VOICE || 'coral',
            input: buildCocoVoiceoverText(reel),
            instructions: 'Voz femenina latina, clara, cercana y profesional. Habla como CoCo, una agente de IA operativa. Ritmo comercial, confiable, sin sonar como locutora exagerada.',
            response_format: 'mp3',
        }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(`OpenAI TTS no pudo generar la voz de CoCo. ${message}`.trim());
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    return uploadMarketingAsset(communityId, reel.id, `coco-voice-${Date.now()}.mp3`, buffer, 'audio/mpeg');
}

function buildCreatomateRenderScript(reel: MarketingReelRecord): CreatomateRenderScript {
    const width = reel.renderSpec.width || 1080;
    const height = reel.renderSpec.height || 1920;
    const duration = normalizeDurationSeconds(reel);
    const brand = reel.renderSpec.brand;
    const brandName = brand.name || 'ConviveConnect';
    const website = brand.domain || 'conviveconnect.com';
    const copper = brand.primaryColor || '#B5664E';
    const ink = '#1F1713';
    const muted = '#73584D';
    const paper = brand.backgroundColor || '#FBF8F3';
    const scenes = reel.renderSpec.scenes.length > 0
        ? reel.renderSpec.scenes
        : reel.creativePackage.scenes.map((scene, index) => ({ ...scene, index }));
    const visibleScenes = scenes.slice(0, Math.max(3, Math.min(5, scenes.length || 5)));
    const sceneCount = Math.max(1, visibleScenes.length + 1);
    const sceneDuration = duration / sceneCount;
    const elements: CreatomateElement[] = [
        rectangleElement(0, duration, paper),
        circleElement(0, duration, '86%', '12%', '36%', '#EBD6CD'),
        circleElement(0, duration, '14%', '88%', '42%', '#EFE7DF'),
    ];

    visibleScenes.forEach((scene, index) => {
        const time = Number((index * sceneDuration).toFixed(2));
        const localDuration = Number((sceneDuration + 0.2).toFixed(2));
        elements.push(
            boxElement(time, localDuration, '50%', '50%', '86%', '78%', '#FFFFFF'),
            boxElement(time, localDuration, '18%', '20%', '16%', '4%', copper),
            textElement(brandName, time, localDuration, '36%', '9%', '52%', '5%', 38, ink, 700),
            textElement('OPERACION DE CONDOMINIOS', time, localDuration, '39%', '12%', '58%', '3%', 19, copper, 700),
            textElement(`${index + 1}/${sceneCount}`, time, localDuration, '18%', '20%', '16%', '4%', 26, paper, 700, '50%'),
            textElement(scene.onScreenText || reel.title, time, localDuration, '50%', '36%', '80%', '22%', 62, ink, 700),
            textElement(scene.voiceOver || reel.caption, time, localDuration, '50%', '58%', '80%', '19%', 34, muted, 400),
            textElement(scene.productionNote || reel.objective, time, localDuration, '50%', '79%', '76%', '9%', 25, muted, 400),
            textElement(`${reel.creativePackage.coverText || 'Agenda una demo'} | ${website}`, time, localDuration, '50%', '92%', '80%', '5%', 31, ink, 700),
        );
    });

    const finalTime = Number((visibleScenes.length * sceneDuration).toFixed(2));
    const finalDuration = Math.max(3, Number((duration - finalTime).toFixed(2)));
    elements.push(
        boxElement(finalTime, finalDuration, '50%', '81%', '78%', '14%', ink),
        textElement(brandName, finalTime, finalDuration, '50%', '14%', '80%', '6%', 44, ink, 700),
        textElement(reel.creativePackage.coverText || 'Tu edificio, en una sola plataforma', finalTime, finalDuration, '50%', '34%', '80%', '20%', 68, ink, 700),
        textElement(reel.creativePackage.angle || reel.objective, finalTime, finalDuration, '50%', '57%', '80%', '16%', 34, muted, 400),
        textElement(reel.creativePackage.coverText || 'Agenda una demo guiada', finalTime, finalDuration, '50%', '76%', '80%', '7%', 40, paper, 700, '50%'),
        textElement(website, finalTime, finalDuration, '50%', '86%', '80%', '7%', 48, copper, 700, '50%'),
    );

    const musicUrl = process.env.CREATOMATE_MUSIC_URL;
    if (musicUrl) {
        elements.push({
            type: 'audio',
            source: musicUrl,
            time: 0,
            duration,
            loop: true,
            volume: '24%',
            audio_fade_in: 1,
            audio_fade_out: 1,
        });
    }

    const voiceProvider = process.env.CREATOMATE_VOICE_PROVIDER;
    if (voiceProvider) {
        elements.push({
            type: 'audio',
            provider: voiceProvider,
            source: buildVoiceoverText(reel),
            time: 0,
            duration,
            volume: '88%',
        });
    }

    return {
        output_format: 'mp4',
        width,
        height,
        duration,
        elements,
    };
}

function buildCocoCompositeRenderScript(reel: MarketingReelRecord, visualVideoUrl: string, voiceoverUrl: string): CreatomateRenderScript {
    const width = reel.renderSpec.width || 1080;
    const height = reel.renderSpec.height || 1920;
    const duration = normalizeDurationSeconds(reel);
    const brand = reel.renderSpec.brand;
    const brandName = brand.name || 'ConviveConnect';
    const website = brand.domain || 'conviveconnect.com';
    const copper = brand.primaryColor || '#B5664E';
    const ink = '#1F1713';
    const paper = brand.backgroundColor || '#FBF8F3';
    const hook = reel.creativePackage.hook || reel.title;
    const cta = reel.creativePackage.coverText || 'Agenda una demo guiada';

    return {
        output_format: 'mp4',
        width,
        height,
        duration,
        elements: [
            {
                type: 'video',
                source: visualVideoUrl,
                time: 0,
                duration,
                x: '50%',
                y: '50%',
                width: '100%',
                height: '100%',
                fit: 'cover',
                volume: '0%',
            },
            rectangleElement(0, duration, 'rgba(250,247,241,0.22)'),
            boxElement(0, duration, '50%', '10%', '84%', '12%', 'rgba(251,248,243,0.92)'),
            textElement(brandName, 0, duration, '25%', '7%', '36%', '4%', 38, ink, 700),
            textElement('CoCo presenta', 0, duration, '72%', '7%', '28%', '4%', 25, copper, 700, '50%'),
            textElement(hook, 0.4, Math.max(5, duration - 3), '50%', '25%', '82%', '16%', 58, ink, 700),
            textElement('Voz IA de CoCo. Sin avatar, sin rostro.', 0.4, Math.max(4, duration - 4), '50%', '38%', '82%', '5%', 26, '#6E5A50', 600, '50%'),
            boxElement(Math.max(0, duration - 5), 5, '50%', '82%', '82%', '13%', ink),
            textElement(cta, Math.max(0, duration - 5), 5, '50%', '78%', '76%', '6%', 38, paper, 700, '50%'),
            textElement(website, Math.max(0, duration - 5), 5, '50%', '86%', '76%', '5%', 34, copper, 700, '50%'),
            {
                type: 'audio',
                source: voiceoverUrl,
                time: 0,
                duration,
                volume: '92%',
                audio_fade_in: 0.2,
                audio_fade_out: 0.8,
            },
        ],
    };
}

async function requestCreatomateScriptRender(script: CreatomateRenderScript, fallback: string) {
    const apiKey = process.env.CREATOMATE_API_KEY ? normalizeBearerToken(process.env.CREATOMATE_API_KEY) : '';
    if (!apiKey) throw new Error('Falta CREATOMATE_API_KEY para unir el video visual con la voz femenina de CoCo en un MP4 final.');

    const response = await fetch(process.env.CREATOMATE_RENDERS_URL || 'https://api.creatomate.com/v2/renders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(script),
    });

    const data = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) throw new Error(getProviderErrorMessage(data, fallback));

    const providerJobId = getCreatomateJobId(data);
    const videoUrl = getCreatomateVideoUrl(data) || (providerJobId ? await waitForCreatomateUrl(providerJobId, apiKey) : '');
    if (!videoUrl) throw new Error('Creatomate inicio la composicion con voz de CoCo, pero aun no devolvio URL de video. Espera unos segundos y vuelve a intentar.');
    return { videoUrl, providerJobId: providerJobId || null };
}

function normalizeBearerToken(value: string) {
    return value.trim().replace(/^Bearer\s+/i, '').trim();
}

function getCreatomateVideoUrl(data: unknown) {
    const first = Array.isArray(data) ? data[0] : data;
    if (!first || typeof first !== 'object') return '';
    const row = first as Record<string, unknown>;
    return asString(row.url)
        || asString(row.video_url)
        || asString(row.videoUrl)
        || asString(row.output_url)
        || asString(row.outputUrl);
}

function getCreatomateJobId(data: unknown) {
    const first = Array.isArray(data) ? data[0] : data;
    if (!first || typeof first !== 'object') return '';
    return asString((first as Record<string, unknown>).id);
}

function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function creatomateRenderStatusUrl(renderId: string) {
    const rendersUrl = process.env.CREATOMATE_RENDERS_URL || 'https://api.creatomate.com/v2/renders';
    return `${rendersUrl.replace(/\/$/, '')}/${encodeURIComponent(renderId)}`;
}

async function waitForCreatomateUrl(renderId: string, apiKey: string) {
    for (let attempt = 0; attempt < 10; attempt += 1) {
        await sleep(3000);
        const response = await fetch(creatomateRenderStatusUrl(renderId), {
            headers: { Authorization: `Bearer ${normalizeBearerToken(apiKey)}` },
        });
        const data = await response.json().catch(() => ({})) as unknown;
        if (!response.ok) continue;
        const videoUrl = getCreatomateVideoUrl(data);
        if (videoUrl) return videoUrl;
    }
    return '';
}

function getProviderErrorMessage(data: unknown, fallback: string) {
    if (!data || typeof data !== 'object') return fallback;
    const row = data as Record<string, unknown>;
    const nestedError = row.error && typeof row.error === 'object' ? row.error as Record<string, unknown> : null;
    const message = asString(row.message)
        || asString(row.error)
        || asString(row.detail)
        || asString(nestedError?.message)
        || asString(nestedError?.detail);
    return message || `${fallback} Respuesta: ${compactJson(data)}`;
}

function getHiggsfieldCredentials() {
    const direct = process.env.HF_CREDENTIALS || process.env.HIGGSFIELD_CREDENTIALS;
    if (direct?.includes(':')) {
        const [keyId, ...secretParts] = direct.split(':');
        const keySecret = secretParts.join(':');
        if (keyId.trim() && keySecret.trim()) return `${keyId.trim()}:${keySecret.trim()}`;
    }
    const key = process.env.HF_API_KEY_ID
        || process.env.HF_KEY_ID
        || process.env.HF_API_KEY
        || process.env.HIGGSFIELD_API_KEY_ID
        || process.env.HIGGSFIELD_KEY_ID
        || process.env.HIGGSFIELD_API_KEY;
    const secret = process.env.HF_API_KEY_SECRET
        || process.env.HF_KEY_SECRET
        || process.env.HF_API_SECRET
        || process.env.HIGGSFIELD_API_KEY_SECRET
        || process.env.HIGGSFIELD_KEY_SECRET
        || process.env.HIGGSFIELD_API_SECRET;
    return key && secret ? `${key.trim()}:${secret.trim()}` : '';
}

function buildConviveBrandDirection() {
    return [
        'Direccion de arte ConviveConnect obligatoria:',
        'Paleta: fondo marfil calido #FAF7F1 y #FBF8F3, superficie blanca suave #FFFFFF, tinta profunda #1A1611 y #1F1713, cobre terracota #C8705A y #B45F4B como acento, verde grisaceo sobrio #6E8268 solo para confirmaciones.',
        'Estilo: SaaS premium sobrio, editorial, elegante y operativo. Mucho espacio en blanco, bordes finos, cards de radio 8-10px, sombras suaves, dashboards reales.',
        'Tipografia aproximada: titulos serif editorial tipo Instrument Serif, textos de interfaz sans moderna tipo Geist.',
        'Evitar: azules corporativos genericos, morados, neones, fondos oscuros dominantes, futurismo exagerado, efectos ruidosos, estetica infantil o videojuego.',
        'Regla critica para IA visual: no escribir logos, no escribir palabras legibles, no inventar marcas, no mostrar rostros, no mostrar avatares ni personas mirando a camara. Dejar zonas limpias para overlays reales posteriores.',
    ].join('\n');
}

function buildHiggsfieldImagePrompt(reel: MarketingReelRecord) {
    const firstScenes = reel.creativePackage.scenes
        .slice(0, 3)
        .map(scene => scene.onScreenText)
        .filter(Boolean)
        .join(' | ');
    return [
        'Create a premium vertical 9:16 background plate for an Instagram Reel about a SaaS platform for condominium operations in Chile.',
        buildConviveBrandDirection(),
        'Visual content only: clean admin dashboard shapes, audit trail cards without readable text, permission chips without words, checklist panels without words, condominium lobby context, operational clarity.',
        'Composition: editorial SaaS background, subtle terracotta accents, ivory background, no clutter, empty safe zones for real captions to be added later.',
        'Do not include any readable text. Do not include the words ConviveConnect, CoCo, concrete, cement, condo, or any invented logo. Do not include people, faces, avatars, presenters, microphones, or talking heads.',
        `Mood reference: ${reel.creativePackage.hook || reel.title}. Scene concepts only, no visible text: ${firstScenes}`,
    ].join('\n\n').slice(0, 6000);
}

function buildHiggsfieldVideoPrompt(reel: MarketingReelRecord) {
    const sceneMotion = reel.creativePackage.scenes
        .slice(0, 5)
        .map((scene, index) => `Scene ${index + 1}: ${scene.visual}. On-screen Spanish text: ${scene.onScreenText}.`)
        .join('\n');
    return [
        'Animate this SaaS background plate into a premium vertical Instagram Reel visual layer.',
        buildConviveBrandDirection(),
        'Use smooth camera movement, subtle parallax, dashboard panels sliding softly, no chaotic effects.',
        'Do not add any readable text, subtitles, logos, brand names, symbols, people, faces, avatars, presenters, or talking heads. The final brand, captions, and CoCo voiceover will be added by a controlled compositor after this render.',
        'Keep the color palette close to warm ivory, deep ink, copper terracotta, and restrained green accents.',
        `Target duration: ${normalizeDurationSeconds(reel)} seconds.`,
        `Scene concepts only, no visible text:\n${sceneMotion}`,
    ].join('\n\n').slice(0, 6000);
}

function getHiggsfieldImageUrl(data: unknown) {
    if (!data || typeof data !== 'object') return '';
    const row = data as Record<string, unknown>;
    const images = Array.isArray(row.images) ? row.images : [];
    const firstImage = images[0] && typeof images[0] === 'object' ? images[0] as Record<string, unknown> : null;
    return asString(firstImage?.url) || getHiggsfieldRawResultUrl(row);
}

function getHiggsfieldVideoUrl(data: unknown) {
    if (!data || typeof data !== 'object') return '';
    const row = data as Record<string, unknown>;
    const video = row.video && typeof row.video === 'object' ? row.video as Record<string, unknown> : null;
    return asString(video?.url) || getHiggsfieldRawResultUrl(row);
}

function getHiggsfieldRawResultUrl(row: Record<string, unknown>) {
    const jobs = Array.isArray(row.jobs) ? row.jobs : [];
    const firstJob = jobs[0] && typeof jobs[0] === 'object' ? jobs[0] as Record<string, unknown> : null;
    const results = firstJob?.results && typeof firstJob.results === 'object'
        ? firstJob.results as Record<string, unknown>
        : null;
    const raw = results?.raw && typeof results.raw === 'object'
        ? results.raw as Record<string, unknown>
        : null;
    return asString(raw?.url)
        || asString(raw?.video_url)
        || asString(raw?.image_url)
        || asString(results?.url)
        || asString(results?.video_url)
        || asString(results?.image_url);
}

function getHiggsfieldJobSetId(data: unknown) {
    if (!data || typeof data !== 'object') return '';
    const row = data as Record<string, unknown>;
    return asString(row.request_id) || asString(row.id);
}

function getPendingHiggsfieldRender(reel: MarketingReelRecord) {
    const detail = reel.failureReason || '';
    const imageMarker = 'HIGGSFIELD_IMAGE_PENDING:';
    const videoMarker = 'HIGGSFIELD_VIDEO_PENDING:';
    const marker = detail.includes(videoMarker) ? videoMarker : detail.includes(imageMarker) ? imageMarker : '';
    if (!marker) return null;

    const rest = detail.slice(detail.indexOf(marker) + marker.length);
    const [idPart] = rest.split(/\s+/);
    const providerJobId = idPart?.trim() || '';
    if (!providerJobId) return null;

    const imageUrlMarker = 'IMAGE_URL:';
    const imageUrlIndex = detail.indexOf(imageUrlMarker);
    const encodedImageUrl = imageUrlIndex >= 0 ? detail.slice(imageUrlIndex + imageUrlMarker.length).split(/\s+/)[0] || '' : '';
    let imageUrl = '';
    if (encodedImageUrl) {
        try {
            imageUrl = decodeURIComponent(encodedImageUrl);
        } catch {
            imageUrl = encodedImageUrl;
        }
    }

    return {
        stage: marker === videoMarker ? 'video' as const : 'image' as const,
        providerJobId,
        imageUrl: imageUrl || reel.thumbnailUrl || null,
    };
}

async function requestHiggsfieldEndpoint(endpoint: string, params: Record<string, unknown>, credentials: string) {
    const baseUrl = (process.env.HIGGSFIELD_API_BASE_URL || 'https://platform.higgsfield.ai').replace(/\/$/, '');
    const formattedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    const response = await fetch(`${baseUrl}${formattedEndpoint}`, {
        method: 'POST',
        headers: {
            Authorization: `Key ${credentials}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ params }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(getProviderErrorMessage(data, 'Higgsfield rechazo la solicitud.'));
    }

    const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const requestId = getHiggsfieldJobSetId(row);
    if (!requestId || isHiggsfieldCompleted(row)) return row;
    return pollHiggsfieldRequest(requestId, credentials);
}

function isHiggsfieldCompleted(row: Record<string, unknown>) {
    if (asString(row.status) === 'completed') return true;
    if (getHiggsfieldRawResultUrl(row)) return true;
    const jobs = Array.isArray(row.jobs) ? row.jobs : [];
    if (!jobs.length) return false;
    return jobs.every(job => {
        if (!job || typeof job !== 'object') return false;
        const item = job as Record<string, unknown>;
        return asString(item.status) === 'completed' && Boolean(item.results);
    });
}

function getHiggsfieldStatus(row: Record<string, unknown>) {
    const directStatus = asString(row.status);
    if (directStatus) return directStatus;
    const jobs = Array.isArray(row.jobs) ? row.jobs : [];
    const statuses = jobs
        .map(job => job && typeof job === 'object' ? asString((job as Record<string, unknown>).status) : '')
        .filter(Boolean);
    if (statuses.some(status => status === 'failed' || status === 'nsfw')) return statuses.find(status => status === 'failed' || status === 'nsfw') || '';
    if (statuses.length && statuses.every(status => status === 'completed')) return 'completed';
    if (statuses.some(status => status === 'in_progress')) return 'in_progress';
    if (statuses.some(status => status === 'queued')) return 'queued';
    return '';
}

async function pollHiggsfieldRequest(requestId: string, credentials: string, maxPollMs = 90000) {
    const baseUrl = (process.env.HIGGSFIELD_API_BASE_URL || 'https://platform.higgsfield.ai').replace(/\/$/, '');
    const startedAt = Date.now();
    while (Date.now() - startedAt < maxPollMs) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        const response = await fetch(`${baseUrl}/requests/${requestId}/status`, {
            headers: { Authorization: `Key ${credentials}` },
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(getProviderErrorMessage(data, 'Higgsfield no pudo consultar el estado del render.'));
        }
        const row = data && typeof data === 'object' ? data as Record<string, unknown> : {};
        const status = getHiggsfieldStatus(row);
        if (isHiggsfieldCompleted(row)) return row;
        if (status === 'failed' || status === 'nsfw') {
            throw new Error(getProviderErrorMessage(row, `Higgsfield termino el render con estado ${status}.`));
        }
    }
    throw new HiggsfieldQueuedJobError(requestId);
}

async function requestHiggsfieldRender(reel: MarketingReelRecord, communityId: string): Promise<RenderResult> {
    const credentials = getHiggsfieldCredentials();
    if (!credentials) {
        throw new Error('Falta configurar HF_CREDENTIALS o HIGGSFIELD_CREDENTIALS con formato KEY_ID:KEY_SECRET.');
    }

    const pending = getPendingHiggsfieldRender(reel);
    let imageUrl = pending?.stage === 'video' && pending.imageUrl ? pending.imageUrl : '';

    if (pending?.stage === 'image') {
        try {
            const imageResult = await pollHiggsfieldRequest(pending.providerJobId, credentials);
            imageUrl = getHiggsfieldImageUrl(imageResult);
        } catch (error) {
            if (error instanceof HiggsfieldQueuedJobError) {
                throw new PendingHiggsfieldRenderError('image', error.providerJobId);
            }
            throw error;
        }
    }

    if (!imageUrl && !pending) {
        try {
            const imageResult = await requestHiggsfieldEndpoint('/v1/text2image/soul', {
                prompt: buildHiggsfieldImagePrompt(reel),
                width_and_height: process.env.HIGGSFIELD_IMAGE_SIZE || '1152x2048',
                quality: '720p',
                batch_size: 1,
                enhance_prompt: true,
                seed: Math.floor(Date.now() % 100000),
            }, credentials);
            imageUrl = getHiggsfieldImageUrl(imageResult);
        } catch (error) {
            if (error instanceof HiggsfieldQueuedJobError) {
                throw new PendingHiggsfieldRenderError('image', error.providerJobId);
            }
            throw error;
        }
    }

    if (!imageUrl) {
        throw new Error('Higgsfield genero la imagen base pero no devolvio URL utilizable.');
    }

    let videoResult: unknown;
    try {
        videoResult = pending?.stage === 'video'
            ? await pollHiggsfieldRequest(pending.providerJobId, credentials)
            : await requestHiggsfieldEndpoint('/v1/image2video/dop', {
                model: process.env.HIGGSFIELD_DOP_MODEL || 'dop-turbo',
                prompt: buildHiggsfieldVideoPrompt(reel),
                input_images: [{ type: 'image_url', image_url: imageUrl }],
                enhance_prompt: true,
                seed: Math.floor((Date.now() + 17) % 100000),
            }, credentials);
    } catch (error) {
        if (error instanceof HiggsfieldQueuedJobError) {
            throw new PendingHiggsfieldRenderError('video', error.providerJobId, imageUrl);
        }
        throw error;
    }

    const videoUrl = getHiggsfieldVideoUrl(videoResult);
    if (!videoUrl) {
        throw new Error(getProviderErrorMessage(videoResult, 'Higgsfield no devolvio URL de video.'));
    }

    if (process.env.HIGGSFIELD_REQUIRE_COCO_VOICE !== 'false') {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('El video visual de Higgsfield esta listo, pero falta OPENAI_API_KEY para que CoCo grabe la voz femenina.');
        }
        if (!process.env.CREATOMATE_API_KEY) {
            throw new Error('El video visual de Higgsfield esta listo, pero falta CREATOMATE_API_KEY para incrustar la voz femenina de CoCo en el MP4 final.');
        }
        const voiceoverUrl = await requestCocoVoiceoverAudio(reel, communityId);
        const composed = await requestCreatomateScriptRender(
            buildCocoCompositeRenderScript(reel, videoUrl, voiceoverUrl),
            'Creatomate no pudo unir el video de Higgsfield con la voz femenina de CoCo.',
        );
        return {
            videoUrl: composed.videoUrl,
            thumbnailUrl: imageUrl,
            providerJobId: composed.providerJobId || getHiggsfieldJobSetId(videoResult),
        };
    }

    return {
        videoUrl,
        thumbnailUrl: imageUrl,
        providerJobId: getHiggsfieldJobSetId(videoResult),
    };
}

function buildHeyGenPrompt(reel: MarketingReelRecord) {
    const scenes = reel.creativePackage.scenes
        .map((scene, index) => [
            `Escena ${index + 1} (${scene.time})`,
            `Texto en pantalla: ${scene.onScreenText}`,
            `Narracion: ${scene.voiceOver}`,
            `Visual: ${scene.visual}`,
            `Nota: ${scene.productionNote}`,
        ].join('\n'))
        .join('\n\n');

    return [
        'Crea un reel vertical 9:16 listo para Instagram Reels para promocionar ConviveConnect.',
        'El video debe sentirse premium, claro, moderno y comercial para administradores de condominios en Chile.',
        'Incluye voz en off profesional en espanol neutro latino, subtitulos quemados, ritmo dinamico, musica corporativa moderna de fondo y cierre con marca.',
        'Dirección de arte obligatoria de ConviveConnect:',
        '- Paleta principal: fondo marfil calido #FAF7F1 / #FBF8F3, superficie blanca suave #FFFFFF, tinta profunda #1A1611 / #1F1713, cobre terracota #C8705A / #B45F4B como acento, verde grisaceo sobrio #6E8268 solo para confirmaciones.',
        '- Evita azules corporativos genericos, morados, neones, degradados futuristas, colores saturados o fondos oscuros dominantes.',
        '- Estilo visual: SaaS premium sobrio, editorial, elegante y operativo. Mucho espacio en blanco, bordes finos, cards de radio 8-10px, sombras muy suaves, layouts tipo dashboard real.',
        '- Tipografia aproximada: titulos con serif editorial similar a Instrument Serif, peso liviano; textos de interfaz con sans moderna similar a Geist. Nada de fuentes futuristas, comic, bold exagerado o letras 3D.',
        '- Composicion: mostrar pantallas tipo dashboard de administracion, paneles claros, chips de estado, checklists auditables, tablas limpias, permisos y trazabilidad. Transiciones sutiles, no efectos de TikTok ruidosos.',
        '- Subtitulos: fondo claro o etiqueta marfil, texto tinta, acentos cobre. Maximo 7 palabras por linea. Mantener zona segura para Instagram.',
        '- Logo/cierre: cierre minimalista con texto ConviveConnect en tinta/cobre y URL conviveconnect.com claramente visible sobre fondo marfil.',
        'No uses estetica infantil ni videojuego; evita audio tipo Atari. Usa visuales SaaS, edificios, paneles operativos, trazabilidad, permisos y administracion moderna.',
        `Titulo: ${reel.title}`,
        `Objetivo: ${reel.objective}`,
        `Angulo: ${reel.creativePackage.angle}`,
        `Hook: ${reel.creativePackage.hook}`,
        `Duracion objetivo: ${normalizeDurationSeconds(reel)} segundos`,
        `Marca: ${reel.renderSpec.brand.name || 'ConviveConnect'}`,
        `Sitio: ${reel.renderSpec.brand.domain || 'conviveconnect.com'}`,
        `CTA final: ${reel.creativePackage.coverText || 'Agenda una demo en conviveconnect.com'}`,
        `Escenas:\n${scenes}`,
        `Caption de referencia: ${reel.caption}`,
        'Entrega un MP4 vertical final. El usuario solo revisara el resultado, no editara plantillas.',
    ].join('\n\n').slice(0, 10000);
}

function getHeyGenVideoUrl(data: unknown) {
    const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const row = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    return asString(row.captioned_video_url)
        || asString(row.video_url)
        || asString(row.url)
        || asString(row.output_url);
}

function getHeyGenVideoId(data: unknown) {
    const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const row = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    return asString(row.video_id) || asString(row.id);
}

function getHeyGenFailure(data: unknown) {
    const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
    const row = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    return asString(row.failure_message) || asString(row.failure_code);
}

function getPendingHeyGenJobId(reel: MarketingReelRecord) {
    const marker = 'HEYGEN_PENDING:';
    const detail = reel.failureReason || '';
    const index = detail.indexOf(marker);
    if (index < 0) return '';
    return detail.slice(index + marker.length).split(/\s+/)[0]?.trim() || '';
}

async function waitForHeyGenVideo(videoId: string, apiKey: string) {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        await sleep(5000);
        const response = await fetch(`https://api.heygen.com/v3/videos/${encodeURIComponent(videoId)}`, {
            headers: { 'x-api-key': apiKey },
        });
        const data = await response.json().catch(() => ({})) as unknown;
        if (!response.ok) continue;
        const failure = getHeyGenFailure(data);
        if (failure) throw new Error(`HeyGen no pudo generar el video: ${failure}`);
        const videoUrl = getHeyGenVideoUrl(data);
        if (videoUrl) {
            return {
                videoUrl,
                thumbnailUrl: (() => {
                    const root = data && typeof data === 'object' ? data as Record<string, unknown> : {};
                    const row = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
                    return asString(row.thumbnail_url) || null;
                })(),
            };
        }
    }
    return null;
}

async function requestHeyGenRender(reel: MarketingReelRecord): Promise<RenderResult> {
    const apiKey = process.env.HEYGEN_API_KEY?.trim();
    if (!apiKey) {
        throw new Error('Falta configurar HEYGEN_API_KEY para que el agente genere el video completo.');
    }

    const pendingJobId = getPendingHeyGenJobId(reel);
    if (pendingJobId) {
        const finished = await waitForHeyGenVideo(pendingJobId, apiKey);
        if (!finished?.videoUrl) throw new PendingVideoRenderError(pendingJobId);
        return {
            videoUrl: finished.videoUrl,
            thumbnailUrl: finished.thumbnailUrl,
            providerJobId: pendingJobId,
        };
    }

    const body: Record<string, unknown> = {
        prompt: buildHeyGenPrompt(reel),
        mode: 'generate',
        orientation: 'portrait',
        incognito_mode: true,
    };
    if (process.env.HEYGEN_AVATAR_ID) body.avatar_id = process.env.HEYGEN_AVATAR_ID;
    if (process.env.HEYGEN_VOICE_ID) body.voice_id = process.env.HEYGEN_VOICE_ID;
    if (process.env.HEYGEN_STYLE_ID) body.style_id = process.env.HEYGEN_STYLE_ID;
    if (process.env.HEYGEN_BRAND_KIT_ID) body.brand_kit_id = process.env.HEYGEN_BRAND_KIT_ID;

    const response = await fetch('https://api.heygen.com/v3/video-agents', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
        },
        body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
        throw new Error(getProviderErrorMessage(data, 'HeyGen no pudo iniciar el video completo.'));
    }

    const videoId = getHeyGenVideoId(data);
    if (!videoId) {
        throw new Error(getProviderErrorMessage(data, 'HeyGen no devolvio video_id para consultar el resultado.'));
    }

    const finished = await waitForHeyGenVideo(videoId, apiKey);
    if (!finished?.videoUrl) {
        throw new PendingVideoRenderError(videoId);
    }

    return {
        videoUrl: finished.videoUrl,
        thumbnailUrl: finished.thumbnailUrl,
        providerJobId: videoId,
    };
}

async function requestCreatomateRender(reel: MarketingReelRecord): Promise<RenderResult> {
    const apiKey = process.env.CREATOMATE_API_KEY ? normalizeBearerToken(process.env.CREATOMATE_API_KEY) : '';
    const templateId = process.env.CREATOMATE_TEMPLATE_ID;
    const useTemplate = process.env.CREATOMATE_USE_TEMPLATE === 'true';
    if (!apiKey) {
        throw new Error('Falta configurar CREATOMATE_API_KEY para que el agente genere el MP4 profesional.');
    }
    if (useTemplate && !templateId) {
        throw new Error('CREATOMATE_USE_TEMPLATE esta activo, pero falta CREATOMATE_TEMPLATE_ID.');
    }

    const response = await fetch(process.env.CREATOMATE_RENDERS_URL || 'https://api.creatomate.com/v2/renders', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(useTemplate ? {
            template_id: templateId,
            modifications: buildCreatomateModifications(reel),
        } : buildCreatomateRenderScript(reel)),
    });

    const data = await response.json().catch(() => ({})) as unknown;
    if (!response.ok) {
        throw new Error(getProviderErrorMessage(data, 'Creatomate no pudo iniciar el render del reel.'));
    }

    const providerJobId = getCreatomateJobId(data);
    const videoUrl = getCreatomateVideoUrl(data) || (providerJobId ? await waitForCreatomateUrl(providerJobId, apiKey) : '');
    if (!videoUrl) {
        throw new Error('Creatomate inicio el render pero aun no devolvio URL de video. Revisa API Log; si queda en proceso, configuramos webhook de finalizacion.');
    }

    return {
        videoUrl,
        thumbnailUrl: null,
        providerJobId: providerJobId || null,
    };
}

async function requestVideoRender(reel: MarketingReelRecord, communityId: string): Promise<RenderResult> {
    if (getHiggsfieldCredentials()) {
        return requestHiggsfieldRender(reel, communityId);
    }

    if (process.env.HEYGEN_API_KEY) {
        return requestHeyGenRender(reel);
    }

    if (process.env.CREATOMATE_API_KEY) {
        return requestCreatomateRender(reel);
    }

    const webhookUrl = process.env.MARKETING_VIDEO_RENDER_WEBHOOK_URL;
    if (!webhookUrl) {
        throw new Error('Falta configurar CREATOMATE_API_KEY, o MARKETING_VIDEO_RENDER_WEBHOOK_URL, para generar el MP4 final.');
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
    const communityId = communityIdFor(profile);
    const reel = await loadReelForCommunity(reelId, communityId);
    await updateReel(reel.id, { status: 'rendering', failure_reason: null });

    try {
        const result = await requestVideoRender(reel, communityId);
        return updateReel(reel.id, {
            status: 'rendered',
            video_url: result.videoUrl,
            thumbnail_url: result.thumbnailUrl || null,
            failure_reason: null,
        });
    } catch (error) {
        if (error instanceof PendingVideoRenderError) {
            return updateReel(reel.id, {
                status: 'rendering',
                failure_reason: `HEYGEN_PENDING:${error.providerJobId}`,
            });
        }
        if (error instanceof PendingHiggsfieldRenderError) {
            return updateReel(reel.id, {
                status: 'rendering',
                thumbnail_url: error.imageUrl || reel.thumbnailUrl || null,
                failure_reason: error.message,
            });
        }
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

    const graphBaseUrl = asString(connection?.page_id) === 'instagram_login' ? INSTAGRAM_GRAPH_BASE_URL : FACEBOOK_GRAPH_BASE_URL;
    const mediaEndpoint = `${graphBaseUrl}/${instagramUserId}/media`;
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

    const publishEndpoint = `${graphBaseUrl}/${instagramUserId}/media_publish`;
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
