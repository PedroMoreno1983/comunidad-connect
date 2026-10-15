/**
 * Copropietarios hábiles para votar en asamblea. Módulo PURO: sin base de datos
 * ni reloj implícito (la fecha de corte entra como argumento). Textos revisados
 * en bcn.cl el 2026-10-14:
 *
 *  - Ley 21.442, art. 2 N°13: hábiles son "los copropietarios que se encuentren
 *    al día en el pago de toda obligación económica para con el condominio".
 *  - Ley 21.442, art. 15: "Solo los copropietarios hábiles podrán ... concurrir
 *    con su voto a los acuerdos que se adopten"; la calidad "se acreditará
 *    mediante certificado expedido por el administrador o por quien haga sus veces".
 *  - Ley 21.442, art. 6 y DS 7, art. 9: con convenio de pago, el copropietario es
 *    hábil desde que paga la primera cuota "y mientras cumpla con los términos
 *    convenidos y sus otras obligaciones económicas".
 *  - DS 7, art. 14: quien posee más de una unidad solo es hábil si está al día
 *    "respecto de la totalidad de sus unidades".
 *
 * La deuda sale de la misma cobranza unificada que usa el Agente Operador
 * (`readCollectionExpenses`: expenses + unit_charges) y el atraso, de su misma
 * función (`daysOverdue`). Aquí no se repite esa lógica.
 */
import { daysOverdue } from '@/lib/agent-center/collection';
import type {
    EligibilityAgreement,
    EligibilityBasis,
    EligibilityDebt,
    EligibilityResult,
    EligibilityUnitInput,
    UnitEligibility,
} from './types';

const SCALE = 10_000;
const toUnits = (value: number) => Math.round(Math.max(0, Number(value) || 0) * SCALE);

/**
 * ¿El cobro está vencido a la fecha de corte? Vence el día siguiente a su fecha
 * de vencimiento: un cobro que vence el mismo día del corte todavía está al día.
 * Sin fecha de vencimiento, solo cuenta como vencido si la cobranza ya lo marcó
 * así (opción conservadora: no se presume deuda donde no hay fecha).
 */
export function debtOverdueAt(debt: Pick<EligibilityDebt, 'dueDate' | 'status'>, cutoffDate: string): boolean {
    if (!debt.dueDate) return debt.status === 'overdue';
    return daysOverdue(debt.dueDate, cutoffDate) > 0;
}

/**
 * Convenio vigente a la fecha de corte (Ley 21.442 art. 6; DS 7 art. 9):
 * activo (firmado; aprobado por el comité si correspondía), con la primera
 * cuota pagada a más tardar el día del corte y sin cuotas vencidas impagas. Un
 * convenio caído no habilita.
 *
 * La primera cuota vence el mismo día de la firma (`agreementDueDates`), así que
 * quien firma y paga en el acto queda hábil ese mismo día; quien firma y aún no
 * paga, todavía no (aunque esa cuota no esté vencida).
 */
export function agreementInForceAt(agreement: EligibilityAgreement, cutoffDate: string): boolean {
    if (agreement.status !== 'active') return false;
    const installments = [...agreement.installments].sort((a, b) => a.sequence - b.sequence);
    const first = installments[0];
    if (!first || first.status !== 'paid') return false;
    if (first.paidAt && dateOnly(first.paidAt) > cutoffDate) return false;
    return !installments.some(item => item.status !== 'paid' && daysOverdue(item.dueDate, cutoffDate) > 0);
}

const ISO_WITH_TIME = /^\d{4}-\d{2}-\d{2}T/;

/**
 * Fecha civil (YYYY-MM-DD) de un ISO o una fecha. Un instante con hora (como
 * `created_at`, en UTC) se lleva al calendario de Chile: un convenio abierto a
 * las 22:00 de Chile es de ese día, no del siguiente en UTC.
 */
function dateOnly(value: string): string {
    if (ISO_WITH_TIME.test(value)) {
        const instant = new Date(value);
        if (!Number.isNaN(instant.getTime())) {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(instant);
        }
    }
    return value.slice(0, 10);
}

/**
 * Habilidad de una sola unidad, antes de mirar las otras unidades del mismo
 * copropietario. Con convenio vigente, la deuda que venció hasta el día en que
 * se suscribió el convenio queda cubierta por él; lo que venció después son
 * "otras obligaciones económicas" y deben estar al día (DS 7, art. 9).
 */
export function unitEligibility(debts: EligibilityDebt[], agreements: EligibilityAgreement[], cutoffDate: string): { eligible: boolean; basis: EligibilityBasis } {
    const overdue = debts.filter(debt => debtOverdueAt(debt, cutoffDate));
    const active = agreements.filter(agreement => agreement.status === 'active');
    if (active.some(agreement => !agreementInForceAt(agreement, cutoffDate))) {
        return { eligible: false, basis: 'agreement_lapsed' };
    }
    if (!overdue.length) return { eligible: true, basis: 'up_to_date' };
    const inForce = active.filter(agreement => agreementInForceAt(agreement, cutoffDate));
    if (!inForce.length) return { eligible: false, basis: 'overdue' };
    const signedOn = inForce.map(agreement => dateOnly(agreement.createdAt)).sort().slice(-1)[0];
    const uncovered = overdue.filter(debt => !debt.dueDate || dateOnly(debt.dueDate) > signedOn);
    return uncovered.length ? { eligible: false, basis: 'overdue' } : { eligible: true, basis: 'agreement' };
}

/**
 * Habilidad de todas las unidades a la fecha de corte. Las unidades del mismo
 * copropietario (`ownerId`) se habilitan o no en conjunto (DS 7, art. 14). Los
 * pesos son los derechos de la foto de la sesión.
 */
export function computeEligibility(input: {
    units: EligibilityUnitInput[];
    debts: EligibilityDebt[];
    agreements: EligibilityAgreement[];
    cutoffDate: string;
}): EligibilityResult {
    const debtsByUnit = new Map<string, EligibilityDebt[]>();
    for (const debt of input.debts) debtsByUnit.set(debt.unitId, [...(debtsByUnit.get(debt.unitId) || []), debt]);
    const agreementsByUnit = new Map<string, EligibilityAgreement[]>();
    for (const agreement of input.agreements) agreementsByUnit.set(agreement.unitId, [...(agreementsByUnit.get(agreement.unitId) || []), agreement]);

    const own = input.units.map(unit => ({
        unit,
        ...unitEligibility(debtsByUnit.get(unit.unitId) || [], agreementsByUnit.get(unit.unitId) || [], input.cutoffDate),
    }));
    const blockedOwners = new Set(own.filter(row => !row.eligible && row.unit.ownerId).map(row => row.unit.ownerId as string));
    const units: UnitEligibility[] = own.map(row => {
        if (row.eligible && row.unit.ownerId && blockedOwners.has(row.unit.ownerId)) {
            return { unitId: row.unit.unitId, eligible: false, basis: 'other_unit', weight: row.unit.weight };
        }
        return { unitId: row.unit.unitId, eligible: row.eligible, basis: row.basis, weight: row.unit.weight };
    });
    const eligible = units.filter(unit => unit.eligible);
    return {
        cutoffDate: input.cutoffDate,
        units,
        totalUnits: units.length,
        eligibleUnits: eligible.length,
        totalWeight: units.reduce((sum, unit) => sum + toUnits(unit.weight), 0) / SCALE,
        eligibleWeight: eligible.reduce((sum, unit) => sum + toUnits(unit.weight), 0) / SCALE,
    };
}

/** Derechos hábiles presentes: la base para constituir la sesión (ver `rules.ts`). */
export function eligiblePresentWeight(present: { unitId: string; weight: number }[], eligibleUnitIds: Set<string>): number {
    return present.filter(row => eligibleUnitIds.has(row.unitId)).reduce((sum, row) => sum + toUnits(row.weight), 0) / SCALE;
}
