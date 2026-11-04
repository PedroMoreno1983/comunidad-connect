/**
 * Autenticación y ventana del scheduler externo.
 * Puro: no lee el entorno ni la base. El secreto no se registra.
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export type SchedulerMode = 'triggers' | 'proposals' | 'all';
export type SchedulerAccess = 'ok' | 'missing' | 'rejected';

const WINDOW_MS = 15 * 60_000;

export function schedulerSecrets(values: Array<string | undefined>): string[] {
    const unique = new Set<string>();
    for (const value of values) {
        const secret = value?.trim();
        if (secret) unique.add(secret);
    }
    return [...unique];
}

function sameSecret(presented: string, expected: string): boolean {
    const left = createHash('sha256').update(presented).digest();
    const right = createHash('sha256').update(expected).digest();
    return timingSafeEqual(left, right);
}

/** Authorization: Bearer. Acepta SCHEDULER_SECRET o, si no viene otro, CRON_SECRET. */
export function authorizeScheduler(authorization: string | null, secrets: string[]): SchedulerAccess {
    if (!secrets.length) return 'missing';
    const match = authorization?.match(/^Bearer\s+(\S+)\s*$/);
    if (!match) return 'rejected';
    return secrets.some(secret => sameSecret(match[1], secret)) ? 'ok' : 'rejected';
}

export function parseSchedulerMode(value: string | null): SchedulerMode | 'invalid' {
    if (!value || value === 'triggers') return 'triggers';
    if (value === 'proposals' || value === 'all') return value;
    return 'invalid';
}

/** Inicio de la ventana de 15 minutos. Dos llamadas en la misma ventana comparten bucket. */
export function schedulerBucket(now: Date): string {
    return new Date(Math.floor(now.getTime() / WINDOW_MS) * WINDOW_MS).toISOString();
}
