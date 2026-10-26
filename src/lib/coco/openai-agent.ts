import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { toOpenAiTool } from '@/lib/ai/toolBridge';

type ModelResponse = {
    content: Anthropic.ContentBlock[];
    stop_reason: 'tool_use' | 'end_turn';
    usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens: number; cache_read_input_tokens: number };
};

type Tool = { name: string; description: string; input_schema: Record<string, unknown> };

function toMessages(history: Anthropic.MessageParam[]): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [];
    for (const turn of history) {
        if (typeof turn.content === 'string') {
            messages.push({ role: turn.role, content: turn.content });
            continue;
        }
        if (!Array.isArray(turn.content)) continue;
        const blocks = turn.content as (Anthropic.ContentBlock | Anthropic.ToolResultBlockParam | Anthropic.ImageBlockParam)[];
        if (turn.role === 'assistant') {
            const text = blocks.filter((block): block is Anthropic.TextBlock => block.type === 'text').map(block => block.text).join('\n');
            const toolCalls = blocks.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use').map(block => ({
                id: block.id,
                type: 'function' as const,
                function: { name: block.name, arguments: JSON.stringify(block.input) },
            }));
            messages.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
            continue;
        }
        for (const block of blocks) {
            if (block.type === 'tool_result') {
                messages.push({ role: 'tool', tool_call_id: block.tool_use_id, content: typeof block.content === 'string' ? block.content : JSON.stringify(block.content) });
            }
        }
        const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];
        for (const block of blocks) {
            if (block.type === 'text') userContent.push({ type: 'text', text: block.text });
            if (block.type === 'image' && block.source.type === 'base64') {
                userContent.push({ type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
            }
        }
        if (userContent.length) messages.push({ role: 'user', content: userContent });
    }
    return messages;
}

export async function askOpenAi(input: {
    apiKey: string;
    model: string;
    systemPrompt: string;
    history: Anthropic.MessageParam[];
    tools: Tool[];
    requiredTool?: string;
}): Promise<ModelResponse> {
    const client = new OpenAI({ apiKey: input.apiKey });
    const completion = await client.chat.completions.create({
        model: input.model,
        max_completion_tokens: 2048,
        messages: [{ role: 'system', content: input.systemPrompt }, ...toMessages(input.history)],
        tools: input.tools.map(toOpenAiTool),
        ...(input.requiredTool ? { tool_choice: { type: 'function' as const, function: { name: input.requiredTool } } } : {}),
    });
    const choice = completion.choices[0];
    if (!choice) throw new Error('OpenAI no devolvió una respuesta para CoCo.');
    if (choice.finish_reason === 'length') throw new Error('OpenAI interrumpió la respuesta de CoCo antes de completarla.');
    const content: Anthropic.ContentBlock[] = [];
    if (choice.message.content) content.push({ type: 'text', text: choice.message.content, citations: null });
    for (const call of choice.message.tool_calls ?? []) {
        if (call.type !== 'function') continue;
        let argumentsValue: unknown;
        try { argumentsValue = JSON.parse(call.function.arguments); } catch { argumentsValue = {}; }
        if (!argumentsValue || typeof argumentsValue !== 'object' || Array.isArray(argumentsValue)) argumentsValue = {};
        content.push({ type: 'tool_use', id: call.id, name: call.function.name, input: argumentsValue, caller: { type: 'direct' } });
    }
    return {
        content,
        stop_reason: content.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn',
        usage: {
            input_tokens: completion.usage?.prompt_tokens ?? 0,
            output_tokens: completion.usage?.completion_tokens ?? 0,
            cache_creation_input_tokens: 0,
            cache_read_input_tokens: 0,
        },
    };
}
