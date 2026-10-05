/**
 * Transbank Webpay Plus. El pago se confirma solo con commit AUTHORIZED
 * (response_code 0). No hay atajo que marque un cobro como pagado.
 */

import { isTransbankConfigured } from './providerEnv';

export { isTransbankConfigured } from './providerEnv';

const HOSTS = {
    integration: 'https://webpay3gint.transbank.cl',
    production: 'https://webpay3g.transbank.cl',
} as const;

function getConfig() {
    if (!isTransbankConfigured()) {
        throw new Error('Transbank Webpay Plus no está configurado. Falta TRANSBANK_COMMERCE_CODE o TRANSBANK_API_KEY.');
    }
    const environment = process.env.TRANSBANK_ENVIRONMENT === 'production' ? 'production' : 'integration';
    return {
        commerceCode: process.env.TRANSBANK_COMMERCE_CODE!.trim(),
        apiKey: process.env.TRANSBANK_API_KEY!.trim(),
        host: HOSTS[environment],
    };
}

function transbankHeaders() {
    const config = getConfig();
    return {
        'Content-Type': 'application/json',
        'Tbk-Api-Key-Id': config.commerceCode,
        'Tbk-Api-Key-Secret': config.apiKey,
    };
}

export interface TransbankTransactionCreated {
    token: string;
    url: string;
    buyOrder: string;
}

export async function createTransbankTransaction(input: {
    amount: number;
    returnUrl: string;
    sessionId: string;
    reference: string;
}): Promise<TransbankTransactionCreated> {
    const config = getConfig();
    const buyOrder = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 26);
    const response = await fetch(`${config.host}/rswebpaytransaction/api/webpay/v1.2/transactions`, {
        method: 'POST',
        headers: transbankHeaders(),
        body: JSON.stringify({
            buy_order: buyOrder,
            session_id: input.sessionId.slice(0, 61),
            amount: Math.round(input.amount),
            return_url: input.returnUrl,
        }),
    });
    const data = await response.json().catch(() => ({})) as { token?: string; url?: string; error_message?: string };
    if (!response.ok || !data.token || !data.url) {
        throw new Error(data.error_message || 'Transbank rechazó iniciar el pago.');
    }
    return { token: data.token, url: data.url, buyOrder };
}

export interface TransbankCommitResult {
    status: string;
    responseCode: number;
    amount: number;
    buyOrder: string;
    sessionId: string;
    authorizationCode: string | null;
}

export async function commitTransbankTransaction(token: string): Promise<TransbankCommitResult> {
    const config = getConfig();
    const response = await fetch(
        `${config.host}/rswebpaytransaction/api/webpay/v1.2/transactions/${encodeURIComponent(token)}`,
        { method: 'PUT', headers: transbankHeaders() },
    );
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    if (!response.ok) {
        throw new Error(typeof data.error_message === 'string' ? data.error_message : 'No se pudo confirmar el pago en Transbank.');
    }
    return {
        status: String(data.status || ''),
        responseCode: Number(data.response_code ?? -1),
        amount: Number(data.amount || 0),
        buyOrder: String(data.buy_order || ''),
        sessionId: String(data.session_id || ''),
        authorizationCode: data.authorization_code ? String(data.authorization_code) : null,
    };
}

export function isTransbankAuthorized(result: TransbankCommitResult): boolean {
    return result.status === 'AUTHORIZED' && result.responseCode === 0;
}

export function parseTransbankSession(sessionId: string): { type: 'expense' | 'marketplace'; recordId: string } | null {
    const [rawType, ...rest] = sessionId.split(':');
    const recordId = rest.join(':');
    if (!recordId) return null;
    if (rawType === 'EXP' || rawType === 'FEE') return { type: 'expense', recordId };
    if (rawType === 'MARKET') return { type: 'marketplace', recordId };
    return null;
}
