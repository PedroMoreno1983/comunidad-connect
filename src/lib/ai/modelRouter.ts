/**
 * Qué modelo atiende cada tarea.
 *
 * Antes cada módulo tenía su propia constante MODEL y todas leían la misma
 * variable de entorno ANTHROPIC_MODEL, así que no se podía abaratar una tarea
 * simple sin abaratar también el agente que toca plata. Aquí la decisión vive
 * en un solo lugar y se toma por tarea.
 *
 * Tres niveles, según lo que cuesta equivocarse y no según lo que cuesta el
 * modelo:
 *   light    -> texto simple, sin herramientas. Un error lo ve la persona en
 *               pantalla y lo corrige. Aquí sí conviene el modelo barato.
 *   standard -> conversación con herramientas y lectura de datos reales.
 *   deep     -> escritura larga o planificación donde la calidad se nota.
 *
 * Lo que NO baja de nivel: todo lo que emite o modifica dinero. Un error de
 * prorrateo no lo ve nadie hasta que llega el cobro equivocado, y ahorrarse
 * centavos ahí es la peor compra posible. Ver [[community-billing-architecture]].
 */

export type AiTaskComplexity = 'light' | 'standard' | 'deep';

export type AiProvider = 'anthropic' | 'deepseek';

export interface AiTaskProfile {
    /** Nivel de exigencia de la tarea. */
    complexity: AiTaskComplexity;
    /** Usa tool calling en formato Anthropic: no puede salir de ese proveedor. */
    needsTools?: boolean;
    /** Para qué sirve, en una línea. Se lee en el panel de consumo. */
    description: string;
}

/**
 * Las tareas con nombre del sistema. Agregar una tarea nueva obliga a decidir
 * su nivel aquí, que es exactamente lo que queremos: que la decisión sea
 * explícita y no el default de una variable de entorno global.
 */
export const AI_TASKS = {
    'coco.chat': {
        complexity: 'standard',
        needsTools: true,
        description: 'Agente CoCo con herramientas del condominio',
    },
    'coco.chat.fallback': {
        complexity: 'light',
        description: 'Respuesta de respaldo de CoCo, solo texto y sin herramientas',
    },
    'agent-center.planner': {
        complexity: 'standard',
        needsTools: true,
        description: 'Planificación de tareas del Agent Center',
    },
    'agent-center.mission-planner': {
        complexity: 'standard',
        needsTools: true,
        description: 'Orquestación de misiones del Agent Center',
    },
    'agent-center.research': {
        complexity: 'standard',
        needsTools: true,
        description: 'Investigación sobre datos de la comunidad',
    },
    'marketing.reel': {
        complexity: 'deep',
        description: 'Redacción creativa de guiones de marketing',
    },
} as const satisfies Record<string, AiTaskProfile>;

export type AiTaskName = keyof typeof AI_TASKS;

/**
 * Modelos por nivel. IDs exactos: no llevan sufijo de fecha.
 * Precios por millón de tokens al 2026-08-03, entrada/salida:
 *   deepseek-v4-flash  $0.14 / $0.28
 *   claude-haiku-4-5   $1.00 / $5.00
 *   claude-sonnet-5    $3.00 / $15.00
 *   claude-opus-5      $5.00 / $25.00
 */
const ANTHROPIC_BY_COMPLEXITY: Record<AiTaskComplexity, string> = {
    light: 'claude-haiku-4-5',
    standard: 'claude-sonnet-5',
    deep: 'claude-opus-5',
};

const DEEPSEEK_LIGHT_MODEL = 'deepseek-v4-flash';

export interface ResolvedAiModel {
    provider: AiProvider;
    model: string;
    complexity: AiTaskComplexity;
    /** Por qué salió este modelo. Se registra junto al consumo. */
    reason: string;
}

/** Hay credencial de DeepSeek configurada. */
export function deepSeekIsAvailable(): boolean {
    return Boolean(process.env.DEEPSEEK_API_KEY);
}

/**
 * Override por tarea, para poder fijar un modelo sin tocar código:
 *   AI_MODEL_COCO_CHAT_FALLBACK=claude-haiku-4-5
 * El proveedor se deduce del nombre del modelo.
 */
function envOverrideFor(task: AiTaskName): string | null {
    const key = `AI_MODEL_${task.toUpperCase().replace(/[.-]/g, '_')}`;
    const value = process.env[key];
    return value && value.trim() ? value.trim() : null;
}

function providerForModel(model: string): AiProvider {
    return model.startsWith('deepseek') ? 'deepseek' : 'anthropic';
}

/**
 * Decide proveedor y modelo para una tarea.
 *
 * DeepSeek entra solo cuando se cumplen las tres condiciones: la tarea es
 * 'light', no usa herramientas, y hay credencial. Si falta cualquiera cae al
 * Anthropic del mismo nivel — nunca al de un nivel más caro, y nunca falla.
 * Esto importa porque el despliegue web y la variable de entorno no llegan
 * juntos: sin este fallback, publicar antes de configurar la clave dejaría a
 * CoCo sin respuesta de respaldo.
 */
export function resolveAiModel(task: AiTaskName): ResolvedAiModel {
    const profile = AI_TASKS[task];
    const complexity = profile.complexity;

    const override = envOverrideFor(task);
    if (override) {
        return {
            provider: providerForModel(override),
            model: override,
            complexity,
            reason: 'override por variable de entorno',
        };
    }

    if (complexity === 'light' && !('needsTools' in profile && profile.needsTools)) {
        if (deepSeekIsAvailable()) {
            return {
                provider: 'deepseek',
                model: DEEPSEEK_LIGHT_MODEL,
                complexity,
                reason: 'tarea simple sin herramientas',
            };
        }
        return {
            provider: 'anthropic',
            model: ANTHROPIC_BY_COMPLEXITY.light,
            complexity,
            reason: 'tarea simple, sin credencial de DeepSeek',
        };
    }

    return {
        provider: 'anthropic',
        model: ANTHROPIC_BY_COMPLEXITY[complexity],
        complexity,
        reason: 'needsTools' in profile && profile.needsTools
            ? 'usa herramientas en formato Anthropic'
            : `nivel ${complexity}`,
    };
}

/** El modelo Anthropic de un nivel, para los llamados que no salen de Anthropic. */
export function anthropicModelFor(task: AiTaskName): string {
    const override = envOverrideFor(task);
    if (override && providerForModel(override) === 'anthropic') return override;
    return ANTHROPIC_BY_COMPLEXITY[AI_TASKS[task].complexity];
}
