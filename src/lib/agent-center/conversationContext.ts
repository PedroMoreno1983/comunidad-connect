import { extractUnitNumber, normalizeIntentText } from '@/lib/agent-center/intentSafety';

export interface ConversationTurn {
    role: 'user' | 'assistant';
    content: string;
}

/**
 * Memoria del fallback determinístico del Agent Center.
 *
 * El historial solo llegaba al planner de Claude, así que cuando este no corría
 * la conversación perdía el hilo: tras "quien debe gastos comunes?", responder
 * "departamento 1204" se evaluaba como si fuera el primer mensaje del chat y el
 * agente volvía a pedir una aclaración sobre el dato que acababa de recibir.
 */
function lastTurn(history: ConversationTurn[], role: ConversationTurn['role']) {
    for (let index = history.length - 1; index >= 0; index -= 1) {
        if (history[index].role === role) return history[index];
    }
    return null;
}

/** ¿El turno anterior del agente pidió un departamento o un residente? */
export function askedForUnitOrResident(history: ConversationTurn[]) {
    const assistant = lastTurn(history, 'assistant');
    if (!assistant) return false;
    return /\b(departamento|depto|dpto|unidad|residente)\b/.test(normalizeIntentText(assistant.content));
}

/**
 * Un turno que solo aporta el dato pedido ("1204", o "depaetamento 1204" con
 * typo) se reescribe como la pregunta anterior más ese dato normalizado. La
 * normalización a "departamento N" solo ocurre si el agente pidió justamente
 * eso, para no confundir un monto con una unidad.
 */
export function enrichMessageWithHistory(message: string, history: ConversationTurn[]): string {
    const recent = history.slice(-4);
    const previousQuestion = lastTurn(recent, 'user')?.content.trim();
    if (!previousQuestion) return message;

    let supplement = message;
    if (!extractUnitNumber(message) && askedForUnitOrResident(recent)) {
        const bareNumber = normalizeIntentText(message).match(/^\D{0,20}(\d{1,5})\D{0,10}$/);
        if (bareNumber) supplement = `departamento ${bareNumber[1]}`;
    }

    return `${previousQuestion} ${supplement}`.trim().slice(0, 1200);
}
