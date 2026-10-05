import type { PaymentCheckout } from '@/lib/types';
import { HaulmerService } from '@/lib/services/haulmer';
import { createTransbankTransaction } from './transbank';
import { resolvePaymentProvider } from './providerEnv';

export { isHaulmerConfigured, resolvePaymentProvider } from './providerEnv';

export interface ProviderCheckoutInput {
    amount: number;
    description: string;
    reference: string;
    returnUrl: string;
    cancelUrl?: string;
    client: { name: string; email: string; phone?: string };
    sessionId: string;
}

export async function createProviderCheckout(input: ProviderCheckoutInput): Promise<PaymentCheckout> {
    const provider = resolvePaymentProvider();
    if (!provider) {
        throw new Error('PAYMENT_NOT_CONFIGURED');
    }

    if (provider === 'transbank') {
        const created = await createTransbankTransaction({
            amount: input.amount,
            returnUrl: input.returnUrl,
            sessionId: input.sessionId,
            reference: input.reference,
        });
        return {
            provider: 'transbank',
            url: created.url,
            token: created.token,
            reference: input.reference,
            amount: input.amount,
            baseAmount: input.amount,
            serviceFee: 0,
            redirectMethod: 'POST',
            tokenField: 'token_ws',
        };
    }

    const created = await HaulmerService.createPaymentLink({
        amount: input.amount,
        description: input.description,
        reference: input.reference,
        client: input.client,
        returnUrl: input.returnUrl,
        cancelUrl: input.cancelUrl,
    });
    return {
        provider: 'haulmer',
        url: created.url,
        token: created.token,
        reference: created.reference,
        amount: input.amount,
        baseAmount: input.amount,
        serviceFee: 0,
        redirectMethod: 'GET',
        tokenField: null,
    };
}
