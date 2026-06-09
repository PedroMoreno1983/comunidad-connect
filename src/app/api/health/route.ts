import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function hasEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) return false;
    return !/^(TU_|your_|placeholder|changeme|xxx)/i.test(value);
}

export async function GET() {
    const core = {
        supabaseUrl: hasEnv('NEXT_PUBLIC_SUPABASE_URL'),
        supabaseAnonKey: hasEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        supabaseServiceRole: hasEnv('SUPABASE_SERVICE_ROLE_KEY'),
    };

    const ai = {
        anthropic: hasEnv('ANTHROPIC_API_KEY'),
        gemini: hasEnv('GEMINI_API_KEY'),
        openai: hasEnv('OPENAI_API_KEY'),
    };

    const communications = {
        email: hasEnv('RESEND_API_KEY'),
        whatsapp: hasEnv('TWILIO_ACCOUNT_SID') && hasEnv('TWILIO_AUTH_TOKEN') && hasEnv('TWILIO_WHATSAPP_FROM'),
    };

    const paidIntegrations = {
        payments: hasEnv('HAULMER_ACCOUNT_ID') && hasEnv('HAULMER_SECRET_KEY'),
        protectedWebhooks: hasEnv('WHATSAPP_WEBHOOK_SECRET') && hasEnv('IOT_WEBHOOK_SECRET'),
        monitoring: hasEnv('AI_HEALTH_TOKEN'),
        semanticSearch: hasEnv('VOYAGE_API_KEY'),
    };

    const coreReady = Object.values(core).every(Boolean);
    const aiReady = Object.values(ai).some(Boolean);
    const appReady = coreReady && aiReady;
    const commercialChannelsReady = Object.values(communications).every(Boolean);
    const paidProductionReady = appReady && commercialChannelsReady && Object.values(paidIntegrations).every(Boolean);
    const missingProduction = [
        ...Object.entries(communications).filter(([, value]) => !value).map(([key]) => `communications.${key}`),
        ...Object.entries(paidIntegrations).filter(([, value]) => !value).map(([key]) => `paidIntegrations.${key}`),
    ];

    return NextResponse.json({
        ok: appReady,
        status: paidProductionReady ? 'ready' : appReady ? 'operational_needs_production_config' : 'not_ready',
        service: 'convive-connect',
        checkedAt: new Date().toISOString(),
        runtime: {
            productionReady: paidProductionReady,
            missingProduction,
        },
        checks: {
            core,
            ai,
            communications,
            paidIntegrations,
        },
    }, {
        status: appReady ? 200 : 503,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
