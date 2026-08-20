/**
 * conversationalFallback.ts — Un cerebro, no dos.
 *
 * El Agent Center es un planificador de acciones: mapea la solicitud a una
 * AgentAction staged para aprobar. Cuando NO reconoce una accion concreta cae en
 * `clarify_intent`, que historicamente devolvia un stonewall generico. CoCo
 * (askCoCo) ya es un agente conversacional completo, con el mismo prompt maestro,
 * tools y conocimiento del condominio. En vez de mantener dos cerebros, delegamos
 * esos casos en CoCo:
 *
 * - Si CoCo responde conversacionalmente -> se muestra su respuesta real.
 * - Si CoCo propone una mutacion (pendingActions) -> se envuelve en una accion
 *   `coco_action` que entra al flujo de propuesta -> aprobacion -> bitacora del
 *   Agent Center. Al aprobar, se reanuda la sesion de CoCo con la confirmacion y
 *   CoCo ejecuta la accion con sus propias tools y guardas.
 *
 * Memoria y sesion: se usa una sesion propia del Agent Center (separada del chat).
 * Se persiste SIEMPRE la conversacion devuelta por askCoCo: los turnos limpios dan
 * continuidad ("y tambien para junio"); los turnos con accion pendiente deben
 * persistirse para que la aprobacion pueda reanudar y ejecutar. La clave de sesion
 * se deriva del perfil autenticado y NUNCA se toma del cliente. Si CoCo no esta
 * disponible, se conserva la clarificacion original como red de seguridad.
 */

import { askCoCo, type CoCoPendingAction } from '@/lib/coco/agent';
import { getSession, saveSession } from '@/lib/coco/session-store';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

const AGENT_COCO_SESSION_PREFIX = 'agentcoco:web:';

/** Clave de sesion derivada del perfil autenticado. Nunca se toma del cliente. */
function agentCoCoSessionKey(profile: AgentProfile): string {
    return `${AGENT_COCO_SESSION_PREFIX}${profile.id}`;
}

function cocoUserContext(profile: AgentProfile) {
    return {
        user_id: profile.id,
        name: profile.name || profile.email || 'Administracion',
        role: profile.role,
        unit_id: profile.unit_id || '',
        community_id: profile.community_id || '',
        currentPage: '/agent-center',
        channel: 'web' as const,
    };
}

function persistSession(sessionKey: string, profile: AgentProfile, conversation: Awaited<ReturnType<typeof askCoCo>>['updatedHistory']) {
    return saveSession(sessionKey, {
        conversation,
        user_context: {
            user_id: profile.id,
            role: profile.role,
            community_id: profile.community_id ?? undefined,
            channel: 'agent-center',
        },
    }).catch(() => undefined);
}

export interface CoCoTurn {
    reply: string;
    pending: CoCoPendingAction[];
}

/**
 * Un turno con el cerebro de CoCo usando la sesion del Agent Center. Persiste la
 * conversacion resultante (memoria + posibilidad de reanudar una accion pendiente).
 */
export async function runCoCoTurn(message: string, profile: AgentProfile): Promise<CoCoTurn> {
    const sessionKey = agentCoCoSessionKey(profile);
    const session = await getSession(sessionKey);
    const response = await askCoCo(message, session, cocoUserContext(profile));
    await persistSession(sessionKey, profile, response.updatedHistory);
    return {
        reply: (response.reply || '').trim(),
        pending: response.pendingActions ?? [],
    };
}

/** Respuesta conversacional (solo texto). Se conserva por compatibilidad. */
export async function conversationalCoCoReply(message: string, profile: AgentProfile): Promise<string> {
    try {
        const turn = await runCoCoTurn(message, profile);
        return turn.reply;
    } catch (error) {
        console.warn('[AgentCenter] CoCo conversational fallback failed', error);
        return '';
    }
}

/** Envuelve la(s) accion(es) pendiente(s) de CoCo en una AgentAction aprobable. */
export function buildCoCoAction(turn: CoCoTurn): AgentAction {
    const first = turn.pending[0];
    const summary = [
        turn.reply,
        ...turn.pending.map(step => `• ${step.title}: ${step.summary}`),
    ].filter(Boolean).join('\n');

    return {
        agentKey: 'community',
        toolName: 'coco_action',
        args: {
            // La sesion NO se guarda aqui: se deriva del perfil al ejecutar.
            pending: turn.pending.map(step => ({
                toolUseId: step.toolUseId,
                name: step.name,
                title: step.title,
                summary: step.summary,
                input: step.input,
            })),
            reply: turn.reply,
        },
        requiresConfirmation: true,
        title: first?.title || 'Accion propuesta por CoCo',
        summary: summary || 'CoCo preparo una accion para tu aprobacion.',
        targetHref: '/agent-center',
    };
}

/**
 * Si la accion resuelta es una clarificacion generica (el router no reconocio una
 * accion), delega en CoCo. Si CoCo propone una mutacion, devuelve una `coco_action`
 * aprobable; si solo responde, reemplaza el texto. Las acciones ya reconocidas y
 * la tarjeta curada de capacidades (args.capabilities) pasan intactas.
 */
export async function upgradeClarificationWithCoCo(
    message: string,
    profile: AgentProfile,
    action: AgentAction,
): Promise<AgentAction> {
    if (action.toolName !== 'clarify_intent') return action;
    if (Boolean(action.args.capabilities)) return action;
    try {
        const turn = await runCoCoTurn(message, profile);
        if (turn.pending.length > 0) return buildCoCoAction(turn);
        if (turn.reply) return { ...action, title: 'CoCo', summary: turn.reply };
        return action;
    } catch (error) {
        console.warn('[AgentCenter] CoCo conversational fallback failed', error);
        return action;
    }
}

function resolutionsFromAction(action: AgentAction, decision: 'approved' | 'rejected'): Record<string, 'approved' | 'rejected'> {
    const pending = Array.isArray(action.args.pending) ? action.args.pending as Array<{ toolUseId?: unknown }> : [];
    const resolutions: Record<string, 'approved' | 'rejected'> = {};
    for (const step of pending) {
        if (typeof step?.toolUseId === 'string' && step.toolUseId) resolutions[step.toolUseId] = decision;
    }
    return resolutions;
}

/**
 * Ejecuta una `coco_action` aprobada: reanuda la sesion de CoCo (derivada del
 * perfil, no del cliente) con la confirmacion humana. CoCo valida que los
 * tool_use pendientes coincidan y ejecuta con sus propias guardas. Devuelve el
 * resultado en el formato que espera la bitacora del Agent Center.
 */
export async function resumeCoCoAction(action: AgentAction, profile: AgentProfile) {
    const sessionKey = agentCoCoSessionKey(profile);
    const session = await getSession(sessionKey);
    if (!session) {
        throw new Error('La propuesta de CoCo expiro o ya fue resuelta. Vuelve a pedirsela.');
    }
    const resolutions = resolutionsFromAction(action, 'approved');
    if (!Object.keys(resolutions).length) {
        throw new Error('La accion de CoCo no tiene pasos que confirmar.');
    }
    const response = await askCoCo('', session, cocoUserContext(profile), { resolutions });
    await persistSession(sessionKey, profile, response.updatedHistory);
    return {
        entityType: 'coco_action',
        entityId: null,
        title: 'Accion ejecutada por CoCo',
        message: (response.reply || 'Listo, ejecute la accion aprobada.').trim(),
        data: { steps: action.args.pending },
    };
}

/**
 * Cancela una `coco_action`: reanuda la sesion de CoCo con rechazo para limpiar el
 * tool_use pendiente y no dejarlo bloqueando el proximo mensaje. Best-effort.
 */
export async function rejectCoCoAction(action: AgentAction, profile: AgentProfile): Promise<void> {
    try {
        const sessionKey = agentCoCoSessionKey(profile);
        const session = await getSession(sessionKey);
        if (!session) return;
        const resolutions = resolutionsFromAction(action, 'rejected');
        if (!Object.keys(resolutions).length) return;
        const response = await askCoCo('', session, cocoUserContext(profile), { resolutions });
        await persistSession(sessionKey, profile, response.updatedHistory);
    } catch (error) {
        console.warn('[AgentCenter] rejectCoCoAction failed', error);
    }
}
