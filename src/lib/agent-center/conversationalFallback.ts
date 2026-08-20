/**
 * conversationalFallback.ts — Un cerebro, no dos.
 *
 * El Agent Center es un planificador de acciones: mapea la solicitud a una
 * AgentAction staged para aprobar. Cuando NO reconoce una accion concreta cae en
 * `clarify_intent`, que historicamente devolvia un stonewall generico ("aclara
 * que deseas consultar o ejecutar") incluso ante un saludo o un "que puedes
 * hacer". CoCo (askCoCo) ya es un agente conversacional completo, con el mismo
 * prompt maestro, tools y conocimiento del condominio. En vez de mantener dos
 * cerebros, delegamos esos casos en CoCo para dar una respuesta real.
 *
 * Memoria: se usa una sesion propia del Agent Center (separada del chat) para dar
 * continuidad a los turnos conversacionales ("y tambien para junio"). Solo se
 * persisten turnos LIMPIOS: si CoCo deja una accion pendiente (mutacion), ese
 * tool_use sin resolver NO se guarda, porque arrastrarlo bloquearia el proximo
 * mensaje. La ejecucion de esas mutaciones desde el Agent Center llega en la
 * etapa del puente (pendingActions -> tarjeta de aprobacion). Hasta entonces, el
 * texto de CoCo ya guia al usuario. Si CoCo no esta disponible, se conserva la
 * clarificacion original como red de seguridad.
 */

import { askCoCo } from '@/lib/coco/agent';
import { getSession, saveSession } from '@/lib/coco/session-store';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

const AGENT_COCO_SESSION_PREFIX = 'agentcoco:web:';

export async function conversationalCoCoReply(message: string, profile: AgentProfile): Promise<string> {
    const sessionKey = `${AGENT_COCO_SESSION_PREFIX}${profile.id}`;
    try {
        const session = await getSession(sessionKey);
        const response = await askCoCo(message, session, {
            user_id: profile.id,
            name: profile.name || profile.email || 'Administracion',
            role: profile.role,
            unit_id: profile.unit_id || '',
            community_id: profile.community_id || '',
            currentPage: '/agent-center',
            channel: 'web',
        });
        if (!(response.pendingActions && response.pendingActions.length)) {
            await saveSession(sessionKey, {
                conversation: response.updatedHistory,
                user_context: {
                    user_id: profile.id,
                    role: profile.role,
                    community_id: profile.community_id ?? undefined,
                    channel: 'agent-center',
                },
            }).catch(() => undefined);
        }
        return (response.reply || '').trim();
    } catch (error) {
        console.warn('[AgentCenter] CoCo conversational fallback failed', error);
        return '';
    }
}

/**
 * Si la accion resuelta es una clarificacion generica (el router no reconocio una
 * accion), la reemplaza por una respuesta conversacional real de CoCo. Cualquier
 * otra accion (cobranza, comunicados, reservas, etc.) pasa intacta a su flujo de
 * propuesta -> aprobacion -> bitacora. La tarjeta curada de capacidades
 * (args.capabilities) tampoco se sobreescribe: es instantanea y no depende del LLM.
 */
export async function upgradeClarificationWithCoCo(
    message: string,
    profile: AgentProfile,
    action: AgentAction,
): Promise<AgentAction> {
    if (action.toolName !== 'clarify_intent') return action;
    if (Boolean(action.args.capabilities)) return action;
    const reply = await conversationalCoCoReply(message, profile);
    if (!reply) return action;
    return { ...action, title: 'CoCo', summary: reply };
}
