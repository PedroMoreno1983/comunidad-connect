/**
 * CommercialService: captura de leads comerciales.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import type {
    CommercialLeadRequest,
    CommercialLeadResponse,
} from '../types';

export const CommercialService = {
    async submitLead(payload: CommercialLeadRequest): Promise<CommercialLeadResponse> {
        const response = await fetch('/api/email/outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null) as CommercialLeadResponse | null;

        if (!response.ok || !data?.ok) {
            throw new Error(data?.error || 'No se pudo registrar la solicitud. Intenta nuevamente.');
        }

        return data;
    },
};
