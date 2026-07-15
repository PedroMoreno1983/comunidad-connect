const READ_ONLY_HINTS = [
    'dime',
    'indica',
    'consulta',
    'consultar',
    'quiero saber',
    'necesito saber',
    'revisa si',
    'verifica si',
    'cuanto debe',
    'debe algo',
    'adeuda',
    'saldo',
];

const MUTATION_HINTS = [
    'crea',
    'crear',
    'registra',
    'registrar',
    'publica',
    'publicar',
    'reservar',
    'envia',
    'enviar',
    'abre un ticket',
    'abrir un ticket',
    'solicita un servicio',
    'prepara un comunicado',
];

export function normalizeIntentText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

export function isIndividualDebtQuery(message: string) {
    const normalized = normalizeIntentText(message);
    const collectionWorkflow = /\b(morosos|cobranza|cobros masivos|notificar deudores)\b/.test(normalized);
    if (collectionWorkflow) return false;

    return /\b(debe algo|adeuda|deuda de|saldo de|saldo pendiente de|gastos pendientes de|pagos pendientes de)\b/.test(normalized)
        || /\b(residente|vecina|vecino|departamento|depto|dpto|unidad)\b.{1,90}\b(debe|adeuda|deuda|tiene deuda|tiene pagos? pendientes?)\b/.test(normalized)
        || /\b(?:cuanto\s+)?(?:debe|adeuda|tiene deuda|tiene pagos? pendientes?)\b.{1,90}\b(?:el|la)?\s*(?:departamento|depto|dpto|unidad)\b/.test(normalized);
}

export function extractResidentQuery(message: string) {
    const patterns = [
        /(?:residente|vecina|vecino)\s+([\p{L}][\p{L}\s.'-]{1,78}?)(?=\s+(?:debe|adeuda|tiene|mantiene|esta)|[?,.;!]|$)/iu,
        /(?:deuda|saldo|morosidad|gastos? pendientes?|pagos? pendientes?)\s+(?:de|del|de la)\s+([\p{L}][\p{L}\s.'-]{1,78}?)(?=[?,.;!]|$)/iu,
    ];

    for (const pattern of patterns) {
        const match = message.match(pattern);
        const candidate = match?.[1]?.replace(/\s+/g, ' ').trim();
        if (candidate) return candidate;
    }
    return '';
}

export function extractUnitNumber(message: string) {
    const match = message.match(/\b(?:departamento|depto|dpto|unidad)\.?\s*(?:n(?:[°ºo]|umero)?\.?\s*)?#?\s*([\p{L}\d][\p{L}\d-]{0,14})\b/iu);
    return match?.[1]?.trim() || '';
}

export function looksReadOnlyRequest(message: string) {
    const normalized = normalizeIntentText(message);
    const hasReadHint = READ_ONLY_HINTS.some(hint => normalized.includes(hint)) || normalized.endsWith('?');
    const hasMutationHint = MUTATION_HINTS.some(hint => normalized.includes(hint));
    return hasReadHint && !hasMutationHint;
}
