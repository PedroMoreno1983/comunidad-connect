/**
 * Reglas de asambleas de copropietarios. Módulo PURO: sin base de datos, sin
 * red y sin reloj implícito (la fecha de hoy entra como argumento). Cada cifra
 * va con su artículo; se revisaron en bcn.cl el 2026-10-14:
 *   Ley 21.442  https://www.bcn.cl/leychile/navegar?idNorma=1174663
 *   DS 7 (2025) https://www.bcn.cl/leychile/navegar?idNorma=1210089
 */
import { findMatter, QUORUM_CLASS_LABEL } from './catalog';
import type {
    AgendaResult,
    AssemblyAlert,
    AssemblySessionType,
    AttendanceCapacity,
    AttendanceMode,
    QuorumClass,
    RightsSnapshot,
    RightsUnit,
    VoteChoice,
    VoteTally,
} from './types';

// ---------------------------------------------------------------------------
// Cifras legales
// ---------------------------------------------------------------------------

/** Citación: anticipación mínima de 5 días y máxima de 15 (Ley 21.442, art. 16). */
export const CITATION_MIN_DAYS = 5;
export const CITATION_MAX_DAYS = 15;
/** Sesión ordinaria: se constituye con al menos el 33% de los derechos (art. 15, cuadro 1). */
export const ORDINARY_CONSTITUTION_PERCENT = 33;
/** Mayoría reforzada: 66% para constituir y para acordar (art. 15, cuadro 3). */
export const REINFORCED_PERCENT = 66;
/** Copropietarios con el 10% de los derechos pueden pedir sesión extraordinaria (art. 14). */
export const OWNER_REQUEST_PERCENT = 10;
/** Pedida por el 10%, la citación se envía dentro de 10 días corridos (DS 7, art. 15). */
export const OWNER_REQUEST_CITATION_DAYS = 10;
/** El acta se firma a más tardar dentro de los 30 días siguientes al acuerdo (art. 15). */
export const MINUTES_SIGNATURE_DAYS = 30;
/** Gastos extraordinarios sobre 6 cuotas de gasto común ordinario en 12 meses (art. 14 N°7; cuadro 2 c). */
export const EXTRAORDINARY_EXPENSE_QUOTAS = 6;
export const EXTRAORDINARY_EXPENSE_WINDOW_MONTHS = 12;
/** La sesión ordinaria se celebra a lo menos una vez por año (art. 14). */
export const ORDINARY_MAX_INTERVAL_DAYS = 365;

/** Escala para comparar derechos con enteros (las alícuotas llegan con 4 decimales en ‰). */
const SCALE = 10_000;
const toUnits = (value: number) => Math.round(Math.max(0, value) * SCALE);

// ---------------------------------------------------------------------------
// Fechas (YYYY-MM-DD, calendario civil chileno; se anclan a mediodía UTC)
// ---------------------------------------------------------------------------

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
    if (!ISO_DATE.test(value)) return false;
    const date = new Date(`${value}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function addDays(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
    const from = new Date(`${fromIso}T12:00:00Z`).getTime();
    const to = new Date(`${toIso}T12:00:00Z`).getTime();
    return Math.round((to - from) / 86_400_000);
}

/** Fecha civil en Chile de un instante. */
export function chileDateOf(instant: string | Date): string {
    const date = typeof instant === 'string' ? new Date(instant) : instant;
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// ---------------------------------------------------------------------------
// Citación
// ---------------------------------------------------------------------------

export interface CitationWindowCheck {
    valid: boolean;
    daysInAdvance: number;
    /** Primer y último día en que se puede enviar la citación para esa sesión. */
    earliestSendOn: string;
    latestSendOn: string;
    message: string;
}

/**
 * Valida que la citación se envíe con 5 a 15 días de anticipación (art. 16).
 * Se cuentan días corridos entre la fecha de envío y la fecha de la sesión:
 * enviar el 1 para una sesión el 6 son 5 días (válido); el 2 para el 6, 4 (no).
 */
export function checkCitationWindow(sentOn: string, sessionOn: string): CitationWindowCheck {
    const daysInAdvance = daysBetween(sentOn, sessionOn);
    const earliestSendOn = addDays(sessionOn, -CITATION_MAX_DAYS);
    const latestSendOn = addDays(sessionOn, -CITATION_MIN_DAYS);
    const valid = daysInAdvance >= CITATION_MIN_DAYS && daysInAdvance <= CITATION_MAX_DAYS;
    const message = valid
        ? `Citación con ${daysInAdvance} días de anticipación: dentro del rango legal de ${CITATION_MIN_DAYS} a ${CITATION_MAX_DAYS} días (Ley 21.442, art. 16).`
        : daysInAdvance < CITATION_MIN_DAYS
            ? `La citación debe enviarse con al menos ${CITATION_MIN_DAYS} días de anticipación (Ley 21.442, art. 16). Para esta fecha, el último día de envío era el ${latestSendOn}.`
            : `La citación no puede enviarse con más de ${CITATION_MAX_DAYS} días de anticipación (Ley 21.442, art. 16). Para esta fecha, envíala desde el ${earliestSendOn}.`;
    return { valid, daysInAdvance, earliestSendOn, latestSendOn, message };
}

export interface OwnerRequestCheck {
    reachesThreshold: boolean;
    citationDueOn: string | null;
    overdue: boolean;
    daysLeft: number | null;
    message: string;
}

/**
 * Petición de sesión extraordinaria por copropietarios: si reúnen al menos el
 * 10% de los derechos (art. 14), la citación se envía dentro de 10 días
 * corridos desde que la recibe el presidente del comité o el administrador
 * (DS 7, art. 15). `rightsShare` es una fracción de 0 a 1.
 */
export function checkOwnerRequest(receivedOn: string, rightsShare: number, today: string, citedOn: string | null = null): OwnerRequestCheck {
    const reachesThreshold = Math.round(Math.max(0, rightsShare) * 1_000_000) * 100 >= 1_000_000 * OWNER_REQUEST_PERCENT;
    if (!reachesThreshold) {
        return {
            reachesThreshold, citationDueOn: null, overdue: false, daysLeft: null,
            message: `La petición reúne menos del ${OWNER_REQUEST_PERCENT}% de los derechos: no obliga a citar (Ley 21.442, art. 14).`,
        };
    }
    const citationDueOn = addDays(receivedOn, OWNER_REQUEST_CITATION_DAYS);
    const reference = citedOn ?? today;
    const overdue = reference > citationDueOn;
    const daysLeft = daysBetween(today, citationDueOn);
    return {
        reachesThreshold, citationDueOn, overdue, daysLeft,
        message: overdue
            ? `La petición del ${OWNER_REQUEST_PERCENT}% obligaba a citar a más tardar el ${citationDueOn} (DS 7, art. 15).`
            : `Petición con al menos el ${OWNER_REQUEST_PERCENT}% de los derechos: la citación debe enviarse a más tardar el ${citationDueOn} (DS 7, art. 15).`,
    };
}

// ---------------------------------------------------------------------------
// Tipo de sesión y materias
// ---------------------------------------------------------------------------

const CLASS_RANK: Record<QuorumClass, number> = { ordinary: 1, absolute: 2, reinforced: 3 };
const SESSION_RANK: Record<AssemblySessionType, number> = { ordinary: 1, extraordinary: 2, reinforced: 3 };

/** Clase de quórum que constituye una sesión de ese tipo. */
export function sessionQuorumClass(sessionType: AssemblySessionType): QuorumClass {
    return sessionType === 'ordinary' ? 'ordinary' : sessionType === 'extraordinary' ? 'absolute' : 'reinforced';
}

/** Tipo de sesión mínimo que exige un conjunto de materias. */
export function requiredSessionType(matterCodes: string[]): AssemblySessionType {
    let rank = 1;
    for (const code of matterCodes) {
        const matter = findMatter(code);
        if (matter) rank = Math.max(rank, CLASS_RANK[matter.quorumClass]);
    }
    return rank === 3 ? 'reinforced' : rank === 2 ? 'extraordinary' : 'ordinary';
}

export interface AgendaCheckInput {
    sessionType: AssemblySessionType;
    matterCodes: string[];
    /** Para la materia 2) c): monto del gasto, gasto común ordinario mensual del condominio y lo ya aprobado en 12 meses. */
    extraordinaryExpense?: { amount: number; monthlyOrdinaryTotal: number; approvedLast12Months?: number } | null;
}

/**
 * Advertencias y errores de la tabla: una materia de extraordinaria en una
 * ordinaria es un error (art. 14), igual que una reforzada en una extraordinaria
 * de mayoría absoluta. Notario según art. 15, inciso final.
 */
export function checkAgenda(input: AgendaCheckInput): AssemblyAlert[] {
    const alerts: AssemblyAlert[] = [];
    if (input.matterCodes.length === 0) {
        alerts.push({ level: 'error', message: 'La citación debe indicar al menos una materia.' });
        return alerts;
    }
    const sessionRank = SESSION_RANK[input.sessionType];
    for (const code of input.matterCodes) {
        const matter = findMatter(code);
        if (!matter) {
            alerts.push({ level: 'error', message: `Materia desconocida: ${code}.` });
            continue;
        }
        if (CLASS_RANK[matter.quorumClass] > sessionRank) {
            alerts.push({
                level: 'error',
                message: `"${matter.label}" (cuadro del art. 15, ${matter.reference}) solo puede tratarse en sesión ${QUORUM_CLASS_LABEL[matter.quorumClass].toLowerCase()} (Ley 21.442, arts. 14 y 15).`,
            });
        }
    }
    if (input.sessionType !== 'ordinary') {
        alerts.push({ level: 'info', message: 'En sesión extraordinaria solo se tratan las materias incluidas en la citación (Ley 21.442, art. 14).' });
    }
    if (sessionRequiresNotary(input.sessionType, input.matterCodes)) {
        alerts.push({ level: 'warning', message: 'Debe asistir un notario, que certifica el acta (Ley 21.442, art. 15, inciso final). Si la naturaleza del acuerdo lo requiere, el acta se reduce a escritura pública.' });
    }
    const expense = input.extraordinaryExpense;
    if (expense && expenseRequiresExtraordinarySession(expense.amount, expense.monthlyOrdinaryTotal, expense.approvedLast12Months ?? 0)) {
        const hasMatter = input.matterCodes.includes('abs_gastos_extraordinarios');
        if (input.sessionType === 'ordinary' || !hasMatter) {
            alerts.push({
                level: 'error',
                message: `El gasto supera ${EXTRAORDINARY_EXPENSE_QUOTAS} cuotas de gasto común ordinario en ${EXTRAORDINARY_EXPENSE_WINDOW_MONTHS} meses: solo se aprueba en sesión extraordinaria, como materia 2) c) (Ley 21.442, arts. 14 y 15).`,
            });
        }
    }
    return alerts;
}

export function sessionRequiresNotary(sessionType: AssemblySessionType, matterCodes: string[]): boolean {
    if (sessionType === 'reinforced') return true;
    return matterCodes.some(code => findMatter(code)?.requiresNotary === true);
}

/**
 * Art. 14 N°7: gastos o inversiones extraordinarias que, en doce meses, excedan
 * seis cuotas de gasto común ordinario del total del condominio. "Exceder" es
 * estrictamente mayor: exactamente seis cuotas no obliga.
 */
export function expenseRequiresExtraordinarySession(amount: number, monthlyOrdinaryTotal: number, approvedLast12Months = 0): boolean {
    if (!(monthlyOrdinaryTotal > 0)) return false;
    return Math.round(amount + approvedLast12Months) > Math.round(monthlyOrdinaryTotal * EXTRAORDINARY_EXPENSE_QUOTAS);
}

/** Art. 14: la ordinaria se celebra a lo menos una vez al año. */
export function ordinarySessionOverdue(lastOrdinaryOn: string | null, today: string): boolean {
    if (!lastOrdinaryOn) return true;
    return daysBetween(lastOrdinaryOn, today) > ORDINARY_MAX_INTERVAL_DAYS;
}

// ---------------------------------------------------------------------------
// Quórum
// ---------------------------------------------------------------------------

export const QUORUM_RULES: Record<QuorumClass, { constitution: string; agreement: string }> = {
    ordinary: {
        constitution: `Asistentes hábiles con al menos el ${ORDINARY_CONSTITUTION_PERCENT}% de los derechos del condominio (Ley 21.442, art. 15, cuadro 1).`,
        agreement: 'Mayoría absoluta de los derechos de los asistentes (más de la mitad; art. 15, cuadro 1). Solo votan los copropietarios hábiles (art. 15).',
    },
    absolute: {
        constitution: 'Asistentes hábiles con la mayoría absoluta de los derechos del condominio (más de la mitad; art. 15, cuadro 2).',
        agreement: 'Mayoría absoluta de los derechos del condominio (más de la mitad; art. 15, cuadro 2). Solo votan los copropietarios hábiles (art. 15).',
    },
    reinforced: {
        constitution: `Asistentes hábiles con al menos el ${REINFORCED_PERCENT}% de los derechos del condominio (art. 15, cuadro 3).`,
        agreement: `Votos a favor con al menos el ${REINFORCED_PERCENT}% de los derechos del condominio (art. 15, cuadro 3). Solo votan los copropietarios hábiles (art. 15).`,
    },
};

/*
 * Quórums con copropietarios hábiles. El cuadro del art. 15 calcula sobre "los
 * derechos en el condominio" o "del condominio" (todos, no solo los hábiles) y,
 * en la ordinaria, sobre "los asistentes". El art. 15 solo dice que los no
 * hábiles no "concurren con su voto". La ley no dice si un asistente no hábil
 * cuenta para constituir: se toma la lectura conservadora, que deja válido el
 * acuerdo bajo cualquiera de las dos:
 *   - Denominador: SIEMPRE los derechos de todo el condominio.
 *   - Constitución: solo los derechos HÁBILES presentes (como el ocupante que
 *     asiste sin representar: "no serán considerados en los quórums", DS 7 art. 12).
 *   - Acuerdo ordinario: más de la mitad de los derechos de TODOS los asistentes
 *     (hábiles o no); los votos a favor solo vienen de hábiles.
 */

/** ¿Los derechos presentes constituyen la sesión? */
export function constitutionMet(quorumClass: QuorumClass, presentWeight: number, totalWeight: number): boolean {
    const present = toUnits(presentWeight);
    const total = toUnits(totalWeight);
    if (total <= 0) return false;
    if (quorumClass === 'ordinary') return present * 100 >= total * ORDINARY_CONSTITUTION_PERCENT;
    if (quorumClass === 'absolute') return present * 2 > total;
    return present * 100 >= total * REINFORCED_PERCENT;
}

/** Derechos mínimos presentes para constituir, en las mismas unidades de los pesos. */
export function constitutionThreshold(quorumClass: QuorumClass, totalWeight: number): number {
    if (quorumClass === 'ordinary') return (totalWeight * ORDINARY_CONSTITUTION_PERCENT) / 100;
    if (quorumClass === 'absolute') return totalWeight / 2;
    return (totalWeight * REINFORCED_PERCENT) / 100;
}

/** ¿Los votos a favor alcanzan el acuerdo? La base depende de la clase. */
export function agreementMet(quorumClass: QuorumClass, tally: VoteTally): boolean {
    const yes = toUnits(tally.yes);
    if (quorumClass === 'ordinary') {
        const present = toUnits(tally.present);
        return present > 0 && yes * 2 > present;
    }
    const total = toUnits(tally.total);
    if (total <= 0) return false;
    if (quorumClass === 'absolute') return yes * 2 > total;
    return yes * 100 >= total * REINFORCED_PERCENT;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 10_000) / 100 : 0);

/**
 * Resultado de un punto. La clase del punto sale de su materia; la constitución
 * se exige con la clase más alta entre la sesión y la materia (una sesión de
 * mayoría absoluta que pierde quórum no puede seguir acordando).
 */
export function evaluateAgendaItem(input: {
    sessionType: AssemblySessionType;
    matterClass: QuorumClass;
    tally: VoteTally;
    pendingVerification?: number;
    /**
     * Derechos HÁBILES presentes (certificado de habilidad). Constituye la sesión;
     * no se guarda en el resultado para no exponer cuánto pesan los no hábiles.
     * Si falta, se usa `tally.present` (todos los presentes).
     */
    eligiblePresent?: number;
}): AgendaResult {
    const sessionClass = sessionQuorumClass(input.sessionType);
    const constitutionClass: QuorumClass = CLASS_RANK[sessionClass] >= CLASS_RANK[input.matterClass] ? sessionClass : input.matterClass;
    const constitutionPresent = input.eligiblePresent === undefined ? input.tally.present : Math.min(input.eligiblePresent, input.tally.present);
    const constituted = constitutionMet(constitutionClass, constitutionPresent, input.tally.total);
    const agreed = constituted && agreementMet(input.matterClass, input.tally);
    const base = input.matterClass === 'ordinary' ? 'present' : 'total';
    const rule = `${QUORUM_CLASS_LABEL[input.matterClass]}. Constitución: ${QUORUM_RULES[constitutionClass].constitution} Acuerdo: ${QUORUM_RULES[input.matterClass].agreement}`;
    return {
        tally: input.tally,
        outcome: !constituted ? 'no_quorum' : agreed ? 'approved' : 'rejected',
        rule,
        constitutionMet: constituted,
        agreementMet: agreed,
        percentages: {
            presentOfTotal: pct(input.tally.present, input.tally.total),
            yesOfBase: pct(input.tally.yes, base === 'present' ? input.tally.present : input.tally.total),
            base,
        },
        pendingVerification: input.pendingVerification ?? 0,
    };
}

// ---------------------------------------------------------------------------
// Votos ponderados y validez de cada voto
// ---------------------------------------------------------------------------

export interface WeightedVote {
    choice: VoteChoice;
    weight: number;
    counts: boolean;
}

/** Suma ponderada (cada copropietario tiene un voto proporcional a sus derechos; art. 15). */
export function tallyVotes(votes: WeightedVote[], presentWeight: number, totalWeight: number): VoteTally {
    const sums = { yes: 0, no: 0, abstain: 0 };
    for (const vote of votes) {
        if (!vote.counts) continue;
        sums[vote.choice] += toUnits(vote.weight);
    }
    return {
        yes: sums.yes / SCALE,
        no: sums.no / SCALE,
        abstain: sums.abstain / SCALE,
        present: presentWeight,
        total: totalWeight,
    };
}

/**
 * Un voto cuenta si la asistencia de la unidad está acreditada y, cuando se
 * vota en línea, si además se identificó a la persona con imagen y voz al
 * votar (DS 7, art. 16 N°3). En sala basta la acreditación. Además, la unidad
 * debe estar habilitada en el certificado (Ley 21.442, art. 15): quien
 * representa a la unidad (poder u ocupante) vota con la habilidad de ella.
 */
export function voteCounts(input: { attendanceVerified: boolean; attendancePresent: boolean; mode: AttendanceMode; voteVerified: boolean; unitEligible?: boolean }): boolean {
    if (input.unitEligible === false) return false;
    if (!input.attendanceVerified || !input.attendancePresent) return false;
    return input.mode === 'in_person' ? true : input.voteVerified;
}

// ---------------------------------------------------------------------------
// Representación
// ---------------------------------------------------------------------------

export interface RepresentationCheck {
    allowed: boolean;
    reason: string;
}

/**
 * Quién puede asistir y votar por una unidad:
 *  - El administrador no puede representar a ningún copropietario (Ley 21.442,
 *    art. 15). Si es copropietario, asiste solo como titular (DS 7, art. 22).
 *  - Con poder, según los requisitos del reglamento de copropiedad (DS 7, art. 11).
 *  - El arrendatario u ocupante registrado representa por ley si el
 *    copropietario no asiste ni designó a otro, salvo que este lo haya negado;
 *    en materias de mayoría reforzada necesita autorización expresa (DS 7, art. 12).
 */
export function checkRepresentation(input: {
    capacity: AttendanceCapacity;
    representativeIsAdmin: boolean;
    hasAcceptedProxy: boolean;
    occupantOptedOut: boolean;
    ownerOrOtherProxyPresent: boolean;
}): RepresentationCheck {
    if (input.capacity === 'owner') return { allowed: true, reason: 'Asiste como titular.' };
    if (input.representativeIsAdmin) {
        return { allowed: false, reason: 'El administrador no puede representar a ningún copropietario en la asamblea (Ley 21.442, art. 15; DS 7, art. 22).' };
    }
    if (input.capacity === 'proxy') {
        return input.hasAcceptedProxy
            ? { allowed: true, reason: 'Asiste con poder revisado por administración (DS 7, art. 11).' }
            : { allowed: false, reason: 'Falta un poder aceptado para esta unidad (DS 7, art. 11).' };
    }
    if (input.occupantOptedOut) {
        return { allowed: false, reason: 'El copropietario comunicó que no otorga la representación al arrendatario u ocupante (DS 7, art. 12).' };
    }
    if (input.ownerOrOtherProxyPresent) {
        return { allowed: false, reason: 'El copropietario o su representante ya asiste: no opera la representación del ocupante (DS 7, art. 12).' };
    }
    return { allowed: true, reason: 'Arrendatario u ocupante registrado: representa por ley (DS 7, art. 12).' };
}

/** Un ocupante solo vota materias de mayoría reforzada con autorización expresa (DS 7, art. 12). */
export function occupantMayVote(matterClass: QuorumClass, hasExpressAuthorization: boolean): boolean {
    return matterClass !== 'reinforced' || hasExpressAuthorization;
}

// ---------------------------------------------------------------------------
// Acta
// ---------------------------------------------------------------------------

export interface MinutesDeadline {
    dueOn: string;
    daysLeft: number;
    overdue: boolean;
}

/** Firma del acta a más tardar dentro de los 30 días siguientes al acuerdo (art. 15). */
export function minutesDeadline(sessionOn: string, today: string, signed = false): MinutesDeadline {
    const dueOn = addDays(sessionOn, MINUTES_SIGNATURE_DAYS);
    const daysLeft = daysBetween(today, dueOn);
    return { dueOn, daysLeft, overdue: !signed && daysLeft < 0 };
}

// ---------------------------------------------------------------------------
// Derechos por unidad (ponderación)
// ---------------------------------------------------------------------------

export interface RightsSourceUnit {
    id: string;
    label: string;
    sharePermille: number | null;
}

/**
 * Derechos de cada unidad para votar. Se usa la alícuota de gastos comunes
 * (`units.share_permille`, en ‰): es la proporción en los bienes comunes del
 * art. 3° salvo que el reglamento de copropiedad diga otra cosa.
 * Si a alguna unidad le falta la alícuota, se cae a 1 unidad = 1 voto con una
 * advertencia (mismo criterio que el prorrateo: no mezclar).
 */
export function computeRights(units: RightsSourceUnit[]): RightsSnapshot {
    if (units.length === 0) {
        return { method: 'equal', units: [], total: 0, warnings: ['La comunidad no tiene unidades registradas: no hay derechos que contar.'] };
    }
    const missing = units.filter(unit => unit.sharePermille === null || !(unit.sharePermille > 0));
    if (missing.length > 0) {
        const rows: RightsUnit[] = units.map(unit => ({ unitId: unit.id, label: unit.label, weight: 1 }));
        return {
            method: 'equal',
            units: rows,
            total: rows.length,
            warnings: [missing.length === units.length
                ? 'Ninguna unidad tiene alícuota (derechos) cargada: se contará 1 unidad = 1 voto. La ley pide votos proporcionales a los derechos (art. 15); cárgalas en Asambleas › Derechos de cada unidad antes de la sesión.'
                : `${missing.length} de ${units.length} unidades no tienen alícuota (derechos): se contará 1 unidad = 1 voto para todas. La ley pide votos proporcionales a los derechos (art. 15); complétalas en Asambleas › Derechos de cada unidad.`],
        };
    }
    const rows: RightsUnit[] = units.map(unit => ({ unitId: unit.id, label: unit.label, weight: Number(unit.sharePermille) }));
    const totalUnits = rows.reduce((sum, row) => sum + toUnits(row.weight), 0);
    const total = totalUnits / SCALE;
    const warnings = Math.abs(total - 1000) > 1
        ? [`Las alícuotas suman ${total.toFixed(4)}‰ en vez de 1000‰. Los quórums se calculan en proporción al total cargado; conviene revisar las unidades.`]
        : [];
    return { method: 'share', units: rows, total, warnings };
}

export function percentOf(part: number, whole: number): number {
    return pct(part, whole);
}

