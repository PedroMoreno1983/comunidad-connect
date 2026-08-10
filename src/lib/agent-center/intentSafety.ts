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
    'cuantos',
    'cuantas',
    'muestrame',
    'estado de',
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

/**
 * "Armar el gasto común del mes" vs "¿cuánto debe el 1204?".
 *
 * Son intenciones opuestas que comparten la palabra "gasto": una abarca a TODAS
 * las unidades y por eso no lleva departamento, la otra es sobre una sola. Sin
 * distinguirlas, el Agent Center pedía un residente para una operación que no
 * tiene uno.
 */
export function isMonthlyBillingRequest(message: string) {
    const normalized = normalizeIntentText(message);
    const aboutBilling = /\b(gasto|gastos)\s+(comun|comunes)\b/.test(normalized)
        || /\bprorrate/.test(normalized)
        || /\begreso/.test(normalized);
    const wantsToBuild = /\b(arma|armar|emite|emitir|genera|generar|calcula|calcular|prepara|preparar|carga|cargar|hace|hacer)\b/.test(normalized);
    return aboutBilling && wantsToBuild;
}

/**
 * Preguntas agregadas sobre el edificio ("quien debe gastos comunes", "como
 * viene la morosidad") no tienen un residente al que apuntar, y por eso caían
 * en el catch-all de finanzas, que pedía justamente ese dato.
 * `get_community_snapshot` ya existía como herramienta de solo lectura: el
 * vocabulario era demasiado estrecho para llegar a ella.
 *
 * `isMonthlyBillingRequest` se descarta primero porque "puedes armar el gasto
 * comun de julio?" comparte vocabulario con una pregunta pero es una emisión.
 * El llamador debe resolver antes `isIndividualDebtQuery`: lo específico
 * (la deuda de una unidad) gana sobre lo agregado.
 */
const ANALYTIC_SUBJECT = /\b(resumen|estado|situacion|indicadores|cuanto|cuanta|cuantos|cuantas|total|moroso|morosos|morosidad|deuda|deudas|deudor|deudores|impago|impagos|saldo|saldos|gastos? comunes?|pagos? pendientes?|ticket|tickets|reserva|reservas|residente|residentes|ocupacion)\b/;

export function looksLikeAnalyticQuestion(message: string) {
    if (!looksReadOnlyRequest(message) || isMonthlyBillingRequest(message)) return false;
    return ANALYTIC_SUBJECT.test(normalizeIntentText(message));
}

/**
 * Los términos son prefijos, no palabras completas: la versión anterior cerraba
 * cada alternativa con `\b` y por eso "moros" nunca matcheaba "morosos" ni
 * "gasto" a "gastos". El foco caía a 'all' en casi toda pregunta real.
 */
export function analyticFocus(message: string): 'finance' | 'maintenance' | 'community' | 'all' {
    const normalized = normalizeIntentText(message);
    if (/\b(moros|deuda|deudor|pago|impago|saldo|finanz|gasto)/.test(normalized)) return 'finance';
    if (/\b(ticket|mantencion|mantenimiento|falla|proveedor)/.test(normalized)) return 'maintenance';
    if (/\b(reserva|residente|comunidad|vecin)/.test(normalized)) return 'community';
    return 'all';
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

// Solo al inicio de la frase: "quien debe gastos comunes" es una pregunta,
// "a quien le envio el comunicado" es una instruccion que la menciona.
const INTERROGATIVE_OPENER = /^(?:quien|quienes|cual|cuales|cuanto|cuanta|cuantos|cuantas|que|como|donde)\b/;

export function looksReadOnlyRequest(message: string) {
    const normalized = normalizeIntentText(message);
    const hasReadHint = READ_ONLY_HINTS.some(hint => normalized.includes(hint))
        || normalized.endsWith('?')
        || INTERROGATIVE_OPENER.test(normalized);
    const hasMutationHint = MUTATION_HINTS.some(hint => normalized.includes(hint));
    return hasReadHint && !hasMutationHint;
}
