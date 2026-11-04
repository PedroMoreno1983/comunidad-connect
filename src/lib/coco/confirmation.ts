/**
 * Cómo se confirma o se rechaza una acción de CoCo, en el chat y en WhatsApp.
 * Puro: el mismo texto vale en los dos canales.
 */

const APPROVE = new Set([
    'aprobar',
    'apruebo',
    'confirmar',
    'confirmo',
    'si, apruebo',
    'si, confirmo',
    'sí, apruebo',
    'sí, confirmo',
]);

const REJECT = new Set([
    'rechazar',
    'rechazo',
    'cancelar',
    'cancelo',
    'no, rechazar',
    'no, cancelo',
]);

export type CoCoTextDecision = 'approved' | 'rejected';

export function interpretCoCoConfirmation(message: string): CoCoTextDecision | undefined {
    const normalized = message.trim().toLocaleLowerCase('es-CL').replace(/[.!]+$/g, '');
    if (APPROVE.has(normalized)) return 'approved';
    if (REJECT.has(normalized)) return 'rejected';
    return undefined;
}

export function whatsappPendingReply(lines: string[]): string {
    const list = lines.filter(Boolean).map(line => `- ${line}`).join('\n');
    return [
        'Necesito tu confirmación antes de continuar.',
        list,
        'Responde apruebo o confirmo para hacerlo. Responde rechazo o cancelo para no hacerlo.',
    ].filter(Boolean).join('\n\n');
}
