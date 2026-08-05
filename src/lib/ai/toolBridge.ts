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
        .map(toOpenAiTool);
}

export function isFallbackReadOnlyTool(name: string): boolean {
    return FALLBACK_READ_ONLY_SET.has(name);
}
