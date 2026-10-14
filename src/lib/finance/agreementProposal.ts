/**
 * agreementProposal.ts — Propuesta de convenio a la medida de cada vecino.
 *
 * Principio: el convenio es una mano tendida, no un castigo. La cuota se calcula
 * para que la carga mensual siga siendo llevable: el gasto común del mes más
 * cerca de media cuota extra. Nada se crea aquí; esto solo calcula la propuesta
 * que la administración (y el comité, si existe) aprueba.
 */
import { BillingError } from './billingService';

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
    startDate: string;
    reasoning: string;
}

/** Día 5 del mes siguiente: deja tiempo para conversarlo antes de la primera cuota. */
export function firstInstallmentDate(today: string): string {
    const [year, month] = today.slice(0, 10).split('-').map(Number);
    const nextYear = month === 12 ? year + 1 : year;
    const nextMonth = month === 12 ? 1 : month + 1;
    return `${nextYear}-${String(nextMonth).padStart(2, '0')}-05`;
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
        reasoning,
    };
}
