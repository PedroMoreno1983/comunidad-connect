/**
 * Traducción de herramientas de formato Anthropic a formato OpenAI.
 *
 * CoCo declara sus herramientas como {name, description, input_schema}, que es
 * lo que espera la API de Anthropic. DeepSeek —y cualquier API compatible con
 * OpenAI— las quiere envueltas: {type:'function', function:{name, description,
 * parameters}}. El JSON schema de adentro es el mismo, así que esto es un
 * cambio de envoltorio y no una redefinición.
 *
 * Existe para que el respaldo de CoCo pueda responder consultas reales cuando
 * el motor principal está caído, en vez de conversar sin saber nada.
 */

export interface AnthropicStyleTool {
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
}

export interface OpenAiStyleTool {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
    };
}

/**
 * Herramientas que el respaldo puede usar: SOLO LECTURA.
 *
 * La lista es explícita a propósito. Derivarla como "todo lo que no está en
 * MUTATING_TOOLS" habría sido más corto, pero entonces una herramienta nueva
 * que alguien olvide clasificar entraría sola al respaldo. Así, una
 * herramienta nueva queda fuera hasta que alguien la agregue a mano, que es el
 * lado correcto en el que fallar.
 *
 * Deliberadamente fuera:
 *   - Las 20 de MUTATING_TOOLS. Durante una caída no quiero un modelo de
 *     respaldo emitiendo gasto común ni fijando alícuotas.
 *   - remember_preference, que no está en MUTATING_TOOLS pero escribe memoria
 *     del usuario. Si escribe, no entra, sin importar cómo esté clasificada.
 *
 * preview_billing sí entra: calcula y muestra, no emite. Emitir es
 * issue_billing, que está fuera.
 */
export const FALLBACK_READ_ONLY_TOOLS: readonly string[] = [
    'get_resident_info',
    'get_payment_status',
    'get_water_consumption',
    'list_services',
    'search_marketplace',
    'get_claim_status',
    'list_my_claims',
    'check_availability',
    'list_active_polls',
    'get_pending_packages',
    'get_defaulters_list',
    'preview_billing',
    'list_supermarket_group_orders',
    'compare_supermarket_group_order',
] as const;

const FALLBACK_READ_ONLY_SET = new Set(FALLBACK_READ_ONLY_TOOLS);

/** Envuelve una herramienta de Anthropic en el formato que espera OpenAI. */
export function toOpenAiTool(tool: AnthropicStyleTool): OpenAiStyleTool {
    return {
        type: 'function',
        function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema,
        },
    };
}

/**
 * Parámetros que el servidor resuelve solo, desde la sesión de quien pregunta.
 *
 * executeTool los pasa por scopedUnit / scopedCommunity, que sacan la unidad y
 * la comunidad del userCtx e ignoran lo que venga del modelo si no
 * corresponde. Son, además, la barrera que impide que un residente consulte la
 * unidad de otro.
 */
const SESSION_RESOLVED_PARAMS = new Set(['unit_id', 'community_id']);

/**
 * Saca de `required` los parámetros que el servidor ya conoce.
 *
 * Sin esto el esquema le miente al modelo: siete de las catorce herramientas
 * declaran unit_id o community_id como obligatorios cuando el servidor los
 * resuelve de la sesión. Comprobado contra la API real — al preguntarle
 * "¿cuánto debo?", el modelo no llamaba a ninguna herramienta y respondía
 * pidiéndole el número de departamento a una persona que ya había iniciado
 * sesión y cuyo departamento el sistema tenía.
 *
 * Siguen declarados como propiedades opcionales: si el modelo los manda,
 * scopedUnit/scopedCommunity los validan igual.
 */
function relaxSessionResolvedParams(schema: Record<string, unknown>): Record<string, unknown> {
    const required = schema.required;
    if (!Array.isArray(required)) return schema;
    const kept = required.filter(name => typeof name === 'string' && !SESSION_RESOLVED_PARAMS.has(name));
    if (kept.length === required.length) return schema;
    if (kept.length > 0) return { ...schema, required: kept };
    // Sin obligatorios que conservar, se quita la clave entera: un `required`
    // vacío es válido pero algunos validadores de schema lo rechazan.
    const relaxed = { ...schema };
    delete relaxed.required;
    return relaxed;
}

/**
 * Las herramientas que puede usar el respaldo para un rol dado.
 *
 * Aplica dos filtros y necesita los dos: la lista de solo lectura, y el mismo
 * control de rol del camino principal. Sin el segundo, un residente podría
 * pedirle la lista de morosos al respaldo — una herramienta que sí es de
 * lectura, pero que solo la administración debe ver.
 */
export function fallbackToolsForRole(
    tools: readonly AnthropicStyleTool[],
    role: string | undefined,
    isAllowedForRole: (name: string, role?: string) => boolean,
): OpenAiStyleTool[] {
    return tools
        .filter(tool => FALLBACK_READ_ONLY_SET.has(tool.name))
        .filter(tool => isAllowedForRole(tool.name, role))
        .map(tool => toOpenAiTool({
            ...tool,
            input_schema: relaxSessionResolvedParams(tool.input_schema),
        }));
}

export function isFallbackReadOnlyTool(name: string): boolean {
    return FALLBACK_READ_ONLY_SET.has(name);
}
