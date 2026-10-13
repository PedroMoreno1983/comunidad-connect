import Anthropic from '@anthropic-ai/sdk';
import { anthropicModelFor } from '@/lib/ai/modelRouter';
import { enforceAiBudget, estimateAiCostCents, recordAiUsage } from '@/lib/ai/budget';
import { practicePeersForRole } from './tutorGuidance';
import type { TrainingChatMessage, TrainingSlide } from '@/lib/types';

// Un turno del aula en una sola llamada: la tutora responde y, solo si aporta,
// uno o dos compañeros de práctica intervienen. Antes eran tres llamadas en
// serie a Gemini: la tutora se cortaba a mitad de frase (el razonamiento
// interno consumía el tope de salida) y los compañeros no veían el mismo
// contexto, así que cada uno hablaba de otra cosa.

const MAX_HISTORY = 12;
const MAX_PEERS = 2;
const TASK = 'training.classroom' as const;

export interface ClassroomCourse {
    title: string;
    description: string | null;
    objectives: string[];
    slides: TrainingSlide[];
}

export interface ClassroomTurnInput {
    role: 'admin' | 'concierge';
    course: ClassroomCourse;
    section: TrainingSlide | null;
    message: string;
    history: TrainingChatMessage[];
    learnerName?: string;
    communityId?: string;
    userId?: string;
}

/** Respuestas que solo acusan recibo: no merecen que hable todo el grupo. */
export function isAcknowledgement(message: string) {
    return /^(ok(ay)?|ya|s[ií]|dale|listo|gracias|entendido|perfecto|bien|vale|claro)[\s.!]*$/i.test(message.trim());
}

function courseDocument(course: ClassroomCourse) {
    const sections = course.slides.map((slide, index) => [
        `### Sección ${index + 1}: ${slide.title}`,
        slide.lead ? `Idea central: ${slide.lead}` : '',
        ...(slide.bullets || []).map(item => `- ${item}`),
        ...(slide.role_cards || []).map(card => `- ${card.role}: ${card.responsibility}. ${card.action}`),
        slide.notes ? `Nota para la tutora: ${slide.notes}` : '',
    ].filter(Boolean).join('\n'));
    return [
        `# ${course.title}`,
        course.description || '',
        course.objectives.length ? `Objetivos:\n${course.objectives.map(item => `- ${item}`).join('\n')}` : '',
        ...sections,
    ].filter(Boolean).join('\n\n');
}

/** Instrucciones estables por curso y rol: van primero para que el prefijo quede en caché. */
export function classroomSystemPrompt(role: 'admin' | 'concierge', course: ClassroomCourse) {
    const audience = role === 'admin' ? 'administración' : 'conserjería';
    const peers = practicePeersForRole(role);
    return [
        `Eres la Tutora CoCo y capacitas al equipo de ${audience} de un condominio en Chile. Estás en un aula donde la presentación del curso ya está proyectada; quien aprende ve la sección abierta y te escribe en el chat.`,
        '',
        'Fuente de verdad: el curso que está más abajo. Responde solo desde ese contenido. Si la pregunta va más allá del curso, di que el curso no lo cubre, sin afirmar qué dice o no dice la ley, cuenta qué sí cubre el curso y sugiere consultarlo con la administración o una asesoría. Nunca inventes artículos, leyes, plazos, montos ni sanciones.',
        'Prioridad ante peligro inmediato: si se describen agua junto a electricidad, humo, gas, lesiones u otro riesgo actual para personas, primero indica alejarse o aislar el sector desde un lugar seguro y activar de inmediato el contacto de emergencia previsto por el edificio. No sugieras esperar a completar registros, identificar la causa o recibir autorización para dar ese aviso. No indiques manipular instalaciones. El registro se hace en paralelo si otra persona puede hacerlo, o en cuanto sea seguro.',
        '',
        `Quien aprende trabaja en ${audience}. Varias secciones narran escenas de otro rol: responde siempre desde lo que le toca hacer a ${audience} en esa escena, no desde lo que hace el otro rol.`,
        '',
        'Cómo responde la tutora:',
        '- Primero responde la pregunta de forma directa y aplicable, apoyándote en el criterio de la sección abierta. Si existe peligro inmediato, da primero la acción de protección y aviso; deja la pregunta pedagógica para el final.',
        '- Luego cierra con una sola pregunta que obligue a aplicar ese criterio a un caso del trabajo.',
        '- Máximo 70 palabras, de tú, sin títulos ni listas. Hablas de ti en femenino. Para quien aprende usa formas sin género ("en administración", "en tu turno"), nunca "administradora", "administrador", "conserje" ni adjetivos con género. No saludes ni nombres a los compañeros.',
        '',
        'Compañeros de práctica (intervienen solo si aportan algo; si no, la lista va vacía):',
        ...peers.map(peer => `- ${peer.id} — ${peer.name}: ${peer.description} ${peer.prompt}`),
        `- Como máximo ${MAX_PEERS}, cada uno con una o dos oraciones completas en su propia voz, respetuosos y sobre la misma sección.`,
        '- Aportan un caso concreto del turno que pone a prueba el criterio, o una duda honesta. No repiten lo que dijo la tutora, no dan la clase, no la contradicen y no citan normas. Nunca sugieren retrasar un aviso de emergencia para registrar o investigar.',
        '- Si quien aprende solo acusa recibo ("ok", "gracias", "sí"), no interviene ningún compañero y la tutora propone un caso para practicar.',
        '',
        '<curso>',
        courseDocument(course),
        '</curso>',
    ].join('\n');
}

export function classroomOutputSchema(role: 'admin' | 'concierge') {
    return {
        type: 'object',
        additionalProperties: false,
        required: ['tutor', 'peers'],
        properties: {
            tutor: { type: 'string', description: 'Mensaje de la tutora.' },
            peers: {
                type: 'array',
                description: 'Intervenciones de compañeros; vacía si no aportan.',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['peer_id', 'text'],
                    properties: {
                        peer_id: { type: 'string', enum: practicePeersForRole(role).map(peer => peer.id) },
                        text: { type: 'string' },
                    },
                },
            },
        },
    } as const;
}

/** Historial del chat como turnos alternados; lo que dijo el grupo va como un solo turno del asistente. */
function conversation(input: ClassroomTurnInput): Anthropic.MessageParam[] {
    const turns: Anthropic.MessageParam[] = [];
    const recent = input.history.filter(item => item.role !== 'system').slice(-MAX_HISTORY);
    for (const item of recent) {
        const role = item.role === 'user' ? 'user' : 'assistant';
        const text = item.role === 'user' ? item.text : `${item.role === 'tutor' ? 'Tutora' : item.name || 'Compañero'}: ${item.text}`;
        const last = turns[turns.length - 1];
        if (last && last.role === role) last.content = `${last.content as string}\n${text}`;
        else turns.push({ role, content: text });
    }
    while (turns.length && turns[0].role !== 'user') turns.shift();

    const section = input.section;
    const context = [
        section
            ? `Sección abierta: «${section.title}».${section.lead ? ` ${section.lead}` : ''}`
            : 'No se sabe qué sección está abierta; responde desde el curso completo.',
        `Rol de quien aprende: ${input.role === 'admin' ? 'administración' : 'conserjería'}.`,
        input.learnerName ? `Quien aprende se llama ${input.learnerName}.` : '',
        isAcknowledgement(input.message) ? 'Este mensaje solo acusa recibo.' : '',
        `Mensaje: ${input.message}`,
    ].filter(Boolean).join('\n');
    const last = turns[turns.length - 1];
    if (last && last.role === 'user') last.content = context;
    else turns.push({ role: 'user', content: context });
    return turns;
}

export async function runClassroomTurn(input: ClassroomTurnInput): Promise<TrainingChatMessage[]> {
    const model = anthropicModelFor(TASK);
    const peers = practicePeersForRole(input.role);
    const system = classroomSystemPrompt(input.role, input.course);
    const messages = conversation(input);
    const budget = { communityId: input.communityId, userId: input.userId, role: input.role, module: TASK, actionType: 'chat' as const };

    await enforceAiBudget({
        ...budget,
        provider: 'anthropic',
        model,
        estimatedPromptTokens: Math.ceil((system.length + JSON.stringify(messages).length) / 3.5),
        estimatedCompletionTokens: 700,
    });

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 1 });
    const startedAt = Date.now();
    const response = await client.messages.create({
        model,
        max_tokens: 4000,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: classroomOutputSchema(input.role) } },
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
    });

    const promptTokens = response.usage.input_tokens + (response.usage.cache_read_input_tokens || 0) + (response.usage.cache_creation_input_tokens || 0);
    await recordAiUsage({
        ...budget,
        provider: 'anthropic',
        model,
        promptTokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: promptTokens + response.usage.output_tokens,
        estimatedCostCents: estimateAiCostCents({ provider: 'anthropic', model, promptTokens: response.usage.input_tokens, completionTokens: response.usage.output_tokens }),
        status: 'success',
        metadata: { latencyMs: Date.now() - startedAt, cacheRead: response.usage.cache_read_input_tokens || 0 },
    });

    if (response.stop_reason !== 'end_turn') throw new Error(`Turno del aula incompleto (${response.stop_reason}).`);
    const text = response.content.find(block => block.type === 'text');
    if (!text || text.type !== 'text') throw new Error('El aula no devolvió texto.');
    const parsed = JSON.parse(text.text) as { tutor?: string; peers?: Array<{ peer_id?: string; text?: string }> };
    const tutor = parsed.tutor?.trim();
    if (!tutor) throw new Error('La tutora no respondió.');

    const now = Date.now();
    const out: TrainingChatMessage[] = [{ id: `tutor-${now}`, role: 'tutor', text: tutor }];
    const seen = new Set<string>();
    for (const item of parsed.peers || []) {
        const peer = peers.find(candidate => candidate.id === item.peer_id);
        const peerText = item.text?.trim();
        if (!peer || !peerText || seen.has(peer.id) || seen.size >= MAX_PEERS || isAcknowledgement(input.message)) continue;
        seen.add(peer.id);
        out.push({ id: `classmate-${peer.id}-${now}`, role: 'classmate', name: peer.name, text: peerText });
    }
    return out;
}
