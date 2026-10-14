import { describe, expect, it } from 'vitest';
import { ASSEMBLY_MATTERS, findMatter } from '@/lib/assemblies/catalog';
import {
    agreementMet,
    checkAgenda,
    checkCitationWindow,
    checkOwnerRequest,
    checkRepresentation,
    computeRights,
    constitutionMet,
    constitutionThreshold,
    evaluateAgendaItem,
    expenseRequiresExtraordinarySession,
    minutesDeadline,
    occupantMayVote,
    ordinarySessionOverdue,
    requiredSessionType,
    sessionRequiresNotary,
    tallyVotes,
    voteCounts,
} from '@/lib/assemblies/rules';
import { acceptableAiProse, citationBody, composeMinutes } from '@/lib/assemblies/compose';
import type { VoteTally } from '@/lib/assemblies/types';

const tally = (yes: number, present: number, total = 1000, no = 0, abstain = 0): VoteTally => ({ yes, no, abstain, present, total });

describe('ventana de citación (Ley 21.442, art. 16: 5 a 15 días)', () => {
    it('acepta exactamente 5 y exactamente 15 días', () => {
        expect(checkCitationWindow('2026-11-01', '2026-11-06').valid).toBe(true);
        expect(checkCitationWindow('2026-11-01', '2026-11-16').valid).toBe(true);
    });
    it('rechaza 4 y 16 días, y el mismo día', () => {
        expect(checkCitationWindow('2026-11-02', '2026-11-06').valid).toBe(false);
        expect(checkCitationWindow('2026-10-31', '2026-11-16').valid).toBe(false);
        expect(checkCitationWindow('2026-11-06', '2026-11-06').valid).toBe(false);
    });
    it('indica el primer y último día de envío', () => {
        const check = checkCitationWindow('2026-11-10', '2026-11-20');
        expect(check.earliestSendOn).toBe('2026-11-05');
        expect(check.latestSendOn).toBe('2026-11-15');
        expect(check.daysInAdvance).toBe(10);
    });
    it('cuenta bien a través de un cambio de mes y de año', () => {
        expect(checkCitationWindow('2026-12-27', '2027-01-01').daysInAdvance).toBe(5);
        expect(checkCitationWindow('2027-02-24', '2027-03-01').valid).toBe(true);
    });
});

describe('petición del 10% (art. 14) y plazo de 10 días corridos (DS 7, art. 15)', () => {
    it('con exactamente 10% obliga a citar dentro de 10 días', () => {
        const check = checkOwnerRequest('2026-11-01', 0.10, '2026-11-03');
        expect(check.reachesThreshold).toBe(true);
        expect(check.citationDueOn).toBe('2026-11-11');
        expect(check.daysLeft).toBe(8);
        expect(check.overdue).toBe(false);
    });
    it('con menos del 10% no obliga', () => {
        const check = checkOwnerRequest('2026-11-01', 0.0999, '2026-11-03');
        expect(check.reachesThreshold).toBe(false);
        expect(check.citationDueOn).toBeNull();
    });
    it('citar el día 10 está a tiempo; el 11 está atrasado', () => {
        expect(checkOwnerRequest('2026-11-01', 0.2, '2026-11-11', '2026-11-11').overdue).toBe(false);
        expect(checkOwnerRequest('2026-11-01', 0.2, '2026-11-12', '2026-11-12').overdue).toBe(true);
    });
});

describe('quórum de constitución (art. 15)', () => {
    it('ordinaria: al menos 33% de los derechos', () => {
        expect(constitutionMet('ordinary', 330, 1000)).toBe(true);
        expect(constitutionMet('ordinary', 329.9999, 1000)).toBe(false);
        expect(constitutionThreshold('ordinary', 1000)).toBe(330);
    });
    it('extraordinaria de mayoría absoluta: más de la mitad', () => {
        expect(constitutionMet('absolute', 500, 1000)).toBe(false);
        expect(constitutionMet('absolute', 500.0001, 1000)).toBe(true);
    });
    it('reforzada: al menos 66%', () => {
        expect(constitutionMet('reinforced', 660, 1000)).toBe(true);
        expect(constitutionMet('reinforced', 659.9999, 1000)).toBe(false);
    });
    it('con 1 unidad = 1 voto: 1 de 3 unidades es 33,3% y constituye una ordinaria', () => {
        expect(constitutionMet('ordinary', 1, 3)).toBe(true);
        expect(constitutionMet('absolute', 1, 2)).toBe(false);
        expect(constitutionMet('reinforced', 2, 3)).toBe(true); // 66,67%
    });
    it('sin derechos totales nunca constituye', () => {
        expect(constitutionMet('ordinary', 0, 0)).toBe(false);
    });
});

describe('quórum de acuerdo (art. 15)', () => {
    it('ordinaria: mayoría absoluta de los asistentes (sobre derechos presentes)', () => {
        expect(agreementMet('ordinary', tally(200.0001, 400))).toBe(true);
        expect(agreementMet('ordinary', tally(200, 400))).toBe(false);
    });
    it('mayoría absoluta: más de la mitad de todos los derechos, no de los presentes', () => {
        expect(agreementMet('absolute', tally(480, 600))).toBe(false);
        expect(agreementMet('absolute', tally(500.0001, 600))).toBe(true);
    });
    it('reforzada: 66% de todos los derechos', () => {
        expect(agreementMet('reinforced', tally(660, 900))).toBe(true);
        expect(agreementMet('reinforced', tally(659, 900))).toBe(false);
    });
    it('las abstenciones cuentan como presentes pero no a favor', () => {
        expect(agreementMet('ordinary', tally(250, 600, 1000, 100, 250))).toBe(false);
    });
});

describe('resultado de un punto', () => {
    it('ordinaria aprobada con regla y porcentajes', () => {
        const result = evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally: tally(300, 400) });
        expect(result.outcome).toBe('approved');
        expect(result.percentages).toEqual({ presentOfTotal: 40, yesOfBase: 75, base: 'present' });
        expect(result.rule).toMatch(/33%/);
    });
    it('sin quórum de constitución no hay acuerdo aunque todos voten a favor', () => {
        const result = evaluateAgendaItem({ sessionType: 'ordinary', matterClass: 'ordinary', tally: tally(320, 320) });
        expect(result.outcome).toBe('no_quorum');
    });
    it('una materia ordinaria en sesión extraordinaria exige constituir con mayoría absoluta', () => {
        expect(evaluateAgendaItem({ sessionType: 'extraordinary', matterClass: 'ordinary', tally: tally(400, 450) }).outcome).toBe('no_quorum');
        expect(evaluateAgendaItem({ sessionType: 'extraordinary', matterClass: 'ordinary', tally: tally(400, 510) }).outcome).toBe('approved');
    });
    it('mayoría absoluta rechazada cuando los sí son mayoría de presentes pero no del total', () => {
        const result = evaluateAgendaItem({ sessionType: 'extraordinary', matterClass: 'absolute', tally: tally(450, 600, 1000, 150) });
        expect(result.outcome).toBe('rejected');
        expect(result.percentages.base).toBe('total');
    });
    it('reforzada en el borde exacto del 66%', () => {
        expect(evaluateAgendaItem({ sessionType: 'reinforced', matterClass: 'reinforced', tally: tally(660, 660) }).outcome).toBe('approved');
        expect(evaluateAgendaItem({ sessionType: 'reinforced', matterClass: 'reinforced', tally: tally(659, 700) }).outcome).toBe('rejected');
    });
});

describe('ponderación de votos (art. 15: un voto proporcional a los derechos)', () => {
    it('suma por derechos y descarta los votos que no cuentan', () => {
        const result = tallyVotes([
            { choice: 'yes', weight: 120.5, counts: true },
            { choice: 'yes', weight: 80.25, counts: true },
            { choice: 'no', weight: 300, counts: true },
            { choice: 'abstain', weight: 10, counts: true },
            { choice: 'yes', weight: 400, counts: false },
        ], 911, 1000);
        expect(result).toEqual({ yes: 200.75, no: 300, abstain: 10, present: 911, total: 1000 });
    });
    it('no acumula error de punto flotante con alícuotas de 4 decimales', () => {
        const votes = Array.from({ length: 3 }, () => ({ choice: 'yes' as const, weight: 333.3333, counts: true }));
        expect(tallyVotes(votes, 999.9999, 999.9999).yes).toBe(999.9999);
    });
    it('alícuotas completas: método share con su total', () => {
        const rights = computeRights([{ id: 'a', label: '101', sharePermille: 400 }, { id: 'b', label: '102', sharePermille: 600 }]);
        expect(rights.method).toBe('share');
        expect(rights.total).toBe(1000);
        expect(rights.warnings).toEqual([]);
    });
    it('una unidad sin alícuota hace caer a 1 unidad = 1 voto con advertencia', () => {
        const rights = computeRights([{ id: 'a', label: '101', sharePermille: 400 }, { id: 'b', label: '102', sharePermille: null }]);
        expect(rights.method).toBe('equal');
        expect(rights.units.map(unit => unit.weight)).toEqual([1, 1]);
        expect(rights.total).toBe(2);
        expect(rights.warnings[0]).toMatch(/1 de 2 unidades/);
    });
    it('ninguna alícuota: advertencia general', () => {
        const rights = computeRights([{ id: 'a', label: '101', sharePermille: null }]);
        expect(rights.warnings[0]).toMatch(/Ninguna unidad/);
    });
    it('alícuotas que no suman 1000‰: proporcional con advertencia', () => {
        const rights = computeRights([{ id: 'a', label: '101', sharePermille: 300 }, { id: 'b', label: '102', sharePermille: 300 }]);
        expect(rights.method).toBe('share');
        expect(rights.warnings[0]).toMatch(/600/);
    });
});

describe('validez de cada voto (DS 7, art. 16 N°3)', () => {
    it('en línea necesita verificación de imagen y voz al votar', () => {
        expect(voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'remote', voteVerified: false })).toBe(false);
        expect(voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'remote', voteVerified: true })).toBe(true);
    });
    it('en sala basta la acreditación', () => {
        expect(voteCounts({ attendanceVerified: true, attendancePresent: true, mode: 'in_person', voteVerified: false })).toBe(true);
    });
    it('sin acreditación o retirado, no cuenta', () => {
        expect(voteCounts({ attendanceVerified: false, attendancePresent: true, mode: 'in_person', voteVerified: true })).toBe(false);
        expect(voteCounts({ attendanceVerified: true, attendancePresent: false, mode: 'in_person', voteVerified: true })).toBe(false);
    });
});

describe('catálogo de materias y tipo de sesión', () => {
    it('tiene las 6 + 8 + 11 materias del cuadro del art. 15', () => {
        expect(ASSEMBLY_MATTERS.filter(m => m.quorumClass === 'ordinary')).toHaveLength(6);
        expect(ASSEMBLY_MATTERS.filter(m => m.quorumClass === 'absolute')).toHaveLength(8);
        expect(ASSEMBLY_MATTERS.filter(m => m.quorumClass === 'reinforced')).toHaveLength(11);
        expect(new Set(ASSEMBLY_MATTERS.map(m => m.code)).size).toBe(ASSEMBLY_MATTERS.length);
    });
    it('notario: todas las reforzadas y la modificación del reglamento de la letra 2) a)', () => {
        expect(findMatter('abs_reglamento')?.requiresNotary).toBe(true);
        expect(findMatter('abs_gastos_extraordinarios')?.requiresNotary).toBe(false);
        expect(ASSEMBLY_MATTERS.filter(m => m.quorumClass === 'reinforced').every(m => m.requiresNotary)).toBe(true);
        expect(sessionRequiresNotary('extraordinary', ['abs_reglamento'])).toBe(true);
        expect(sessionRequiresNotary('extraordinary', ['abs_remocion_comite'])).toBe(false);
        expect(sessionRequiresNotary('reinforced', ['abs_remocion_comite'])).toBe(true);
    });
    it('el tipo mínimo de sesión sale de la materia más exigente', () => {
        expect(requiredSessionType(['ord_otro'])).toBe('ordinary');
        expect(requiredSessionType(['ord_otro', 'abs_gastos_extraordinarios'])).toBe('extraordinary');
        expect(requiredSessionType(['abs_remocion_comite', 'ref_enajenacion'])).toBe('reinforced');
    });
    it('una materia de extraordinaria en sesión ordinaria es un error', () => {
        const alerts = checkAgenda({ sessionType: 'ordinary', matterCodes: ['abs_reglamento'] });
        expect(alerts.some(alert => alert.level === 'error' && /extraordinaria/.test(alert.message))).toBe(true);
    });
    it('una reforzada en extraordinaria de mayoría absoluta es un error', () => {
        expect(checkAgenda({ sessionType: 'extraordinary', matterCodes: ['ref_reconstruccion'] }).some(alert => alert.level === 'error')).toBe(true);
        expect(checkAgenda({ sessionType: 'reinforced', matterCodes: ['ref_reconstruccion'] }).some(alert => alert.level === 'error')).toBe(false);
    });
    it('advierte notario y tabla cerrada en extraordinarias', () => {
        const alerts = checkAgenda({ sessionType: 'reinforced', matterCodes: ['ref_reconstruccion'] });
        expect(alerts.some(alert => /notario/.test(alert.message))).toBe(true);
        expect(alerts.some(alert => /solo se tratan las materias/.test(alert.message))).toBe(true);
    });
    it('tabla vacía o materia desconocida', () => {
        expect(checkAgenda({ sessionType: 'ordinary', matterCodes: [] })[0].level).toBe('error');
        expect(checkAgenda({ sessionType: 'ordinary', matterCodes: ['xyz'] })[0].level).toBe('error');
    });
});

describe('gastos extraordinarios sobre seis cuotas en doce meses (art. 14 N°7)', () => {
    it('exactamente seis cuotas no obliga; más de seis sí', () => {
        expect(expenseRequiresExtraordinarySession(6_000_000, 1_000_000)).toBe(false);
        expect(expenseRequiresExtraordinarySession(6_000_001, 1_000_000)).toBe(true);
    });
    it('suma lo ya aprobado en los doce meses', () => {
        expect(expenseRequiresExtraordinarySession(2_000_000, 1_000_000, 4_500_000)).toBe(true);
    });
    it('sin gasto común ordinario conocido no decide', () => {
        expect(expenseRequiresExtraordinarySession(9_000_000, 0)).toBe(false);
    });
    it('si lo supera y se propone en ordinaria, la tabla da error', () => {
        const alerts = checkAgenda({ sessionType: 'ordinary', matterCodes: ['ord_otro'], extraordinaryExpense: { amount: 7_000_000, monthlyOrdinaryTotal: 1_000_000 } });
        expect(alerts.some(alert => alert.level === 'error' && /seis|6 cuotas/.test(alert.message))).toBe(true);
        const ok = checkAgenda({ sessionType: 'extraordinary', matterCodes: ['abs_gastos_extraordinarios'], extraordinaryExpense: { amount: 7_000_000, monthlyOrdinaryTotal: 1_000_000 } });
        expect(ok.some(alert => alert.level === 'error')).toBe(false);
    });
});

describe('representación (art. 15; DS 7, arts. 11, 12 y 22)', () => {
    const base = { representativeIsAdmin: false, hasAcceptedProxy: false, occupantOptedOut: false, ownerOrOtherProxyPresent: false };
    it('el administrador no puede representar, pero sí asistir como titular', () => {
        expect(checkRepresentation({ ...base, capacity: 'proxy', representativeIsAdmin: true, hasAcceptedProxy: true }).allowed).toBe(false);
        expect(checkRepresentation({ ...base, capacity: 'occupant', representativeIsAdmin: true }).allowed).toBe(false);
        expect(checkRepresentation({ ...base, capacity: 'owner', representativeIsAdmin: true }).allowed).toBe(true);
    });
    it('con poder solo si está aceptado', () => {
        expect(checkRepresentation({ ...base, capacity: 'proxy' }).allowed).toBe(false);
        expect(checkRepresentation({ ...base, capacity: 'proxy', hasAcceptedProxy: true }).allowed).toBe(true);
    });
    it('el ocupante representa por ley salvo negativa o si ya asiste el titular', () => {
        expect(checkRepresentation({ ...base, capacity: 'occupant' }).allowed).toBe(true);
        expect(checkRepresentation({ ...base, capacity: 'occupant', occupantOptedOut: true }).allowed).toBe(false);
        expect(checkRepresentation({ ...base, capacity: 'occupant', ownerOrOtherProxyPresent: true }).allowed).toBe(false);
    });
    it('el ocupante vota reforzadas solo con autorización expresa', () => {
        expect(occupantMayVote('reinforced', false)).toBe(false);
        expect(occupantMayVote('reinforced', true)).toBe(true);
        expect(occupantMayVote('absolute', false)).toBe(true);
    });
});

describe('acta y periodicidad', () => {
    it('firma dentro de 30 días (art. 15)', () => {
        expect(minutesDeadline('2026-11-10', '2026-11-10')).toEqual({ dueOn: '2026-12-10', daysLeft: 30, overdue: false });
        expect(minutesDeadline('2026-11-10', '2026-12-10').overdue).toBe(false);
        expect(minutesDeadline('2026-11-10', '2026-12-11').overdue).toBe(true);
        expect(minutesDeadline('2026-11-10', '2026-12-11', true).overdue).toBe(false);
    });
    it('ordinaria al menos una vez al año (art. 14)', () => {
        expect(ordinarySessionOverdue('2025-11-10', '2026-11-10')).toBe(false);
        expect(ordinarySessionOverdue('2025-11-10', '2026-11-11')).toBe(true);
        expect(ordinarySessionOverdue(null, '2026-11-11')).toBe(true);
    });
});

describe('textos', () => {
    it('la citación lleva tabla, quórums, modalidad telemática y poderes', () => {
        const body = citationBody({
            title: 'Anual', sessionType: 'ordinary', modality: 'hybrid', scheduledAt: '2026-11-20T22:00:00Z', location: 'Sala', videoUrl: 'https://meet.example/abc', notaryRequired: false,
            items: [{ position: 1, title: 'Balance', description: '', matterCode: 'ord_rendicion_cuentas', quorumClass: 'ordinary' }],
        });
        expect(body).toContain('### Tabla');
        expect(body).toContain('33%');
        expect(body).toContain('imagen y voz');
        expect(body).toContain('https://meet.example/abc');
        expect(body).toMatch(/administrador no puede representar/);
    });
    it('el acta lista unidades acreditadas sin nombres y deja el plazo de firma', () => {
        const minutes = composeMinutes({
            title: 'Anual', sessionType: 'ordinary', modality: 'remote', scheduledAt: '2026-11-20T22:00:00Z', startedAt: null, closedAt: null, location: '',
            rights: { method: 'share', units: [{ unitId: 'a', label: '101', weight: 600 }, { unitId: 'b', label: '102', weight: 400 }], total: 1000, warnings: [] },
            attendance: [{ id: 'x', unitId: 'a', unitLabel: '101', weight: 600, attendeeProfileId: 'p', attendeeName: 'Persona Ejemplo', capacity: 'owner', proxyId: null, mode: 'remote', status: 'present', identityVerifiedAt: '2026-11-20T22:05:00Z', checkedInAt: null }],
            items: [], notaryRequired: false, notaryName: '', dueOn: '2026-12-20',
        }, 'Se trató la tabla.');
        expect(minutes).toContain('| 101 | Titular | En línea');
        expect(minutes).not.toContain('Persona Ejemplo');
        expect(minutes).toContain('2026-12-20');
        expect(minutes).toContain('domicilio del condominio');
    });
    it('rechaza prosa de IA con montos o lenguaje de deudor', () => {
        expect(acceptableAiProse('Les esperamos para conversar sobre la comunidad y decidir juntos.', 500)).toBe(true);
        expect(acceptableAiProse('Se aprobó un gasto de $ 2.000.000 para la comunidad entera.', 500)).toBe(false);
        expect(acceptableAiProse('Los morosos no podrán participar de la sesión de hoy.', 500)).toBe(false);
    });
});
