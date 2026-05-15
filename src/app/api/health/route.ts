import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function hasEnv(name: string) {
    return Boolean(process.env[name]?.trim());
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
        payments: hasEnv('HAULMER_API_KEY') && hasEnv('HAULMER_WEBHOOK_SECRET'),
        protectedWebhooks: hasEnv('WHATSAPP_WEBHOOK_SECRET') && hasEnv('IOT_WEBHOOK_SECRET'),
        monitoring: hasEnv('AI_HEALTH_TOKEN'),
        semanticSearch: hasEnv('VOYAGE_API_KEY'),
    };

    const coreReady = Object.values(core).every(Boolean);
    const aiReady = Object.values(ai).some(Boolean);
    const demoReady = coreReady && aiReady;
    const paidProductionReady = demoReady && Object.values(communications).every(Boolean) && Object.values(paidIntegrations).every(Boolean);

    return NextResponse.json({
        ok: demoReady,
        status: paidProductionReady ? 'ready' : demoReady ? 'degraded' : 'not_ready',
        service: 'convive-connect',
        checkedAt: new Date().toISOString(),
        checks: {
            core,
            ai,
            communications,
            paidIntegrations,
        },
    }, {
        status: demoReady ? 200 : 503,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
