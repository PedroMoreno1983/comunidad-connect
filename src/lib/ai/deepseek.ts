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
import type { OpenAiStyleTool } from '@/lib/ai/toolBridge';

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
export interface DeepSeekToolLoopResult extends DeepSeekTextResult {
    /** Cuántas vueltas de herramientas se ejecutaron antes de la respuesta. */
    toolRounds: number;
}

/**
 * Una conversación con herramientas de solo lectura.
 *
 * El bucle es el mismo de siempre: el modelo pide herramientas, las
 * ejecutamos, le devolvemos los resultados, y repetimos hasta que responde en
 * texto o se agotan las vueltas. `executeToolCall` lo inyecta quien llama para
 * que este archivo no dependa de las herramientas de CoCo.
 *
 * El tope de vueltas no es decorativo: sin él, un modelo que insiste en pedir
 * la misma herramienta deja la petición colgada y consumiendo tokens hasta el
 * timeout de la función serverless.
 */
export async function runDeepSeekToolLoop(input: {
    model: string;
    system: string;
    user: string;
    tools: OpenAiStyleTool[];
    executeToolCall: (name: string, args: Record<string, string>) => Promise<unknown>;
    maxTokens?: number;
    maxRounds?: number;
}): Promise<DeepSeekToolLoopResult> {
    const client = deepSeekClient();
    const maxRounds = input.maxRounds ?? 3;

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: 'system', content: input.system },
        { role: 'user', content: input.user },
    ];

    let promptTokens = 0;
    let completionTokens = 0;
    let cachedPromptTokens = 0;
    let toolRounds = 0;

    for (let round = 0; round <= maxRounds; round += 1) {
        const completion = await client.chat.completions.create({
            model: input.model,
            max_tokens: input.maxTokens ?? 1024,
            messages,
            // En la última vuelta se retiran las herramientas: si el modelo
            // vuelve a pedir uso de herramienta ahí, no habría dónde ejecutarla
            // y la persona se quedaría sin respuesta.
            ...(round < maxRounds && input.tools.length ? { tools: input.tools } : {}),
        });

        const usage = completion.usage as (typeof completion.usage & {
            prompt_cache_hit_tokens?: number;
        }) | undefined;
        promptTokens += usage?.prompt_tokens ?? 0;
        completionTokens += usage?.completion_tokens ?? 0;
        cachedPromptTokens += usage?.prompt_cache_hit_tokens ?? 0;

        const choice = completion.choices[0]?.message;
        const toolCalls = choice?.tool_calls ?? [];

        if (!toolCalls.length) {
            return {
                text: choice?.content ?? '',
                promptTokens,
                completionTokens,
                cachedPromptTokens,
                toolRounds,
            };
        }

        toolRounds += 1;
        messages.push(choice as OpenAI.Chat.ChatCompletionMessageParam);

        for (const call of toolCalls) {
            if (call.type !== 'function') continue;
            let result: unknown;
            try {
                // Los argumentos llegan como texto: un JSON inválido es un
                // error del modelo, no de la herramienta, y se le devuelve para
                // que reintente en vez de tumbar la petición completa.
                const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>;
                result = await input.executeToolCall(call.function.name, args);
            } catch (error) {
                result = { error: error instanceof Error ? error.message : 'Error ejecutando la herramienta.' };
            }
            messages.push({
                role: 'tool',
                tool_call_id: call.id,
                content: JSON.stringify(result ?? null),
            });
        }
    }

    return { text: '', promptTokens, completionTokens, cachedPromptTokens, toolRounds };
}

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
