/**
 * Textos de habilidad para votar. Convención del proyecto: la convivencia
 * construye comunidad. Sin montos, sin lenguaje de deudor ni amenazas, sin
 * exponer a nadie y siempre con una salida (estado de cuenta privado o convenio).
 * Módulo puro: lo usan el servidor, la UI y los tests de privacidad.
 */

export const ELIGIBILITY_LEGAL_BASIS = 'Ley 21.442, arts. 2 N°13, 6 y 15; DS 7 de 2025, arts. 9 y 14';

/** Rutas de las dos salidas que siempre se ofrecen. */
export const STATEMENT_LINK = '/resident/finances';
export const ASSEMBLY_LINK = '/votaciones/asambleas';

export const MY_STATUS_COPY = {
    eligible: {
        title: 'Puedes votar',
        body: 'Tu unidad está habilitada para votar en esta asamblea. ¡Te esperamos!',
    },
    notEligible: {
        title: 'Para votar, ponte al día o conversa un convenio',
        body: 'Puedes asistir y dar tu opinión en la asamblea. Para votar, la ley pide estar al día con la comunidad o tener un convenio vigente. Si te pones al día, o firmas un convenio y pagas su primera cuota antes de la sesión, quedas habilitado. Revisa tu estado de cuenta privado o pide conversar un convenio, con total reserva.',
    },
    estimate: 'Estado estimado hoy. El definitivo sale del certificado de habilidad que emite el administrador el día de la sesión.',
} as const;

/** Aviso privado en la app, 7 días antes, solo a quien no está habilitado. */
export function eligibilityNoticeCopy(input: { assemblyTitle: string; sessionDate: string }) {
    return {
        title: 'Tu voz cuenta en la próxima asamblea',
        body: `El ${input.sessionDate} es la asamblea «${input.assemblyTitle}» y nos encantaría contar contigo: puedes asistir y opinar. Para votar, la ley pide estar al día con la comunidad o tener un convenio vigente. Si lo necesitas, revisa tu estado de cuenta privado o pide conversar un convenio, con total reserva: si te pones al día o firmas un convenio antes de la sesión, quedas habilitado para votar.`,
        link: ASSEMBLY_LINK,
    };
}

/** Cuando una unidad no habilitada intenta votar: el voto no se registra. */
export const VOTE_NOT_RECORDED = {
    self: 'Tu voto no quedó registrado: para votar, la unidad debe estar al día o con un convenio vigente a la fecha de corte del certificado. Tu voz sigue contando en la conversación. Si quieres, revisa tu estado de cuenta privado o pide conversar un convenio, con total reserva.',
    staff: 'Esta unidad asiste con voz: no figura habilitada para votar en el certificado de habilidad, así que su voto no se registra.',
} as const;

/** Etiqueta que ve solo quien conduce, en la acreditación. */
export const CONDUCTOR_BADGE = 'No habilitada para votar (asiste con voz)';

/** Confirmación al residente que pide conversar un convenio. */
export const AGREEMENT_REQUEST_SENT = 'Listo: le avisamos a administración que quieres conversar un convenio. Te contactarán con total reserva.';

export function agreementRequestAdminCopy(unitLabel: string, assemblyTitle: string) {
    return {
        title: 'Un vecino quiere conversar un convenio',
        body: `La unidad ${unitLabel} pidió conversar un convenio antes de la asamblea «${assemblyTitle}». Contáctala con reserva; si se firma y se paga la primera cuota antes de la sesión, queda habilitada para votar.`,
        link: '/admin/finanzas/convenios',
    };
}

const DEBTOR_LANGUAGE = /\b(moros[oa]s?|morosidad|deudor(es|a|as)?|deuda(s)?|impag[oa]s?|cobranza judicial|demanda|corte de (luz|agua|gas|servicios?|suministro)|suspensi[oó]n|multa(s)?|sanci[oó]n)/i;
// Cifras con separador de miles; no cuentan "Ley 21.442" ni los derechos en ‰.
const AMOUNT = /\$\s?\d|\bCLP\b|\bUF\b|(?<!Ley\s)(?<![\d.])\d{1,3}(\.\d{3})+(?![\d.]|\s*‰)/;

/**
 * ¿El texto respeta la convención? Sin montos ni lenguaje de deudor y, si se
 * pasan etiquetas de unidades, sin nombrar ninguna. Se usa en los tests del
 * acta, el panel compartido y el aviso.
 */
export function checkEligibilityPrivacy(text: string, unitLabels: string[] = []): string[] {
    const problems: string[] = [];
    if (DEBTOR_LANGUAGE.test(text)) problems.push('lenguaje de deudor');
    if (AMOUNT.test(text)) problems.push('montos');
    for (const label of unitLabels) {
        if (!label) continue;
        const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        if (new RegExp(`(^|[^\\w-])${escaped}([^\\w-]|$)`).test(text)) problems.push(`unidad ${label}`);
    }
    return problems;
}
