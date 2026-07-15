import { describe, expect, it } from 'vitest';
import { validateAgentActionArgs } from '../../src/lib/agent-center/actionValidation';
import type { AgentAction, ToolName } from '../../src/lib/agent-center/domain';

function action(toolName: ToolName, args: Record<string, unknown>): AgentAction {
    return { agentKey: 'maintenance', toolName, args, requiresConfirmation: true, title: 'Prueba', summary: 'Prueba', targetHref: '/' };
}

describe('Agent Center action validation', () => {
    it('accepts a department debt lookup and strips unrelated args', () => {
        expect(validateAgentActionArgs(action('get_resident_expenses', { unitNumber: ' 1204 ', description: 'ignore' })))
            .toEqual({ unitNumber: '1204' });
    });

    it('rejects invalid booking time ranges', () => {
        expect(() => validateAgentActionArgs(action('create_booking', {
            amenityHint: 'quincho', date: '2026-07-20', startTime: '18:00', endTime: '17:00',
        }))).toThrow('posterior');
    });

    it('rejects empty maintenance requests', () => {
        expect(() => validateAgentActionArgs(action('create_service_request', {
            description: '', preferredDate: '2026-07-20', preferredTime: '10:00',
        }))).toThrow('descripcion');
    });

    it('rejects unsupported marketplace categories', () => {
        expect(() => validateAgentActionArgs(action('create_marketplace_item', {
            title: 'Mesa', description: 'Mesa usada', price: 20000, category: 'illegal',
        }))).toThrow('categoria');
    });
});
