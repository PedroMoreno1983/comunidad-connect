import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

function hasEnv(name: string) {
    const value = process.env[name]?.trim();
    if (!value) return false;
    return !/^(TU_|your_|placeholder|changeme|xxx)/i.test(value);
}

function isRequired(name: string) {
    return process.env[name] === '1' || process.env[name]?.toLowerCase() === 'true';
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

    const paymentsReady = hasEnv('HAULMER_ACCOUNT_ID') && hasEnv('HAULMER_SECRET_KEY');
    const paymentsRequired = isRequired('HAULMER_PAYMENTS_REQUIRED');
    const iotWebhookReady = true;
    const iotWebhookRequired = false;
    const monitoringReady = hasEnv('AI_HEALTH_TOKEN');
    const monitoringRequired = isRequired('AI_HEALTH_TOKEN_REQUIRED');
    const automation = {
        agentScheduler: hasEnv('CRON_SECRET'),
        accessTriggeredFallback: true,
    };
    const automationReady = automation.agentScheduler || automation.accessTriggeredFallback;

    const paidIntegrations = {
        payments: paymentsReady || !paymentsRequired,
        protectedWebhooks: hasEnv('WHATSAPP_WEBHOOK_SECRET'),
        monitoring: monitoringReady || !monitoringRequired,
        semanticSearch: hasEnv('VOYAGE_API_KEY'),
    };

    const integrationDetail = {
        payments: {
            ready: paymentsReady,
            required: paymentsRequired,
            deferred: !paymentsReady && !paymentsRequired,
        },
        webhooks: {
            whatsapp: hasEnv('WHATSAPP_WEBHOOK_SECRET'),
            iot: iotWebhookReady,
            iotRequired: iotWebhookRequired,
            iotMode: 'community_scoped_secret_and_opt_in',
            iotDeferred: false,
        },
        monitoring: {
            ready: monitoringReady,
            required: monitoringRequired,
            deferred: !monitoringReady && !monitoringRequired,
        },
    };

    const coreReady = Object.values(core).every(Boolean);
    const aiReady = Object.values(ai).some(Boolean);
    const appReady = coreReady && aiReady;
    const commercialChannelsReady = Object.values(communications).every(Boolean);
    const productionReady = appReady && commercialChannelsReady && Object.values(paidIntegrations).every(Boolean) && automationReady;
    const fullPaidProductionReady = productionReady && paymentsReady && monitoringReady;
    const missingProduction = [
        ...Object.entries(communications).filter(([, value]) => !value).map(([key]) => `communications.${key}`),
        ...Object.entries(paidIntegrations).filter(([, value]) => !value).map(([key]) => `paidIntegrations.${key}`),
        ...(!automationReady ? ['automation.agentTriggers'] : []),
    ];
    const deferredProduction = [
        ...(!paymentsReady && !paymentsRequired ? ['paidIntegrations.payments'] : []),
        ...(!iotWebhookReady && !iotWebhookRequired ? ['paidIntegrations.iotWebhook'] : []),
        ...(!monitoringReady && !monitoringRequired ? ['paidIntegrations.monitoring'] : []),
        ...(!automation.agentScheduler ? ['automation.scheduledAgentTriggers'] : []),
    ];

    return NextResponse.json({
        ok: appReady,
        status: productionReady ? (deferredProduction.length ? 'ready_with_deferred_integrations' : 'ready') : appReady ? 'operational_needs_production_config' : 'not_ready',
        service: 'convive-connect',
        checkedAt: new Date().toISOString(),
        runtime: {
            productionReady,
            fullPaidProductionReady,
            missingProduction,
            deferredProduction,
        },
        checks: {
            core,
            ai,
            communications,
            paidIntegrations,
            automation,
            integrationDetail,
        },
    }, {
        status: appReady ? 200 : 503,
        headers: {
            'Cache-Control': 'no-store',
        },
    });
}
