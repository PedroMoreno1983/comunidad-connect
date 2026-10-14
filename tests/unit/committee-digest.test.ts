/**
 * Resumen semanal para el comité: agregación, reglas de privacidad, fallback
 * determinista y ventana semanal (idempotencia y cron con horario de verano).
 */
import { describe, expect, it } from 'vitest';
import { buildCommitteeDigestMetrics, type CommitteeDigestRawData } from '@/lib/committeeDigest/metrics';
import { checkDigestPrivacy, normalizeKnownNames, scrubPublicTitle } from '@/lib/committeeDigest/privacy';
import {
    acceptAiDigest,
    composeFallbackDigest,
    DECISIONS_HEADING,
    draftCommitteeDigest,
    suggestCommitteeDecisions,
} from '@/lib/committeeDigest/compose';
import { committeeDigestWindow, isCommitteeDigestCronHour, periodLabel } from '@/lib/committeeDigest/week';
import { AGENT_PLAYBOOKS } from '@/lib/agent-center/domain';

// Lunes 19 de octubre de 2026, 8:15 en Chile (horario de verano, UTC-3).
const MONDAY = new Date('2026-10-19T11:15:00Z');
const window = committeeDigestWindow(MONDAY);

function raw(overrides: Partial<CommitteeDigestRawData> = {}): CommitteeDigestRawData {
    return {
        units: Array.from({ length: 20 }, (_, index) => ({ id: `u${index + 1}` })),
        debts: [
            { unit_id: 'u1', due_date: '2026-10-05', status: 'pending' },
            { unit_id: 'u1', due_date: '2026-09-05', status: 'overdue' },
            { unit_id: 'u2', due_date: '2026-10-05', status: 'overdue' },
            { unit_id: 'u3', due_date: '2026-11-05', status: 'pending' }, // aún no vence
            { unit_id: 'ajena', due_date: '2026-10-05', status: 'pending' }, // de otra comunidad
        ],
        agreements: [
            { status: 'active', created_at: '2026-10-14T15:00:00Z' },
            { status: 'active', created_at: '2026-08-01T15:00:00Z' },
            { status: 'pending_committee', created_at: '2026-10-16T15:00:00Z' },
            { status: 'cancelled', created_at: '2026-10-15T15:00:00Z' },
        ],
        tasks: [
            { status: 'pending', due_date: '2026-10-22', completed_at: null, frequency: 'monthly' },
            { status: 'pending', due_date: '2026-10-10', completed_at: null, frequency: 'monthly' },
            { status: 'overdue', due_date: '2026-10-01', completed_at: null, frequency: 'quarterly' },
            { status: 'completed', due_date: '2026-10-12', completed_at: '2026-10-15T18:00:00Z', frequency: 'monthly' },
            { status: 'completed', due_date: '2026-09-12', completed_at: '2026-09-15T18:00:00Z', frequency: 'monthly' },
        ],
        risks: [
            { assetName: 'Ascensor torre A', level: 'high', score: 72 },
            { assetName: 'Bomba de agua', level: 'medium', score: 40 },
        ],
        quotes: [
            { status: 'requested', task_id: 't1', service_request_id: null },
            { status: 'received', task_id: 't2', service_request_id: null },
            { status: 'received', task_id: 't2', service_request_id: null },
            { status: 'selected', task_id: 't3', service_request_id: null },
            { status: 'received', task_id: 't3', service_request_id: null },
        ],
        serviceRequests: [
            { status: 'pending', created_at: '2026-10-13T12:00:00Z', updated_at: '2026-10-13T12:00:00Z' },
            { status: 'completed', created_at: '2026-10-01T12:00:00Z', updated_at: '2026-10-17T12:00:00Z' },
        ],
        cases: [
            { status: 'open', category: 'ruido', type: 'incidencia', created_at: '2026-10-15T02:00:00Z', updated_at: '2026-10-15T02:00:00Z' },
            { status: 'resolved', category: 'ruido', type: 'incidencia', created_at: '2026-10-02T02:00:00Z', updated_at: '2026-10-16T02:00:00Z' },
            { status: 'open', category: 'mascotas', type: 'incidencia', created_at: '2026-10-10T02:00:00Z', updated_at: '2026-10-10T02:00:00Z' },
        ],
        bookings: [
            { date: '2026-10-17', status: 'confirmed' },
            { date: '2026-10-18', status: 'cancelled' },
            { date: '2026-10-21', status: 'confirmed' },
        ],
        announcements: [
            { title: 'Corte de agua programado', created_at: '2026-10-14T13:00:00Z' },
            { title: 'Aviso a la unidad 504 por ruidos', created_at: '2026-10-15T13:00:00Z' },
            { title: 'Aviso antiguo', created_at: '2026-09-01T13:00:00Z' },
        ],
        polls: [
            { title: 'Pintura de la fachada', status: 'active', end_date: '2026-10-23T23:59:00Z' },
            { title: 'Horario de la piscina', status: 'active', end_date: '2026-11-15T23:59:00Z' },
        ],
        knownNames: normalizeKnownNames(['Juana Pérez Soto', 'Pedro', 'Luis Rojas']),
        ...overrides,
    };
}

describe('committeeDigestWindow', () => {
    it('ancla la edición al lunes chileno, así el cron y el botón apuntan a la misma fila', () => {
        expect(window).toEqual({ weekStart: '2026-10-19', periodStart: '2026-10-12', periodEnd: '2026-10-18', today: '2026-10-19', upcomingEnd: '2026-10-25' });
        expect(committeeDigestWindow(new Date('2026-10-21T20:00:00Z')).weekStart).toBe('2026-10-19');
        // Domingo 25 a las 23:30 en Chile ya es lunes en UTC: sigue siendo la semana del 19.
        expect(committeeDigestWindow(new Date('2026-10-26T02:30:00Z')).weekStart).toBe('2026-10-19');
    });

    it('el cron solo genera el lunes a las 8:00 de Chile, en horario de verano y de invierno', () => {
        expect(isCommitteeDigestCronHour(new Date('2026-10-19T11:00:00Z'))).toBe(true); // UTC-3
        expect(isCommitteeDigestCronHour(new Date('2026-10-19T12:00:00Z'))).toBe(false);
        expect(isCommitteeDigestCronHour(new Date('2026-06-15T12:00:00Z'))).toBe(true); // UTC-4
        expect(isCommitteeDigestCronHour(new Date('2026-06-15T11:00:00Z'))).toBe(false);
        expect(isCommitteeDigestCronHour(new Date('2026-10-20T11:00:00Z'))).toBe(false); // martes
    });

    it('rotula el periodo en español', () => {
        expect(periodLabel('2026-10-12', '2026-10-18')).toBe('12 al 18 de octubre');
        expect(periodLabel('2026-09-28', '2026-10-04')).toBe('28 de septiembre al 4 de octubre');
    });
});

describe('buildCommitteeDigestMetrics', () => {
    const metrics = buildCommitteeDigestMetrics(raw(), window);

    it('mide la recaudación como % de unidades al día, sin identificar unidades', () => {
        expect(metrics.collection).toEqual({
            totalUnits: 20, unitsUpToDate: 18, upToDatePercent: 90,
            activeAgreements: 2, newAgreements: 2, agreementsPendingCommittee: 1,
        });
        expect(JSON.stringify(metrics)).not.toMatch(/"u1"|"u2"|ajena/);
    });

    it('cuenta mantención: abiertas, atrasadas, cerradas, preventivas que vienen, riesgo y cotizaciones', () => {
        expect(metrics.maintenance).toEqual({
            openTasks: 3, overdueTasks: 2, completedTasks: 1, upcomingPreventive: 1,
            highRiskAssets: ['Ascensor torre A'], pendingQuotes: 1, quotesAwaitingDecision: 1,
        });
    });

    it('cuenta solicitudes, casos y temas que se repiten', () => {
        expect(metrics.requests).toEqual({
            openRequests: 1, newRequests: 1, resolvedRequests: 1, openCases: 2, resolvedCases: 1,
            recurringThemes: [{ theme: 'ruidos molestos', count: 2 }],
        });
    });

    it('resume reservas, avisos y votaciones, y descarta títulos que nombran unidades', () => {
        expect(metrics.community.bookings).toBe(1);
        expect(metrics.community.upcomingBookings).toBe(1);
        expect(metrics.community.announcements).toBe(2);
        expect(metrics.community.announcementTitles).toEqual(['Corte de agua programado']);
        expect(metrics.community.activePolls.map(poll => poll.title)).toEqual(['Pintura de la fachada', 'Horario de la piscina']);
        expect(metrics.community.pollsClosingSoon).toBe(1);
    });

    it('no guarda montos en las métricas', () => {
        expect(JSON.stringify(metrics)).not.toMatch(/amount|monto|\$/i);
    });

    it('con una comunidad sin unidades no inventa un porcentaje', () => {
        expect(buildCommitteeDigestMetrics(raw({ units: [], debts: [] }), window).collection.upToDatePercent).toBeNull();
    });
});

describe('reglas de privacidad', () => {
    const names = normalizeKnownNames(['Juana Pérez Soto', 'Luis Rojas']);

    it.each([
        ['La unidad 504 sigue pendiente', 'unit'],
        ['El depto 1203 no ha pagado', 'unit'],
        ['Se recaudaron $1.250.000', 'amount'],
        ['Faltan 450.000 pesos', 'amount'],
        ['La Sra. González debe gastos', 'person'],
        ['Hablamos con Luis Rojas', 'person'],
        ['Bajó la morosidad', 'debtor_language'],
        ['Hay 3 deudores', 'debtor_language'],
        ['Se aplicarán multas', 'threat'],
        ['Iniciaremos cobranza judicial', 'threat'],
        ['Escribir a vecino@correo.cl', 'contact'],
    ])('rechaza "%s" (%s)', (text, issue) => {
        const result = checkDigestPrivacy(text, names);
        expect(result.ok).toBe(false);
        expect(result.issues).toContain(issue);
    });

    it('acepta datos agregados y nombres de activos', () => {
        expect(checkDigestPrivacy('90% de las unidades está al día. 2 convenios vigentes. Riesgo alto: Ascensor torre A.', names).ok).toBe(true);
    });

    it('solo vigila nombres compuestos, no nombres de pila sueltos', () => {
        expect(normalizeKnownNames(['Pedro', 'Ana María', ' '])).toEqual(['ana maria']);
    });

    it('limpia títulos públicos', () => {
        expect(scrubPublicTitle('Asamblea extraordinaria')).toBe('Asamblea extraordinaria');
        expect(scrubPublicTitle('Multa al depto 302')).toBeNull();
    });

    it('el texto determinista cumple siempre las reglas, incluso con datos difíciles', () => {
        const metrics = buildCommitteeDigestMetrics(raw({
            units: [{ id: 'u1' }, { id: 'u2' }],
            debts: [{ unit_id: 'u1', due_date: '2026-10-01', status: 'overdue' }],
            polls: [{ title: 'Votación sobre la deuda del depto 12', status: 'active', end_date: null }],
            announcements: [{ title: 'Felicitamos a Juana Pérez Soto', created_at: '2026-10-14T13:00:00Z' }],
        }), window);
        const text = composeFallbackDigest(metrics);
        expect(checkDigestPrivacy(text, normalizeKnownNames(['Juana Pérez Soto'])).ok).toBe(true);
        expect(text).not.toContain('Juana');
    });
});

describe('redacción y fallback', () => {
    const data = raw();
    const metrics = buildCommitteeDigestMetrics(data, window);

    it('el fallback es breve, escaneable y termina con 2 o 3 decisiones', () => {
        const text = composeFallbackDigest(metrics);
        for (const section of ['**Recaudación**', '**Mantención**', '**Solicitudes y casos**', '**Vida en comunidad**', '**La próxima semana**']) {
            expect(text).toContain(section);
        }
        expect(text).toContain('90% de las unidades está al día');
        const decisions = text.slice(text.indexOf(DECISIONS_HEADING)).split('\n').filter(line => /^\d+\. /.test(line));
        expect(decisions.length).toBeGreaterThanOrEqual(2);
        expect(decisions.length).toBeLessThanOrEqual(3);
        expect(text.trim().endsWith(decisions[decisions.length - 1])).toBe(true);
        expect(text.length).toBeLessThan(2000);
    });

    it('siempre propone entre 2 y 3 decisiones, aunque la semana esté tranquila', () => {
        const quiet = buildCommitteeDigestMetrics(raw({ debts: [], risks: [], quotes: [], cases: [], polls: [], agreements: [], tasks: [] }), window);
        const decisions = suggestCommitteeDecisions(quiet);
        expect(decisions.length).toBe(2);
        expect(suggestCommitteeDecisions(metrics).length).toBe(3);
    });

    it('usa el texto de la IA cuando cumple formato y privacidad', async () => {
        const aiText = `## Resumen de la semana · 12 al 18 de octubre\n**Recaudación**\n- 90% de las unidades está al día.\n**Mantención**\n- Ascensor torre A con riesgo alto.\n\n**${DECISIONS_HEADING}**\n1. Priorizar el ascensor.\n2. Revisar el convenio pendiente.`;
        const result = await draftCommitteeDigest(metrics, data.knownNames, async () => aiText);
        expect(result.source).toBe('ai');
        expect(result.content).toBe(aiText);
    });

    it('cae al texto determinista si la IA falla', async () => {
        const result = await draftCommitteeDigest(metrics, data.knownNames, async () => { throw new Error('timeout'); });
        expect(result.source).toBe('fallback');
        expect(result.content).toBe(composeFallbackDigest(metrics));
    });

    it('cae al texto determinista si la IA nombra unidades, personas o montos', async () => {
        for (const leak of ['- La unidad 504 debe.', '- Juana Pérez Soto no ha pagado.', '- Se juntaron $2.000.000.', '- Bajó la morosidad.']) {
            const aiText = `## Resumen de la semana\n**Recaudación**\n${leak}\n- 90% de las unidades al día y varias cosas más para alcanzar el largo mínimo.\n**${DECISIONS_HEADING}**\n1. Uno.\n2. Dos.`;
            const result = await draftCommitteeDigest(metrics, data.knownNames, async () => aiText);
            expect(result.source).toBe('fallback');
            expect(result.fallbackReason).toBe('ai_output_rejected');
        }
    });

    it('cae al texto determinista si la IA no trae decisiones o trae demasiadas', () => {
        const base = '## Resumen de la semana\n**Recaudación**\n- 90% de las unidades está al día, con dos convenios vigentes y uno nuevo.\n';
        expect(acceptAiDigest(base, [])).toBeNull();
        expect(acceptAiDigest(`${base}**${DECISIONS_HEADING}**\n1. a\n2. b\n3. c\n4. d`, [])).toBeNull();
    });

    it('sin proveedor configurado usa el texto determinista', async () => {
        const result = await draftCommitteeDigest(metrics, data.knownNames, null);
        expect(result).toMatchObject({ source: 'fallback', fallbackReason: 'ai_not_configured' });
    });
});

describe('Agent Center', () => {
    it('el resumen entra como un playbook más, de administración', () => {
        const playbook = AGENT_PLAYBOOKS.find(item => item.key === 'committee_weekly_digest');
        expect(playbook).toMatchObject({ agentKey: 'community', requiresAdmin: true });
    });
});
