import { BillingError } from '@/lib/finance/billingService';
import { recordPayment } from '@/lib/finance/collectionService';
import { todayInChile } from '@/lib/finance/chileDates';

/**
 * Imputa un pago en línea a unit_payments. La referencia de pasarela hace
 * idempotente el reintento del webhook o del commit de Transbank.
 */
export async function recordOnlineExpensePayment(input: {
    communityId: string;
    unitId: string;
    expenseId: string;
    amount: number;
    reference: string;
    paidAt?: string | null;
    processor: string;
}): Promise<'recorded' | 'duplicate'> {
    const paidAt = input.paidAt && /^\d{4}-\d{2}-\d{2}$/.test(input.paidAt)
        ? input.paidAt
        : todayInChile();
    try {
        await recordPayment(input.communityId, null, {
            unitId: input.unitId,
            amount: input.amount,
            paidAt,
            method: 'online',
            reference: input.reference,
            notes: `Pago en línea (${input.processor})`,
            expenseId: input.expenseId,
        });
        return 'recorded';
    } catch (error) {
        if (error instanceof BillingError && error.code === 'duplicate_reference') return 'duplicate';
        throw error;
    }
}
