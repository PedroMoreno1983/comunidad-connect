import { NextResponse } from 'next/server';

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

function getClientIp(request: Request) {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || request.headers.get('x-real-ip')
        || request.headers.get('cf-connecting-ip')
        || 'unknown';
}

export function checkRateLimit(
    request: Request,
    scope: string,
    options: { limit: number; windowMs: number }
) {
    const now = Date.now();
    const key = `${scope}:${getClientIp(request)}`;
    const entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return {
            allowed: true,
            remaining: Math.max(0, options.limit - 1),
            resetAt: now + options.windowMs,
        };
    }

    if (entry.count >= options.limit) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: entry.resetAt,
        };
    }

    entry.count += 1;
    return {
        allowed: true,
        remaining: Math.max(0, options.limit - entry.count),
        resetAt: entry.resetAt,
    };
}

export function enforceRateLimit(
    request: Request,
    scope: string,
    options: { limit: number; windowMs: number }
) {
    const result = checkRateLimit(request, scope, options);
    if (result.allowed) return null;

    return NextResponse.json(
        { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
        {
            status: 429,
            headers: {
                'Retry-After': String(Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))),
                'X-RateLimit-Limit': String(options.limit),
                'X-RateLimit-Remaining': '0',
            },
        }
    );
}
