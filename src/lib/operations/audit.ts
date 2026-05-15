import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

type OperationSeverity = 'info' | 'success' | 'warning' | 'error';
type OperationStatus = 'success' | 'error' | 'blocked' | 'pending';

type JsonLike =
    | string
    | number
    | boolean
    | null
    | JsonLike[]
    | { [key: string]: JsonLike | undefined };

export type OperationEventInput = {
    communityId?: string | null;
    actorId?: string | null;
    actorRole?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    severity?: OperationSeverity;
    status?: OperationStatus;
    summary: string;
    metadata?: Record<string, unknown>;
    requestId?: string | null;
};

const SENSITIVE_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|session|credential)/i;

function sanitizeValue(value: unknown, depth = 0): JsonLike | undefined {
    if (depth > 4) return '[truncated]';
    if (value === null || value === undefined) return value === null ? null : undefined;
    if (typeof value === 'string') return value.length > 700 ? `${value.slice(0, 700)}...` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
        return value.slice(0, 30).map(item => sanitizeValue(item, depth + 1)).filter(item => item !== undefined) as JsonLike[];
    }
    if (typeof value === 'object') {
        const output: Record<string, JsonLike> = {};
        for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
            if (SENSITIVE_KEY.test(key)) {
                output[key] = '[redacted]';
                continue;
            }
            const sanitized = sanitizeValue(nestedValue, depth + 1);
            if (sanitized !== undefined) output[key] = sanitized;
        }
        return output;
    }
    return String(value);
}

export function sanitizeMetadata(metadata: Record<string, unknown> = {}) {
    const sanitized = sanitizeValue(metadata);
    return sanitized && !Array.isArray(sanitized) && typeof sanitized === 'object' ? sanitized : {};
}

export function getRequestId(request?: Request | null) {
    return request?.headers.get('x-vercel-id')
        || request?.headers.get('x-request-id')
        || request?.headers.get('cf-ray')
        || null;
}

export async function recordOperationEvent(input: OperationEventInput) {
    const payload = {
        community_id: input.communityId,
        actor_id: input.actorId || null,
        actor_role: input.actorRole || null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        severity: input.severity || 'info',
        status: input.status || 'success',
        summary: input.summary,
        metadata: sanitizeMetadata(input.metadata),
        request_id: input.requestId || null,
    };

    console.info(JSON.stringify({
        type: 'operation_event',
        ...payload,
    }));

    if (!payload.community_id) {
        return { ok: false, reason: 'missing_community_id' as const };
    }

    try {
        const { error } = await getSupabaseAdmin()
            .from('operation_events')
            .insert(payload);

        if (error) {
            console.warn('[operation_events] insert failed:', error.message);
            return { ok: false, reason: error.message };
        }

        return { ok: true as const };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown operation audit error';
        console.warn('[operation_events] insert crashed:', message);
        return { ok: false, reason: message };
    }
}
