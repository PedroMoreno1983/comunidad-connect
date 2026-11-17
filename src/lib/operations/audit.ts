import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { logger, resolveRequestId } from '@/lib/observability/logger';

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
// Enlaces que son credenciales (portal del maestro, portal del fiscalizador):
// se tachan aunque vengan bajo una llave inocente o dentro de un texto.
const SECRET_LINK = /\/(proveedor|fiscalizador)(\/|%2F)[A-Za-z0-9_-]{20,}/gi;

function sanitizeValue(value: unknown, depth = 0): JsonLike | undefined {
    if (depth > 4) return '[truncated]';
    if (value === null || value === undefined) return value === null ? null : undefined;
    if (typeof value === 'string') {
        const redacted = value.replace(SECRET_LINK, '/$1$2[redacted]');
        return redacted.length > 700 ? `${redacted.slice(0, 700)}...` : redacted;
    }
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
    return request ? resolveRequestId(request) : null;
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

    logger.info('operation.event', payload);

    if (!payload.community_id) {
        return { ok: false, reason: 'missing_community_id' as const };
    }

    try {
        const { error } = await getSupabaseAdmin()
            .from('operation_events')
            .insert(payload);

        if (error) {
            logger.warn('operation.event_insert_failed', { requestId: payload.request_id, reason: error.message });
            return { ok: false, reason: error.message };
        }

        return { ok: true as const };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown operation audit error';
        logger.error('operation.event_insert_crashed', error, { requestId: payload.request_id });
        return { ok: false, reason: message };
    }
}

export type PlatformOperationEventInput = {
    actorId?: string | null;
    actorEmail?: string | null;
    action: string;
    entityType: string;
    entityId?: string | null;
    summary: string;
    metadata?: Record<string, unknown>;
};

/**
 * Bitácora global (platform_operation_events): lo que no pertenece a una sola
 * comunidad, como la Red Convive de maestros. Misma sanitización que
 * recordOperationEvent.
 */
export async function recordPlatformOperationEvent(input: PlatformOperationEventInput) {
    const payload = {
        actor_id: input.actorId || null,
        actor_email: input.actorEmail || null,
        action: input.action,
        entity_type: input.entityType,
        entity_id: input.entityId || null,
        summary: input.summary,
        metadata: sanitizeMetadata(input.metadata),
    };
    logger.info('platform.operation.event', payload);
    try {
        const { error } = await getSupabaseAdmin().from('platform_operation_events').insert(payload);
        if (error) {
            logger.warn('platform.operation.event_insert_failed', { action: payload.action, reason: error.message });
            return { ok: false as const, reason: error.message };
        }
        return { ok: true as const };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown platform audit error';
        logger.error('platform.operation.event_insert_crashed', error, { action: payload.action });
        return { ok: false as const, reason: message };
    }
}

/**
 * CONFIDENCIALIDAD DE CoCo (17-11-2026). La administración no sabe qué le pide
 * cada residente a CoCo: ni sus conversaciones ni las acciones que CoCo hizo a
 * su nombre (guardar una lista, crearse un recordatorio). Lo que el residente
 * envía a la administración (una solicitud, una reserva) llega por su módulo,
 * no por esta bitácora. Filtro PostgREST para toda lectura de la administración
 * sobre operation_events: deja pasar lo que no es de CoCo, lo del sistema y lo
 * que hizo el propio personal.
 */
export const COCO_STAFF_ROLES = ['admin', 'concierge', 'superadmin'] as const;
export const ADMIN_VISIBLE_EVENTS_FILTER =
    `action.not.like.coco.*,actor_role.is.null,actor_role.in.(${COCO_STAFF_ROLES.join(',')})`;

/** Lo mismo, para filas ya leídas. */
export function adminMaySeeEvent(row: { action?: unknown; actor_role?: unknown }) {
    const action = String(row.action || '');
    if (!action.startsWith('coco.')) return true;
    const role = row.actor_role;
    return role === null || role === undefined || role === '' || (COCO_STAFF_ROLES as readonly string[]).includes(String(role));
}

/** De estos perfiles, los que son personal de la comunidad (sus registros sí los ve la administración). */
export async function staffProfileIds(ids: string[]): Promise<Set<string>> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return new Set();
    const { data } = await getSupabaseAdmin().from('profiles').select('id, role').in('id', unique);
    return new Set((data || [])
        .filter(row => (COCO_STAFF_ROLES as readonly string[]).includes(String(row.role)))
        .map(row => String(row.id)));
}
