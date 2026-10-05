import type { PaymentProviderId } from '@/lib/types';

type Environment = Record<string, string | undefined>;

export function paymentEnvHasValue(environment: Environment, name: string): boolean {
    const value = environment[name]?.trim();
    if (!value) return false;
    return !/^(TU_|your_|placeholder|changeme|xxx)/i.test(value);
}

export function isHaulmerConfigured(environment: Environment = process.env): boolean {
    return paymentEnvHasValue(environment, 'HAULMER_ACCOUNT_ID')
        && paymentEnvHasValue(environment, 'HAULMER_SECRET_KEY');
}

export function isTransbankConfigured(environment: Environment = process.env): boolean {
    return paymentEnvHasValue(environment, 'TRANSBANK_COMMERCE_CODE')
        && paymentEnvHasValue(environment, 'TRANSBANK_API_KEY');
}

export function resolvePaymentProvider(environment: Environment = process.env): PaymentProviderId | null {
    const preferred = environment.PAYMENT_PROVIDER?.trim().toLowerCase();
    const haulmer = isHaulmerConfigured(environment);
    const transbank = isTransbankConfigured(environment);
    if (preferred === 'transbank' && transbank) return 'transbank';
    if (preferred === 'haulmer' && haulmer) return 'haulmer';
    if (haulmer) return 'haulmer';
    if (transbank) return 'transbank';
    return null;
}
