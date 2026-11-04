import { describe, expect, it } from 'vitest';
import { decideProposal, proposalCopy } from '@/lib/agent-center/proactiveProposals';
import { authorizeScheduler, parseSchedulerMode, schedulerBucket, schedulerSecrets } from '@/lib/agent-center/schedulerAuth';

const NOW = new Date('2026-11-04T15:07:00.000Z');

describe('scheduler externo', () => {
    it('acepta SCHEDULER_SECRET o CRON_SECRET y rechaza otro valor', () => {
        const secrets = schedulerSecrets(['  vps-secret  ', 'cron-secret', '', undefined]);
        expect(secrets).toEqual(['vps-secret', 'cron-secret']);
        expect(authorizeScheduler('Bearer vps-secret', secrets)).toBe('ok');
        expect(authorizeScheduler('Bearer cron-secret', secrets)).toBe('ok');
        expect(authorizeScheduler('Bearer otro', secrets)).toBe('rejected');
        expect(authorizeScheduler(null, secrets)).toBe('rejected');
        expect(authorizeScheduler('Bearer vps-secret', [])).toBe('missing');
    });

    it('agrupa las llamadas de una misma ventana de 15 minutos', () => {
        expect(parseSchedulerMode(null)).toBe('triggers');
        expect(parseSchedulerMode('all')).toBe('all');
        expect(parseSchedulerMode('cada-hora')).toBe('invalid');
        expect(schedulerBucket(NOW)).toBe('2026-11-04T15:00:00.000Z');
        expect(schedulerBucket(new Date('2026-11-04T15:14:59.000Z'))).toBe('2026-11-04T15:00:00.000Z');
        expect(schedulerBucket(new Date('2026-11-04T15:15:00.000Z'))).toBe('2026-11-04T15:15:00.000Z');
    });
});

describe('propuestas proactivas', () => {
    it('no repite una propuesta abierta ni una reciente', () => {
        expect(decideProposal({ kind: 'overdue_followup', count: 0, open: false, lastCreatedAt: null, now: NOW })).toBe('skip_below');
        expect(decideProposal({ kind: 'overdue_followup', count: 3, open: true, lastCreatedAt: null, now: NOW })).toBe('skip_open');
        expect(decideProposal({
            kind: 'pending_bookings',
            count: 2,
            open: false,
            lastCreatedAt: '2026-11-04T12:00:00.000Z',
            now: NOW,
        })).toBe('skip_cooldown');
        expect(decideProposal({
            kind: 'overdue_followup',
            count: 3,
            open: false,
            lastCreatedAt: '2026-11-03T14:00:00.000Z',
            now: NOW,
        })).toBe('propose');
    });

    it('habla con el administrador sin montos ni lenguaje de deudor', () => {
        const copy = [
            proposalCopy('overdue_followup', 4),
            proposalCopy('pending_bookings', 1),
        ];
        const text = copy.map(item => `${item.title} ${item.body}`).join(' ');
        expect(text).not.toMatch(/moros|deudor|cobrar|amenaza|\$/i);
        expect(copy[0].href).toBe('/expenses');
        expect(copy[1].body).toContain('1 reserva');
    });
});
