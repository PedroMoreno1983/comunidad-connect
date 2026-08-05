/**
 * Cliente de DeepSeek.
 *
 * Su API es compatible con la de OpenAI, y el SDK de OpenAI ya es dependencia
 * del proyecto (lo usa imageService.ts), así que esto es un cambio de baseURL
 * y no un SDK nuevo.
 *
 * DeepSeek SÍ soporta tool calling, en formato OpenAI. Lo que no hay todavía
 * es la traducción: las herramientas de CoCo están declaradas en formato
 * Anthropic ({name, description, input_schema}) y OpenAI las quiere como
 * {type:'function', function:{name, description, parameters}}. Es una
 * conversión mecánica, no un rediseño, pero mientras no exista este helper
 * expone solo texto y modelRouter.ts no le manda tareas con herramientas.
 *
 * Lo que no cubre es la extracción de nóminas y PDFs escaneados, que necesita
 * leer imágenes y se queda en Gemini.
 */

import OpenAI from 'openai';

const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export class DeepSeekNotConfiguredError extends Error {
    constructor() {
        super('DEEPSEEK_API_KEY no configurada.');
        this.name = 'DeepSeekNotConfiguredError';
    }
}

function deepSeekClient(): OpenAI {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) throw new DeepSeekNotConfiguredError();
    return new OpenAI({ apiKey, baseURL: DEEPSEEK_BASE_URL });
}

export interface DeepSeekTextResult {
    text: string;
    promptTokens: number;
    completionTokens: number;
    /** Tokens de entrada servidos desde su caché, a 1/50 del precio. */
    cachedPromptTokens: number;
}

/**
 * Una vuelta de texto: system + user, respuesta en texto.
 *
 * Devuelve los tokens que reporta la tienda y no una estimación, para que el
 * costo que se guarda en ai_usage_events sea el real. `cachedPromptTokens`
 * viene de su campo propietario prompt_cache_hit_tokens; si algún día deja de
 * enviarlo queda en 0 y el costo se sobreestima, que es el lado seguro.
 */
export async function completeDeepSeekText(input: {
    model: string;
    system: string;
    user: string;
    maxTokens?: number;
}): Promise<DeepSeekTextResult> {
    const completion = await deepSeekClient().chat.completions.create({
        model: input.model,
        max_tokens: input.maxTokens ?? 2048,
        messages: [
            { role: 'system', content: input.system },
            { role: 'user', content: input.user },
        ],
    });

    const usage = completion.usage as (typeof completion.usage & {
        prompt_cache_hit_tokens?: number;
    }) | undefined;

    return {
        text: completion.choices[0]?.message?.content ?? '',
        promptTokens: usage?.prompt_tokens ?? 0,
        completionTokens: usage?.completion_tokens ?? 0,
        cachedPromptTokens: usage?.prompt_cache_hit_tokens ?? 0,
    };
}
