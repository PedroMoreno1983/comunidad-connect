import crypto from 'crypto';
import { PUBLIC_SITE_URL } from '@/lib/config';

interface PaymentPayload {
    amount: number;
    description: string;
    reference: string;
    client: {
        email: string;
        name: string;
        phone?: string;
    };
    returnUrl: string;
    cancelUrl?: string;
    callbackUrl?: string;
}

export interface HaulmerPaymentLink {
    token: string;
    url: string;
    reference: string;
}

type HaulmerEnvironment = 'integration' | 'production';

const PAYMENT_URLS: Record<HaulmerEnvironment, string> = {
    integration: 'https://frontend-api.payment.haulmer.dev/v1/payment',
    production: 'https://core.payment.haulmer.com/api/v1/payment',
};

function getHaulmerConfig() {
    const accountId = process.env.HAULMER_ACCOUNT_ID?.trim();
    const secretKey = process.env.HAULMER_SECRET_KEY?.trim();
    const environment = process.env.HAULMER_ENVIRONMENT === 'integration' ? 'integration' : 'production';
    const apiUrl = process.env.HAULMER_PAYMENT_URL?.trim() || PAYMENT_URLS[environment];
    const shopName = process.env.HAULMER_SHOP_NAME?.trim() || 'Convive Connect';
    const defaultPhone = process.env.HAULMER_DEFAULT_CUSTOMER_PHONE?.trim() || '+56900000000';

    if (!accountId || !secretKey) {
        throw new Error('Haulmer/Tuu no esta configurado. Falta HAULMER_ACCOUNT_ID o HAULMER_SECRET_KEY.');
    }

    return { accountId, apiUrl, defaultPhone, secretKey, shopName };
}

function splitCustomerName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'Cliente', lastName: 'Convive' };
    if (parts.length === 1) return { firstName: parts[0], lastName: 'Convive' };

    return {
        firstName: parts.slice(0, -1).join(' '),
        lastName: parts[parts.length - 1],
    };
}

function withQueryParam(url: string, key: string, value: string): string {
    try {
        const parsed = new URL(url);
        parsed.searchParams.set(key, value);
        return parsed.toString();
    } catch {
        return url;
    }
}

export function signHaulmerParams(params: Record<string, string | number>, secretKey: string): string {
    const signatureBase = Object.entries(params)
        .filter(([key]) => key.startsWith('x_') && key !== 'x_signature')
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, value]) => `${key}${String(value)}`)
        .join('');

    return crypto.createHmac('sha256', secretKey).update(signatureBase, 'utf8').digest('hex');
}

function readStringField(source: unknown, keys: string[]): string | null {
    if (!source || typeof source !== 'object') return null;
    const record = source as Record<string, unknown>;

    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }

    const nested = record.data;
    if (nested && typeof nested === 'object') {
        return readStringField(nested, keys);
    }

    return null;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return {};

    try {
        return JSON.parse(text) as unknown;
    } catch {
        return { message: text };
    }
}

/**
 * Integracion server-side con Tuu/Haulmer Payment Intent.
 * Docs: https://developers.tuu.cl/docs/payment-intent
 */
export const HaulmerService = {
    async createPaymentLink(payload: PaymentPayload): Promise<HaulmerPaymentLink> {
        const config = getHaulmerConfig();
        const { firstName, lastName } = splitCustomerName(payload.client.name);
        const amount = Math.round(payload.amount);
        const callbackUrl = payload.callbackUrl || `${PUBLIC_SITE_URL}/api/webhooks/haulmer`;
        const cancelUrl = payload.cancelUrl || withQueryParam(payload.returnUrl, 'status', 'cancelled');

        const signedPayload: Record<string, string | number> = {
            x_account_id: config.accountId,
            x_amount: amount,
            x_currency: 'CLP',
            x_customer_email: payload.client.email,
            x_customer_first_name: firstName,
            x_customer_last_name: lastName,
            x_customer_phone: payload.client.phone?.trim() || config.defaultPhone,
            x_description: payload.description,
            x_reference: payload.reference,
            x_shop_name: config.shopName,
            x_url_callback: callbackUrl,
            x_url_cancel: cancelUrl,
            x_url_complete: payload.returnUrl,
        };

        const requestBody = {
            ...signedPayload,
            x_signature: signHaulmerParams(signedPayload, config.secretKey),
        };

        const response = await fetch(config.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-REDIRECT': 'false',
            },
            body: JSON.stringify(requestBody),
        });

        const data = await parseJsonResponse(response);

        if (!response.ok) {
            const message = readStringField(data, ['message', 'error', 'detail'])
                || 'Error al generar el intento de pago en Haulmer/Tuu';
            console.error('[HaulmerService] Payment intent failed:', data);
            throw new Error(message);
        }

        const url = readStringField(data, [
            'url',
            'payment_url',
            'redirect_url',
            'redirectUrl',
            'checkout_url',
            'paymentIntentUrl',
        ]);

        if (!url) {
            console.error('[HaulmerService] Payment intent response without URL:', data);
            throw new Error('Haulmer/Tuu no retorno una URL de pago.');
        }

        const token = readStringField(data, ['token', 'id', 'payment_id', 'paymentIntentId']) || payload.reference;

        return {
            token,
            url,
            reference: payload.reference,
        };
    },
};
