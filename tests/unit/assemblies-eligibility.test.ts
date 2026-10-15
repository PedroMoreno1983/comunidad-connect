/**
 * Copropietarios hábiles (Ley 21.442 arts. 2 N°13, 6 y 15; DS 7 arts. 9 y 14):
 * la regla de habilidad, los quórums con hábiles y la privacidad (el acta, el
 * panel compartido y el aviso no nombran unidades, no muestran montos ni usan
 * lenguaje de deudor).
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { agreementInForceAt, computeEligibility, debtOverdueAt, eligiblePresentWeight, unitEligibility } from '@/lib/assemblies/eligibility';
import {
    CONDUCTOR_BADGE,
    MY_STATUS_COPY,
    VOTE_NOT_RECORDED,
    agreementRequestAdminCopy,
    checkEligibilityPrivacy,
    eligibilityNoticeCopy,
} from '@/lib/assemblies/eligibilityCopy';
import { inNoticeWindow } from '@/lib/assemblies/eligibilityService';
import { agreementDueDates } from '@/lib/finance/operationalFlows';
import { composeMinutes, eligibilityMinutesSection, type MinutesInput } from '@/lib/assemblies/compose';
import { evaluateAgendaItem, tallyVotes, voteCounts } from '@/lib/assemblies/rules';
import { QuorumMeter } from '@/components/assemblies/shared';
import type { EligibilityAgreement, EligibilityCertificate, EligibilityDebt, LiveQuorum } from '@/lib/assemblies/types';

const CUTOFF = '2026-11-20';

const debt = (unitId: string, dueDate: string | null, status = 'pending'): EligibilityDebt => ({ unitId, dueDate, status });
const agreement = (unitId: string, createdAt: string, installments: [string, string][], status = 'active'): EligibilityAgreement => ({
    unitId, status, createdAt, installments: installments.map(([dueDate, state], index) => ({ sequence: index + 1, dueDate, status: state })),
});

describe('regla de habilidad', () => {
    it('al día: sin cobros vencidos a la fecha de corte', () => {
        expect(unitEligibility([], [], CUTOFF)).toEqual({ eligible: true, basis: 'up_to_date' });
        // Un cobro que aún no vence no inhabilita.
        expect(unitEligibility([debt('u1', '2026-12-05')], [], CUTOFF).eligible).toBe(true);
    });

    it('vencido: un cobro de gasto común o de unit_charges impago y vencido', () => {
        expect(unitEligibility([debt('u1', '2026-11-05')], [], CUTOFF)).toEqual({ eligible: false, basis: 'overdue' });
        expect(unitEligibility([debt('u1', '2026-10-05', 'overdue')], [], CUTOFF).eligible).toBe(false);
    });

    it('borde de la fecha de corte: vence el mismo día, todavía está al día; el día anterior, ya no', () => {
        expect(debtOverdueAt({ dueDate: CUTOFF, status: 'pending' }, CUTOFF)).toBe(false);
        expect(debtOverdueAt({ dueDate: '2026-11-19', status: 'pending' }, CUTOFF)).toBe(true);
        expect(unitEligibility([debt('u1', CUTOFF)], [], CUTOFF).eligible).toBe(true);
        expect(unitEligibility([debt('u1', '2026-11-19')], [], CUTOFF).eligible).toBe(false);
        // Sin fecha de vencimiento solo cuenta si la cobranza ya lo marcó vencido.
        expect(debtOverdueAt({ dueDate: null, status: 'pending' }, CUTOFF)).toBe(false);
        expect(debtOverdueAt({ dueDate: null, status: 'overdue' }, CUTOFF)).toBe(true);
    });

    it('con convenio vigente (primera cuota pagada y al día) queda habilitada aunque tenga saldo antiguo', () => {
        const signed = agreement('u1', '2026-10-01T15:00:00Z', [['2026-10-01', 'paid'], ['2026-11-05', 'paid'], ['2026-12-05', 'pending']]);
        expect(agreementInForceAt(signed, CUTOFF)).toBe(true);
        expect(unitEligibility([debt('u1', '2026-08-05'), debt('u1', '2026-09-05')], [signed], CUTOFF)).toEqual({ eligible: true, basis: 'agreement' });
    });

    it('convenio sin la primera cuota pagada todavía no habilita (Ley 21.442 art. 6; DS 7 art. 9)', () => {
        const unpaidFirst = agreement('u1', '2026-11-10', [['2026-12-05', 'pending'], ['2027-01-05', 'pending']]);
        expect(agreementInForceAt(unpaidFirst, CUTOFF)).toBe(false);
        expect(unitEligibility([debt('u1', '2026-09-05')], [unpaidFirst], CUTOFF)).toEqual({ eligible: false, basis: 'agreement_lapsed' });
    });

    it('convenio firmado y con la primera cuota pagada en el acto: hábil ese mismo día', () => {
        // Primera cuota con vencimiento el día de la firma (agreementDueDates).
        const dates = agreementDueDates(CUTOFF, 3);
        expect(dates[0]).toBe(CUTOFF);
        const signedAndPaid: EligibilityAgreement = {
            unitId: 'u1', status: 'active', createdAt: `${CUTOFF}T13:00:00Z`,
            installments: dates.map((dueDate, index) => ({ sequence: index + 1, dueDate, status: index === 0 ? 'paid' : 'pending', paidAt: index === 0 ? CUTOFF : null })),
        };
        expect(agreementInForceAt(signedAndPaid, CUTOFF)).toBe(true);
        expect(unitEligibility([debt('u1', '2026-08-05'), debt('u1', '2026-10-05')], [signedAndPaid], CUTOFF)).toEqual({ eligible: true, basis: 'agreement' });
    });

    it('convenio firmado hoy sin pagar la primera cuota: todavía no habilita, aunque esa cuota aún no esté vencida', () => {
        const dates = agreementDueDates(CUTOFF, 3);
        const signedUnpaid: EligibilityAgreement = {
            unitId: 'u1', status: 'active', createdAt: `${CUTOFF}T13:00:00Z`,
            installments: dates.map((dueDate, index) => ({ sequence: index + 1, dueDate, status: 'pending', paidAt: null })),
        };
        expect(agreementInForceAt(signedUnpaid, CUTOFF)).toBe(false);
        expect(unitEligibility([debt('u1', '2026-08-05')], [signedUnpaid], CUTOFF)).toEqual({ eligible: false, basis: 'agreement_lapsed' });
        // Pagada después de la fecha de corte: no cuenta para ese certificado.
        const paidLater: EligibilityAgreement = { ...signedUnpaid, installments: signedUnpaid.installments.map((item, index) => index === 0 ? { ...item, status: 'paid', paidAt: '2026-11-21' } : item) };
        expect(agreementInForceAt(paidLater, CUTOFF)).toBe(false);
        expect(agreementInForceAt(paidLater, '2026-11-21')).toBe(true);
    });

    it('la fecha del convenio se lee en el calendario de Chile (un instante de la noche no corre al día siguiente)', () => {
        // 2026-10-01 22:30 en Chile = 2026-10-02 01:30 UTC.
        const late = agreement('u1', '2026-10-02T01:30:00Z', [['2026-10-01', 'paid'], ['2026-11-05', 'paid'], ['2026-12-05', 'pending']]);
        expect(unitEligibility([debt('u1', '2026-10-01')], [late], CUTOFF).eligible).toBe(true);
        expect(unitEligibility([debt('u1', '2026-10-02')], [late], CUTOFF)).toEqual({ eligible: false, basis: 'overdue' });
    });

    it('convenio caído: una cuota vencida impaga, o pendiente de comité o anulado, no habilita', () => {
        const lapsed = agreement('u1', '2026-09-01', [['2026-09-01', 'paid'], ['2026-10-05', 'pending'], ['2026-11-05', 'pending']]);
        expect(agreementInForceAt(lapsed, CUTOFF)).toBe(false);
        expect(unitEligibility([debt('u1', '2026-08-05')], [lapsed], CUTOFF).basis).toBe('agreement_lapsed');
        // Incluso sin otros cobros vencidos: la cuota del convenio es una obligación.
        expect(unitEligibility([], [lapsed], CUTOFF).eligible).toBe(false);
        const pending = agreement('u1', '2026-11-01', [['2026-11-01', 'paid']], 'pending_committee');
        expect(unitEligibility([debt('u1', '2026-08-05')], [pending], CUTOFF)).toEqual({ eligible: false, basis: 'overdue' });
        const cancelled = agreement('u1', '2026-11-01', [['2026-11-01', 'paid']], 'cancelled');
        expect(unitEligibility([debt('u1', '2026-08-05')], [cancelled], CUTOFF).eligible).toBe(false);
    });

    it('con convenio, lo que venció después de firmarlo son "otras obligaciones" y deben estar al día (DS 7, art. 9)', () => {
        const signed = agreement('u1', '2026-10-01', [['2026-10-01', 'paid'], ['2026-12-05', 'pending']]);
        expect(unitEligibility([debt('u1', '2026-09-05'), debt('u1', '2026-11-05')], [signed], CUTOFF)).toEqual({ eligible: false, basis: 'overdue' });
        expect(unitEligibility([debt('u1', '2026-09-05'), debt('u1', '2026-10-01')], [signed], CUTOFF).eligible).toBe(true);
    });

    it('quien tiene varias unidades es hábil solo si está al día en todas (DS 7, art. 14)', () => {
        const result = computeEligibility({
            units: [
                { unitId: 'a', ownerId: 'p1', weight: 300 },
                { unitId: 'b', ownerId: 'p1', weight: 200 },
                { unitId: 'c', ownerId: 'p2', weight: 400 },
                { unitId: 'd', ownerId: null, weight: 100 },
            ],
            debts: [debt('b', '2026-10-05'), debt('d', '2026-12-05')],
            agreements: [],
            cutoffDate: CUTOFF,
        });
        const byId = new Map(result.units.map(unit => [unit.unitId, unit]));
        expect(byId.get('a')).toMatchObject({ eligible: false, basis: 'other_unit' });
        expect(byId.get('b')).toMatchObject({ eligible: false, basis: 'overdue' });
        expect(byId.get('c')).toMatchObject({ eligible: true, basis: 'up_to_date' });
        expect(byId.get('d')).toMatchObject({ eligible: true });
        expect(result).toMatchObject({ totalUnits: 4, eligibleUnits: 2, totalWeight: 1000, eligibleWeight: 500, cutoffDate: CUTOFF });
    });
});

describe('quórums con hábiles', () => {
    // 1000‰ en el condominio. Presentes: 400‰ hábiles + 100‰ no hábiles.
    const present = [{ unitId: 'h1', weight: 250 }, { unitId: 'h2', weight: 150 }, { unitId: 'n1', weight: 100 }];
    const eligible = new Set(['h1', 'h2']);

    it('los derechos hábiles presentes son los que constituyen la sesión', () => {
        expect(eligiblePresentWeight(present, eligible)).toBe(400);
    });

    it('ordinaria: constituye con hábiles ≥33% del condominio; si solo llega con no hábiles, no hay quórum', () => {
        const tally = { yes: 260, no: 140, abstain: 0, present: 500, total: 1000 };
        expect(evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally, eligiblePresent: 400 }).outcome).toBe('approved');
        // 340‰ presentes, pero solo 300‰ hábiles: no alcanza el 33%.
        const thin = { yes: 300, no: 0, abstain: 0, present: 340, total: 1000 };
        expect(evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally: thin }).outcome).toBe('approved');
        expect(evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally: thin, eligiblePresent: 300 }).outcome).toBe('no_quorum');
    });

    it('ordinaria: el acuerdo es la mayoría de los derechos de TODOS los asistentes, aunque los no hábiles no voten', () => {
        // 240 a favor de 500 presentes: no es mayoría de los asistentes, aunque sí lo sería de los 400 hábiles.
        const tally = { yes: 240, no: 100, abstain: 60, present: 500, total: 1000 };
        expect(evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally, eligiblePresent: 400 }).outcome).toBe('rejected');
    });

    it('mayoría absoluta y reforzada: base = todos los derechos del condominio, no solo los hábiles', () => {
        // Hábiles 520‰ de 1000‰. Votan 510‰ a favor: >50% del condominio.
        const absolute = { yes: 510, no: 10, abstain: 0, present: 600, total: 1000 };
        expect(evaluateAgendaItem({ sessionType: 'extraordinary', matterClass: 'absolute', tally: absolute, eligiblePresent: 520 }).outcome).toBe('approved');
        // 480‰ a favor sería mayoría de los hábiles presentes, pero no del condominio.
        expect(evaluateAgendaItem({ sessionType: 'extraordinary', matterClass: 'absolute', tally: { ...absolute, yes: 480 }, eligiblePresent: 520 }).outcome).toBe('rejected');
        // Reforzada: constituye con ≥66% hábiles del condominio.
        const reinforced = { yes: 660, no: 0, abstain: 0, present: 700, total: 1000 };
        expect(evaluateAgendaItem({ sessionType: 'reinforced', matterClass: 'reinforced', tally: reinforced, eligiblePresent: 660 }).outcome).toBe('approved');
        expect(evaluateAgendaItem({ sessionType: 'reinforced', matterClass: 'reinforced', tally: reinforced, eligiblePresent: 650 }).outcome).toBe('no_quorum');
    });

    it('el voto de una unidad no habilitada no cuenta, aunque esté acreditada (también si vota un apoderado u ocupante)', () => {
        expect(voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'in_person', voteVerified: true, unitEligible: false })).toBe(false);
        expect(voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'in_person', voteVerified: false, unitEligible: true })).toBe(true);
        const tally = tallyVotes([
            { choice: 'yes', weight: 250, counts: true },
            { choice: 'yes', weight: 100, counts: voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'in_person', voteVerified: true, unitEligible: false }) },
        ], 350, 1000);
        expect(tally.yes).toBe(250);
    });

    it('el resultado guardado no expone los derechos hábiles presentes', () => {
        const result = evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally: { yes: 260, no: 140, abstain: 0, present: 500, total: 1000 }, eligiblePresent: 400 });
        expect(JSON.stringify(result)).not.toContain('400');
        expect(result.rule).toMatch(/hábiles/);
    });
});

const certificate: EligibilityCertificate = {
    id: 'c1', cutoffDate: '2026-12-01', rightsMethod: 'share', totalUnits: 3, eligibleUnits: 2,
    totalWeight: 1000, eligibleWeight: 700, eligibleShare: 70, issuedAt: '2026-12-01T22:05:00Z', issuedByName: 'Administración Central',
};

describe('privacidad', () => {
    const labels = ['101', '102', '103'];

    it('el acta solo trae totales del certificado: ninguna unidad no habilitada, sin montos ni lenguaje de deudor', () => {
        const input: MinutesInput = {
            title: 'Asamblea anual', sessionType: 'ordinary', modality: 'in_person', scheduledAt: '2026-12-01T22:00:00Z',
            startedAt: '2026-12-01T22:00:00Z', closedAt: '2026-12-01T23:30:00Z', location: 'Sala multiuso',
            rights: { method: 'share', units: [{ unitId: 'u1', label: '101', weight: 400 }, { unitId: 'u2', label: '102', weight: 300 }, { unitId: 'u3', label: '103', weight: 300 }], total: 1000, warnings: [] },
            // La 103 no está habilitada y no asistió: no debe aparecer en el acta.
            attendance: [
                { id: 'a1', unitId: 'u1', unitLabel: '101', weight: 400, attendeeProfileId: null, attendeeName: 'Persona Ejemplo', capacity: 'owner', proxyId: null, mode: 'in_person', status: 'present', identityVerifiedAt: '2026-12-01T22:01:00Z', checkedInAt: '2026-12-01T22:01:00Z' },
            ],
            items: [], notaryRequired: false, notaryName: '', dueOn: '2026-12-31', eligibility: certificate, constitutionMet: true,
        };
        const minutes = composeMinutes(input, 'La sesión se desarrolló conforme a la tabla.');
        const section = eligibilityMinutesSection(certificate, 'share').join('\n');
        expect(minutes).toContain(section);
        expect(section).toContain('2 de 3 unidades');
        expect(section).toContain('2026-12-01');
        expect(section).toContain('Administración Central');
        expect(checkEligibilityPrivacy(section, labels)).toEqual([]);
        expect(minutes).not.toContain('103');
        expect(minutes).not.toContain(CONDUCTOR_BADGE);
        expect(minutes).not.toMatch(/no habilitada/i);
        expect(checkEligibilityPrivacy(minutes)).toEqual([]);
    });

    it('el panel compartido muestra solo cuántas unidades y derechos están habilitados', () => {
        const quorum: LiveQuorum = {
            presentWeight: 500, totalWeight: 1000, presentShare: 50, presentUnits: 2, totalUnits: 3, constitutionMet: true,
            constitutionRule: 'Asistentes hábiles con al menos el 33% de los derechos del condominio (Ley 21.442, art. 15, cuadro 1).',
            pendingVerification: 0, eligibility: certificate,
        };
        const html = renderToStaticMarkup(createElement(QuorumMeter, { quorum, rightsMethod: 'share' }));
        const text = html.replace(/<[^>]+>/g, ' ');
        expect(text).toContain('Habilitadas para votar: 2 de 3 unidades');
        expect(checkEligibilityPrivacy(text, labels)).toEqual([]);
        expect(text).not.toContain(CONDUCTOR_BADGE);
        // Los datos del panel tampoco traen identificadores de unidades.
        expect(JSON.stringify(quorum)).not.toMatch(/unitId|u1|u2|u3/);
    });

    it('el aviso de 7 días es cálido, sin unidad, sin montos ni lenguaje de deudor, y ofrece las dos salidas', () => {
        const notice = eligibilityNoticeCopy({ assemblyTitle: 'Asamblea anual', sessionDate: '2026-12-01' });
        const text = `${notice.title} ${notice.body}`;
        expect(checkEligibilityPrivacy(text, labels)).toEqual([]);
        expect(text).toMatch(/estado de cuenta/);
        expect(text).toMatch(/convenio/);
        expect(text).toMatch(/asistir y opinar/);
        expect(notice.link).toBe('/votaciones/asambleas');
    });

    it('lo que ve la unidad y el aviso al votar respetan la convención', () => {
        for (const text of [MY_STATUS_COPY.eligible.title, MY_STATUS_COPY.eligible.body, MY_STATUS_COPY.notEligible.title, MY_STATUS_COPY.notEligible.body, VOTE_NOT_RECORDED.self, VOTE_NOT_RECORDED.staff, CONDUCTOR_BADGE]) {
            expect(checkEligibilityPrivacy(text, labels)).toEqual([]);
        }
        expect(MY_STATUS_COPY.notEligible.title).toBe('Para votar, ponte al día o conversa un convenio');
        expect(MY_STATUS_COPY.eligible.title).toBe('Puedes votar');
        expect(CONDUCTOR_BADGE).toBe('No habilitada para votar (asiste con voz)');
        // La solicitud de convenio solo llega a administración, que sí necesita la unidad.
        expect(checkEligibilityPrivacy(agreementRequestAdminCopy('101', 'Anual').body)).toEqual([]);
    });

    it('el detector de privacidad sí atrapa montos, lenguaje de deudor y unidades', () => {
        expect(checkEligibilityPrivacy('La unidad 103 es morosa por $45.000', labels)).toEqual(expect.arrayContaining(['lenguaje de deudor', 'montos', 'unidad 103']));
        expect(checkEligibilityPrivacy('Tiene una deuda de 120.000')).toEqual(expect.arrayContaining(['lenguaje de deudor', 'montos']));
    });
});

describe('aviso 7 días antes', () => {
    it('se envía desde 7 días antes hasta la víspera, no el mismo día ni antes de tiempo', () => {
        expect(inNoticeWindow('2026-12-01', '2026-11-24')).toBe(true);
        expect(inNoticeWindow('2026-12-01', '2026-11-30')).toBe(true);
        expect(inNoticeWindow('2026-12-01', '2026-11-23')).toBe(false);
        expect(inNoticeWindow('2026-12-01', '2026-12-01')).toBe(false);
    });
});
