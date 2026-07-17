import { NextResponse } from 'next/server';
import { createHash } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

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

/**
 * Cross-instance limiter backed by Postgres. It falls back to the local bucket
 * only while the migration is being rolled out, so a missing RPC never turns
 * into an outage.
 */
export async function enforceDistributedRateLimit(
    request: Request,
    scope: string,
    options: { limit: number; windowMs: number }
) {
    const subjectHash = createHash('sha256')
        .update(getClientIp(request))
        .digest('hex');

    try {
        const { data, error } = await getSupabaseAdmin().rpc('consume_api_rate_limit', {
            p_scope: scope,
            p_subject_hash: subjectHash,
            p_limit: options.limit,
            p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
        });
        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as {
            allowed?: boolean;
            remaining?: number;
            retry_after_seconds?: number;
        } | null;

        if (row?.allowed !== false) return null;

        return NextResponse.json(
            { error: 'Demasiadas solicitudes. Intenta nuevamente en unos segundos.' },
            {
                status: 429,
                headers: {
                    'Retry-After': String(Math.max(1, Number(row.retry_after_seconds) || 1)),
                    'X-RateLimit-Limit': String(options.limit),
                    'X-RateLimit-Remaining': String(Math.max(0, Number(row.remaining) || 0)),
                },
            },
        );
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[rate-limit] Distributed limiter unavailable; using local fallback.', error);
        }
        return enforceRateLimit(request, scope, options);
    }
}

function checkLocalBucketBySubject(scope: string, subject: string, options: { limit: number; windowMs: number }) {
    const now = Date.now();
    const key = `${scope}:subject:${subject}`;
    const entry = buckets.get(key);

    if (!entry || now > entry.resetAt) {
        buckets.set(key, { count: 1, resetAt: now + options.windowMs });
        return true;
    }
    if (entry.count >= options.limit) return false;
    entry.count += 1;
    return true;
}

/**
 * Like enforceDistributedRateLimit, but keyed by an explicit subject (e.g. a
 * WhatsApp phone number) instead of the request's source IP. Needed for
 * webhooks where every request arrives from the same upstream provider IP,
 * so per-IP limiting would throttle every user behind that provider together.
 */
export async function checkDistributedRateLimitBySubject(
    subject: string,
    scope: string,
    options: { limit: number; windowMs: number }
): Promise<boolean> {
    const subjectHash = createHash('sha256').update(subject).digest('hex');

    try {
        const { data, error } = await getSupabaseAdmin().rpc('consume_api_rate_limit', {
            p_scope: scope,
            p_subject_hash: subjectHash,
            p_limit: options.limit,
            p_window_seconds: Math.max(1, Math.ceil(options.windowMs / 1000)),
        });
        if (error) throw error;

        const row = (Array.isArray(data) ? data[0] : data) as { allowed?: boolean } | null;
        return row?.allowed !== false;
    } catch (error) {
        if (process.env.NODE_ENV !== 'production') {
            console.warn('[rate-limit] Distributed limiter unavailable; using local fallback.', error);
        }
        return checkLocalBucketBySubject(scope, subject, options);
    }
}
