export type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'voyage' | 'system';
export type AiEventStatus = 'success' | 'error' | 'fallback' | 'skipped';

export interface AiTelemetryEvent {
    id: string;
    timestamp: string;
    provider: AiProvider;
    feature: string;
    status: AiEventStatus;
    model?: string;
    latencyMs?: number;
    promptChars?: number;
    outputChars?: number;
    fallbackUsed?: string;
    error?: string;
}

const MAX_EVENTS = 200;

declare global {
    var __comunidadConnectAiEvents: AiTelemetryEvent[] | undefined;
}

function store() {
    if (!globalThis.__comunidadConnectAiEvents) {
        globalThis.__comunidadConnectAiEvents = [];
    }
    return globalThis.__comunidadConnectAiEvents;
}

function sanitizeError(error: unknown) {
    if (!error) return undefined;
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/AIza[0-9A-Za-z_-]+/g, 'AIza<redacted>').slice(0, 500);
}

export function recordAiEvent(event: Omit<AiTelemetryEvent, 'id' | 'timestamp' | 'error'> & { error?: unknown }) {
    const entry: AiTelemetryEvent = {
        ...event,
        id: `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        error: sanitizeError(event.error),
    };

    const events = store();
    events.unshift(entry);
    if (events.length > MAX_EVENTS) {
        events.length = MAX_EVENTS;
    }

    const level = entry.status === 'error' ? 'warn' : 'info';
    console[level]('[AI Telemetry]', JSON.stringify(entry));
}

export function getAiEvents(limit = 50) {
    return store().slice(0, limit);
}

export function getAiHealthSnapshot() {
    const events = getAiEvents(MAX_EVENTS);
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const recent = events.filter(event => new Date(event.timestamp).getTime() >= oneHourAgo);

    const byProvider = recent.reduce<Record<string, { success: number; error: number; fallback: number; skipped: number }>>(
        (acc, event) => {
            acc[event.provider] ||= { success: 0, error: 0, fallback: 0, skipped: 0 };
            acc[event.provider][event.status] += 1;
            return acc;
        },
        {}
    );

    return {
        generatedAt: new Date().toISOString(),
        environment: {
            gemini: Boolean(process.env.GEMINI_API_KEY),
            openai: Boolean(process.env.OPENAI_API_KEY),
            anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
            voyage: Boolean(process.env.VOYAGE_API_KEY),
            supabase: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)),
        },
        models: {
            geminiTraining: process.env.GEMINI_TRAINING_MODELS || 'gemini-2.5-flash-lite,gemini-2.5-flash,gemini-2.0-flash',
            image: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
        },
        lastHour: {
            total: recent.length,
            byProvider,
        },
        recentEvents: events.slice(0, 20),
    };
}
