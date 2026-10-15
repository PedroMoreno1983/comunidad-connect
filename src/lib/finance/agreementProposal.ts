/**
 * agreementProposal.ts — Propuesta de convenio a la medida de cada vecino.
 *
 * Principio: el convenio es una mano tendida, no un castigo. La cuota se calcula
 * para que la carga mensual siga siendo llevable: el gasto común del mes más
 * cerca de media cuota extra. Nada se crea aquí; esto solo calcula la propuesta
 * que la administración (y el comité, si existe) aprueba.
 *
 * Fechas: la primera cuota vence el día en que el convenio se firma (queda
 * vigente: al abrirlo si no hay comité, o cuando el comité lo aprueba). Así,
 * quien firma y paga en el acto queda hábil para votar en asambleas (Ley 21.442
 * art. 6; DS 7 art. 9). Las siguientes, el día 5 de cada mes, con al menos 15
 * días entre la primera y la segunda (`agreementDueDates`).
 */
import { BillingError } from './billingService';
import { agreementDueDates } from './operationalFlows';

export const AGREEMENT_SHARE_OF_MONTHLY_FEE = 0.5;
export const AGREEMENT_DEFAULT_INSTALLMENTS = 6;
export const AGREEMENT_MAX_SUGGESTED_INSTALLMENTS = 12;

export interface AgreementProposalInput {
    /** Lo que la unidad debe hoy (positivo). */
    balance: number;
    /** Gasto común mensual de referencia de la unidad, si se conoce. */
    monthlyFee: number | null;
    /** Hoy en Chile, AAAA-MM-DD. */
    today: string;
    /** Cantidad de cuotas pedida por la administración; si no, se sugiere. */
    installmentCount?: number | null;
}

export interface AgreementProposal {
    totalAmount: number;
    installmentCount: number;
    installmentAmount: number;
    /** Primera cuota: vence el día de la firma (si se firma hoy, hoy). */
    startDate: string;
    /** Segunda cuota: primer día 5 a 15 días o más de la primera; luego, mensual. */
    secondDueDate: string;
    reasoning: string;
}

export { AGREEMENT_SIGNING_COPY } from './agreementCopy';

/** La primera cuota vence el mismo día en que se firma el convenio. */
export function firstInstallmentDate(signedOn: string): string {
    return agreementDueDates(signedOn.slice(0, 10), 1)[0];
}

/** Fecha de la segunda cuota para un convenio firmado ese día. */
export function secondInstallmentDate(signedOn: string): string {
    return agreementDueDates(signedOn.slice(0, 10), 2)[1];
}

export function proposeAgreementPlan(input: AgreementProposalInput): AgreementProposal {
    const totalAmount = Math.round(Number(input.balance));
    if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
        throw new BillingError('no_debt', 'La unidad no tiene saldo pendiente: no corresponde un convenio.');
    }
    const fee = Number(input.monthlyFee);
    const hasFee = Number.isFinite(fee) && fee > 0;
    const requested = Number(input.installmentCount);
    let installmentCount: number;
    let reasoning: string;
    if (Number.isInteger(requested) && requested >= 2 && requested <= 36) {
        installmentCount = requested;
        reasoning = `${requested} cuotas, según lo indicado por la administración.`;
    } else if (hasFee) {
        const target = Math.max(1, Math.round(fee * AGREEMENT_SHARE_OF_MONTHLY_FEE));
        installmentCount = Math.min(AGREEMENT_MAX_SUGGESTED_INSTALLMENTS, Math.max(2, Math.ceil(totalAmount / target)));
        reasoning = installmentCount === AGREEMENT_MAX_SUGGESTED_INSTALLMENTS && totalAmount / target > installmentCount
            ? `Tope de ${installmentCount} cuotas; la cuota queda sobre media cuota de gasto común, conviene conversarlo con el vecino.`
            : 'Cada cuota ronda media cuota de gasto común, para que el pago mensual siga siendo llevable.';
    } else {
        installmentCount = Math.min(AGREEMENT_DEFAULT_INSTALLMENTS, Math.max(2, totalAmount));
        reasoning = `Sin gasto común de referencia: ${installmentCount} cuotas iguales.`;
    }
    if (Math.floor(totalAmount / installmentCount) < 1) installmentCount = 2;
    return {
        totalAmount,
        installmentCount,
        installmentAmount: Math.floor(totalAmount / installmentCount),
        startDate: firstInstallmentDate(input.today),
        secondDueDate: secondInstallmentDate(input.today),
        reasoning,
    };
}
