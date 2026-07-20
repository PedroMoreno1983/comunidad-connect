import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { buildCocoVoiceoverText, signMarketingVoiceRequest } from '@/lib/marketing/reelWorkflow';
import type { MarketingReelRecord, ReelCreativePackage, ReelRenderSpec } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

function asString(value: unknown, fallback = '') {
    return typeof value === 'string' ? value : fallback;
}

function mapReel(row: Record<string, unknown>): MarketingReelRecord {
    return {
        id: asString(row.id),
        campaignId: asString(row.campaign_id) || null,
        title: asString(row.title),
        objective: asString(row.objective),
        audience: asString(row.audience, 'administrators') as MarketingReelRecord['audience'],
        tone: asString(row.tone, 'premium') as MarketingReelRecord['tone'],
        durationSeconds: Number(row.duration_seconds) || 35,
        featureFocus: asString(row.feature_focus, 'Agent Center'),
        status: asString(row.status, 'generated') as MarketingReelRecord['status'],
        creativePackage: row.creative_package as ReelCreativePackage,
        renderSpec: row.render_spec as ReelRenderSpec,
        videoUrl: asString(row.video_url) || null,
        thumbnailUrl: asString(row.thumbnail_url) || null,
        caption: asString(row.caption),
        hashtags: Array.isArray(row.hashtags) ? row.hashtags.filter((tag): tag is string => typeof tag === 'string') : [],
        scheduledAt: asString(row.scheduled_at) || null,
        publishedAt: asString(row.published_at) || null,
        instagramMediaId: asString(row.instagram_media_id) || null,
        failureReason: asString(row.failure_reason) || null,
        createdAt: asString(row.created_at, new Date().toISOString()),
        updatedAt: asString(row.updated_at) || null,
    };
}

export async function GET(req: NextRequest, context: { params: Promise<{ reelId: string }> }) {
    const { reelId } = await context.params;
    const token = req.nextUrl.searchParams.get('token') || '';
    if (!reelId || token !== signMarketingVoiceRequest(reelId)) {
        return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) {
        return NextResponse.json({ error: 'OPENAI_API_KEY no configurada.' }, { status: 500 });
    }

    const { data, error } = await getSupabaseAdmin()
        .from('marketing_reels')
        .select('*')
        .eq('id', reelId)
        .maybeSingle();

    if (error) {
        console.error('[reels voice] query failed', error);
        return NextResponse.json({ error: 'No se pudo cargar el reel.' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'Reel no encontrado.' }, { status: 404 });

    const reel = mapReel(data as Record<string, unknown>);
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts',
            voice: process.env.OPENAI_TTS_VOICE || 'nova',
            input: buildCocoVoiceoverText(reel),
            instructions: 'Voz femenina latina, clara, moderna y con energia positiva. Habla como CoCo, una agente de IA operativa: segura, agil y cercana. Ritmo comercial dinamico, con sonrisa en la voz, sin sonar triste, lenta ni solemne. No exagerar como locutora radial.',
            response_format: 'mp3',
        }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => '');
        return NextResponse.json({ error: message || 'No se pudo generar la voz de CoCo.' }, { status: response.status });
    }

    return new NextResponse(response.body, {
        status: 200,
        headers: {
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'public, max-age=3600',
        },
    });
}
