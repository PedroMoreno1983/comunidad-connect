/**
 * 19-11-2026: reporte de actividad de mañana y tarde para la superadministración.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import { buildActivityReport, isProblemReply, renderActivityReportHtml, reportKey, reportWindow, type ReportInput } from '@/lib/platform/activityReport';

const C = 'c0000000-0000-4000-8000-000000000001';
const base: ReportInput = {
    period: 'am',
    windowStart: '2026-11-18T21:00:00.000Z',
    windowEnd: '2026-11-19T11:00:00.000Z',
    communities: { [C]: 'Bahía Las Palmas' },
    people: [
        { id: 'u1', name: 'Camilo Valenzuela', email: 'c@x.cl', role: 'admin', communityId: C, createdAt: '2026-11-18T23:37:00Z', lastSignInAt: '2026-11-18T23:40:00Z' },
        { id: 'u2', name: 'Ana Pérez', email: 'a@x.cl', role: 'resident', communityId: null, createdAt: '2026-10-01T00:00:00Z', lastSignInAt: '2026-10-02T00:00:00Z' },
        { id: 'u3', name: 'Sin uso', email: 's@x.cl', role: 'resident', communityId: C, createdAt: '2026-10-01T00:00:00Z', lastSignInAt: null },
    ],
    usage: [
        { user_id: 'u1', community_id: C, status: 'success', blocked_reason: null, estimated_cost_cents: 3.4, module: 'coco.chat', created_at: '2026-11-19T10:00:00Z' },
        { user_id: 'u1', community_id: C, status: 'success', blocked_reason: null, estimated_cost_cents: 3, module: 'coco.chat', created_at: '2026-11-19T10:01:00Z' },
        { user_id: 'u2', community_id: null, status: 'blocked', blocked_reason: 'daily_person_cost_limit', estimated_cost_cents: 3, module: 'coco.chat', created_at: '2026-11-19T10:02:00Z' },
    ],
    todayCostByUser: { u1: 185, u2: 45 },
    sessions: [{
        key: 'web:u1:t', lastActivity: '2026-11-19T10:01:00Z', userId: 'u1', name: 'Camilo Valenzuela', role: 'admin', channel: 'web', communityId: C,
        turns: [
            { role: 'user', content: 'sitio 20 Jose ignacio valenzuela' },
            { role: 'assistant', content: 'Confirmo antes de guardar' },
            { role: 'user', content: 'si' },
            { role: 'assistant', content: 'Dueño de la unidad: no se pudo completar. No encontré a esa persona en la comunidad.' },
        ],
    }],
    bills: [
        { community_id: C, status: 'pending', file_name: 'enel.pdf', error: null, received_at: '2026-11-17T10:00:00Z' },
        { community_id: C, status: 'failed', file_name: 'gas.pdf', error: 'PDF protegido', received_at: '2026-11-19T09:00:00Z' },
    ],
};

describe('reporte de actividad', () => {
    it('reúne actividad, problemas, bloqueos y pendientes', () => {
        const report = buildActivityReport(base);
        expect(report.title).toBe('Reporte de la mañana');
        expect(report.totals).toMatchObject({ activePeople: 1, newPeople: 1, cocoTurns: 2, problems: 1, blocked: 1 });
        expect(report.active[0]).toMatchObject({ name: 'Camilo Valenzuela', community: 'Bahía Las Palmas', turns: 2, channel: 'Web' });
        expect(report.problems[0]).toMatchObject({ who: 'Camilo Valenzuela', asked: 'sitio 20 Jose ignacio valenzuela', times: 1 });
        expect(report.blocked[0]).toMatchObject({ name: 'Ana Pérez', community: 'Sin condominio', reason: 'cupo diario' });
        expect(report.nearLimit.map(n => n.name)).toEqual(['Camilo Valenzuela', 'Ana Pérez']);
        expect(report.pendingBills).toEqual([{ community: 'Bahía Las Palmas', count: 1 }]);
        expect(report.failedBills[0]).toMatchObject({ file: 'gas.pdf' });
    });

    it('reconoce respuestas que no resolvieron', () => {
        expect(isProblemReply('Dueño de la unidad: no se pudo completar. X')).toBe(true);
        expect(isProblemReply('No pude responder eso')).toBe(true);
        expect(isProblemReply('No encontré una pantalla llamada "Código admin"')).toBe(true);
        expect(isProblemReply('Listo, quedó guardado.')).toBe(false);
    });

    it('escapa lo que escribió la gente', () => {
        const html = renderActivityReportHtml(buildActivityReport({
            ...base,
            sessions: [{ ...base.sessions[0], turns: [{ role: 'user', content: '<script>x</script>' }, { role: 'assistant', content: 'No pude responder' }] }],
        }), 'ventana', ['algo <b>']);
        expect(html).not.toContain('<script>x');
        expect(html).toContain('&lt;script&gt;');
        expect(html).toContain('algo &lt;b&gt;');
    });

    it('turno y ventana en hora de Chile', () => {
        expect(reportKey(new Date('2026-11-19T11:00:00Z'))).toEqual({ key: '2026-11-19-am', period: 'am' });
        expect(reportKey(new Date('2026-11-19T21:00:00Z'))).toEqual({ key: '2026-11-19-pm', period: 'pm' });
        const now = new Date('2026-11-19T21:00:00Z');
        expect(reportWindow(now, '2026-11-19T11:00:05Z').start).toBe('2026-11-19T11:00:05Z');
        expect(reportWindow(now, '2026-11-10T11:00:00Z').start).toBe('2026-11-19T09:00:00.000Z');
        expect(reportWindow(now, null).start).toBe('2026-11-19T09:00:00.000Z');
    });
});

describe('técnicos en el reporte (19-11-2026)', () => {
    const providers = {
        providers: [{ id: 'p1', name: 'Juan', verified: false }, { id: 'p2', name: 'David', verified: false }, { id: 'p3', name: 'Leo', verified: true }],
        links: [
            { provider_id: 'p1', last_used_at: '2026-11-19T10:00:00Z', use_count: 2, revoked_at: null },
            { provider_id: 'p2', last_used_at: '2026-11-18T15:00:00Z', use_count: 19, revoked_at: null },
            { provider_id: 'p3', last_used_at: null, use_count: 0, revoked_at: null },
        ],
        documents: [{ provider_id: 'p1', kind: 'background_certificate', status: 'pending', created_at: '2026-11-19T10:05:00Z', auto_check: { verdict: 'needs_review' } }],
        photos: [{ provider_id: 'p2', created_at: '2026-11-18T15:45:00Z' }],
    };

    it('cuenta invitados, quién entró, qué subió y qué falta revisar', () => {
        const p = buildActivityReport({ ...base, providers }).providers!;
        expect(p).toMatchObject({ total: 3, invited: 3, openedEver: 2, verified: 1, openedNow: ['Juan'], photos: [] });
        expect(p.uploaded).toEqual([{ name: 'Juan', kind: 'certificado de antecedentes', verdict: 'revisar a mano' }]);
        expect(p.pendingReview).toEqual([{ name: 'Juan', kind: 'certificado de antecedentes', since: '2026-11-19', verdict: 'revisar a mano' }]);
        const html = renderActivityReportHtml(buildActivityReport({ ...base, providers }), 'turno', []);
        expect(html).toContain('Técnicos');
        expect(html).toContain('Por revisar (1)');
    });

    it('sin datos de técnicos el reporte sale igual', () => {
        expect(buildActivityReport(base).providers).toBeNull();
    });
});

describe('catálogos atrasados (22-11-2026)', () => {
    it('avisa la cadena que no se actualiza hace 30 h o más', () => {
        const report = buildActivityReport({ ...base, catalogs: [
            { store: 'Jumbo', lastSeenAt: '2026-11-19T09:00:00.000Z', fresh24h: 20000, total: 52000 },
            { store: 'Lider', lastSeenAt: '2026-11-12T12:00:00.000Z', fresh24h: 0, total: 18951 },
            { store: 'Tottus', lastSeenAt: null, fresh24h: 0, total: 0 },
        ] });
        expect(report.staleCatalogs.map(c => c.store)).toEqual(['Lider', 'Tottus']);
        const html = renderActivityReportHtml(report, 'turno', []);
        expect(html).toContain('Catálogos del supermercado atrasados');
        expect(html).toContain('nunca');
    });

    it('sin catálogos atrasados no agrega la sección', () => {
        const html = renderActivityReportHtml(buildActivityReport(base), 'turno', []);
        expect(html).not.toContain('Catálogos del supermercado atrasados');
    });
});
