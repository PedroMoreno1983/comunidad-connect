import { describe, expect, it, vi } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';

const create = vi.hoisted(() => vi.fn());
vi.mock('openai', () => ({ default: class {
    chat = { completions: { create } };
} }));

import { askOpenAi } from '@/lib/coco/openai-agent';

describe('CoCo OpenAI conversation adapter', () => {
    it('preserves tool results across rounds and turns function calls into pending CoCo actions', async () => {
        create.mockResolvedValueOnce({
            choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
                id: 'call_123', type: 'function', function: { name: 'create_claim', arguments: '{"description":"Fuga de agua"}' },
            }] } }],
            usage: { prompt_tokens: 100, completion_tokens: 20 },
        });
        const history: Anthropic.MessageParam[] = [
            { role: 'user', content: 'Reporta una fuga' },
            { role: 'assistant', content: [{ type: 'tool_use', id: 'prior_call', name: 'get_resident_info', input: {} }] },
            { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'prior_call', content: '{"unit":"101"}' }] },
        ];
        const result = await askOpenAi({
            apiKey: 'test-key', model: 'gpt-5.4-mini', systemPrompt: 'Eres CoCo', history,
            tools: [{ name: 'create_claim', description: 'Crear reclamo', input_schema: { type: 'object', properties: {} } }],
        });
        const request = create.mock.calls[0][0];
        expect(request.messages[2].tool_calls[0].id).toBe('prior_call');
        expect(request.messages[3]).toEqual({ role: 'tool', tool_call_id: 'prior_call', content: '{"unit":"101"}' });
        expect(result.stop_reason).toBe('tool_use');
        expect(result.content).toContainEqual(expect.objectContaining({
            type: 'tool_use', id: 'call_123', name: 'create_claim', input: { description: 'Fuga de agua' },
        }));
    });
});
