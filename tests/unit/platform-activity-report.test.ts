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
    todayCostByUser: { u1: 92, u2: 15 },
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
        expect(report.nearLimit.map(n => n.name)).toEqual(['Ana Pérez', 'Camilo Valenzuela']);
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
