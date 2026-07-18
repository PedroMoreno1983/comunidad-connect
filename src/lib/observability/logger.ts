import { randomUUID } from 'node:crypto';

type LogLevel = 'info' | 'warn' | 'error';
type LogMetadata = Record<string, unknown>;

const SENSITIVE_KEY = /(password|token|secret|api[_-]?key|authorization|cookie|session|credential|email|phone)/i;

function sanitize(value: unknown, depth = 0): unknown {
    if (depth > 4) return '[truncated]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.length > 500 ? `${value.slice(0, 500)}…` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
        return {
            name: value.name,
            message: value.message.slice(0, 500),
            stack: process.env.NODE_ENV === 'production' ? undefined : value.stack?.slice(0, 2_000),
        };
    }
    if (Array.isArray(value)) return value.slice(0, 20).map(item => sanitize(item, depth + 1));
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>)
                .slice(0, 40)
                .map(([key, nested]) => [key, SENSITIVE_KEY.test(key) ? '[redacted]' : sanitize(nested, depth + 1)]),
        );
    }
    return String(value);
}

export function resolveRequestId(request?: Request | null) {
    return request?.headers.get('x-request-id')
        || request?.headers.get('x-vercel-id')
        || request?.headers.get('cf-ray')
        || randomUUID();
}

function emit(level: LogLevel, event: string, metadata: LogMetadata = {}) {
    const payload = JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        event,
        service: 'convive-connect',
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown',
        ...(sanitize(metadata) as Record<string, unknown>),
    });

    if (level === 'error') console.error(payload);
    else if (level === 'warn') console.warn(payload);
    else console.info(payload);
}

export const logger = {
    info: (event: string, metadata?: LogMetadata) => emit('info', event, metadata),
    warn: (event: string, metadata?: LogMetadata) => emit('warn', event, metadata),
    error: (event: string, error: unknown, metadata: LogMetadata = {}) => emit('error', event, { ...metadata, error }),
};

export function logApiError(request: Request, route: string, error: unknown, metadata: LogMetadata = {}) {
    logger.error('api.request_failed', error, {
        requestId: resolveRequestId(request),
        route,
        method: request.method,
        ...metadata,
    });
}

/**
 * Logs the full error server-side (via logApiError) and returns a generic,
 * client-safe JSON error response instead of forwarding error.message --
 * provider/DB error text (Resend, Postgres, etc.) can reveal internal
 * config or schema details to the caller.
 */
export function apiErrorResponse(
    request: Request,
    route: string,
    error: unknown,
    options: { status?: number; publicMessage?: string; metadata?: LogMetadata } = {},
) {
    const { status = 500, publicMessage = 'No se pudo procesar la solicitud.', metadata } = options;
    logApiError(request, route, error, metadata);
    return Response.json(
        { error: publicMessage, requestId: resolveRequestId(request) },
        { status },
    );
}
