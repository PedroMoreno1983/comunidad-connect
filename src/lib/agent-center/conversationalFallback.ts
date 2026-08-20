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
 * Se llama SIN sesion (aislada): responde el mensaje puntual sin mezclar el
 * historial del chat con el del Agent Center. askCoCo nunca ejecuta mutaciones
 * por su cuenta (las deja como pendingActions), asi que este camino es de solo
 * lectura desde la perspectiva del Agent Center y es seguro. Si CoCo no esta
 * disponible, se conserva la clarificacion original como red de seguridad.
 */

import { askCoCo } from '@/lib/coco/agent';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';

export async function conversationalCoCoReply(message: string, profile: AgentProfile): Promise<string> {
    try {
        const response = await askCoCo(message, null, {
            user_id: profile.id,
            name: profile.name || profile.email || 'Administracion',
            role: profile.role,
            unit_id: profile.unit_id || '',
            community_id: profile.community_id || '',
            currentPage: '/agent-center',
            channel: 'web',
        });
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
 * propuesta -> aprobacion -> bitacora.
 */
export async function upgradeClarificationWithCoCo(
    message: string,
    profile: AgentProfile,
    action: AgentAction,
): Promise<AgentAction> {
    if (action.toolName !== 'clarify_intent') return action;
    const reply = await conversationalCoCoReply(message, profile);
    if (!reply) return action;
    return { ...action, title: 'CoCo', summary: reply };
}
