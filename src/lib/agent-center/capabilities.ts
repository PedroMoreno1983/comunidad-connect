/**
 * capabilities.ts — Respuesta de capacidades de primer nivel.
 *
 * Ante un saludo o una pregunta meta ("hola", "que puedes hacer", "en que me
 * ayudas"), el Agent Center caia antes en el stonewall generico. Aqui detectamos
 * ese caso y devolvemos, de forma INSTANTANEA y sin depender del LLM (funciona
 * aunque la IA este caida), una tarjeta curada con lo que realmente sabe hacer,
 * derivada de los playbooks reales del sistema para no inventar nada.
 */

import { AGENT_PLAYBOOKS, type AgentAction } from '@/lib/agent-center/domain';

function normalize(value: string): string {
    return value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[¿?¡!.,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const GREETING_RE = /^(hola+|buenas|buenos dias|buenas tardes|buenas noches|hey+|hi|hello|que tal|saludos|buenos)\b/;

// Frases meta que preguntan por las capacidades. Se exige que aparezcan como tal
// para no confundir "ayuda con el cobro del depto 5" (operativo) con "ayuda".
const CAPABILITY_PHRASES = [
    'que puedes hacer',
    'que sabes hacer',
    'que puede hacer',
    'que haces',
    'que hace coco',
    'en que me ayudas',
    'en que me puedes ayudar',
    'en que puedes ayudar',
    'en que ayudas',
    'para que sirves',
    'para que sirve esto',
    'para que sirve el agent center',
    'como funciona',
    'como funcionas',
    'que es esto',
    'que es el agent center',
    'cuales son tus funciones',
    'cuales son mis opciones',
    'que opciones tengo',
    'muestrame las opciones',
    'que puedo pedirte',
    'que te puedo pedir',
];

/**
 * True si el mensaje es un saludo o una pregunta por capacidades — casos meta
 * que merecen la tarjeta curada, no una accion ni el fallback conversacional.
 */
export function isCapabilityOrGreeting(message: string): boolean {
    const text = normalize(message);
    if (!text) return false;
    // Saludo corto y sin una peticion operativa pegada.
    if (GREETING_RE.test(text) && text.split(' ').length <= 4) return true;
    if (text === 'ayuda' || text === 'help' || text === 'menu' || text === 'opciones') return true;
    return CAPABILITY_PHRASES.some(phrase => text.includes(phrase));
}

/** Tarjeta curada de capacidades, construida desde los playbooks reales. */
export function buildCapabilitiesAction(message: string): AgentAction {
    const playbookLines = AGENT_PLAYBOOKS
        .map(playbook => `• ${playbook.name}: ${playbook.description}`)
        .join('\n');

    const summary = [
        'Soy CoCo en el centro de operaciones. Reviso los datos autorizados del edificio y te dejo acciones listas para aprobar; nada se ejecuta hasta que tú confirmas, y todo queda en la bitácora.',
        '',
        'Puedo preparar estos flujos:',
        playbookLines,
        '',
        'También respondo consultas al instante: morosidad, tickets abiertos, reservas, estado general del edificio, o cualquier pregunta cruzando los datos de la comunidad.',
        '',
        'Dime qué necesitas —por ejemplo: "prepara la cobranza del mes", "publica un comunicado de corte de agua" o "¿cómo viene la morosidad?".',
    ].join('\n');

    return {
        agentKey: 'community',
        toolName: 'clarify_intent',
        // El flag `capabilities` marca esta tarjeta como final: el fallback
        // conversacional de CoCo no debe sobrescribirla (es curada e instantanea).
        args: { requestedText: message.slice(0, 500), capabilities: true },
        requiresConfirmation: false,
        title: 'Esto es lo que puedo preparar para ti',
        summary,
        targetHref: '/agent-center',
    };
}
