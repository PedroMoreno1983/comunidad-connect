import { afterEach, describe, expect, it } from 'vitest';
import { AI_TASKS, anthropicModelFor, deepSeekIsAvailable, resolveAiModel } from '@/lib/ai/modelRouter';

const TOUCHED_ENV = ['DEEPSEEK_API_KEY', 'AI_MODEL_COCO_CHAT_FALLBACK', 'AI_MODEL_COCO_CHAT'];

afterEach(() => {
    for (const key of TOUCHED_ENV) delete process.env[key];
});

describe('resolveAiModel', () => {
    it('manda la tarea simple sin herramientas a DeepSeek cuando hay credencial', () => {
        process.env.DEEPSEEK_API_KEY = 'sk-de-prueba';
        const routed = resolveAiModel('coco.chat.fallback');
        expect(routed.provider).toBe('deepseek');
        expect(routed.model).toBe('deepseek-v4-flash');
    });

    it('cae al Anthropic barato si falta la credencial, en vez de fallar', () => {
        // Es el caso real de un deploy antes de configurar la variable: el
        // respaldo de CoCo tiene que seguir respondiendo.
        expect(deepSeekIsAvailable()).toBe(false);
        const routed = resolveAiModel('coco.chat.fallback');
        expect(routed.provider).toBe('anthropic');
        expect(routed.model).toBe('claude-haiku-4-5');
    });

    it('nunca abarata una tarea con herramientas, aunque DeepSeek esté disponible', () => {
        process.env.DEEPSEEK_API_KEY = 'sk-de-prueba';
        for (const task of ['coco.chat', 'agent-center.planner', 'agent-center.research'] as const) {
            const routed = resolveAiModel(task);
            expect(routed.provider).toBe('anthropic');
        }
    });

    it('deja la redacción creativa en el nivel alto', () => {
        process.env.DEEPSEEK_API_KEY = 'sk-de-prueba';
        const routed = resolveAiModel('marketing.reel');
        expect(routed.model).toBe('claude-opus-5');
    });

    it('asigna un modelo distinto por nivel', () => {
        expect(resolveAiModel('coco.chat.fallback').model).toBe('claude-haiku-4-5');
        expect(resolveAiModel('coco.chat').model).toBe('claude-sonnet-5');
        expect(resolveAiModel('marketing.reel').model).toBe('claude-opus-5');
    });

    it('respeta el override por variable de entorno y deduce el proveedor', () => {
        process.env.AI_MODEL_COCO_CHAT_FALLBACK = 'claude-sonnet-5';
        const routed = resolveAiModel('coco.chat.fallback');
        expect(routed.provider).toBe('anthropic');
        expect(routed.model).toBe('claude-sonnet-5');
    });

    it('no usa IDs con sufijo de fecha ni modelos de generación anterior', () => {
        for (const task of Object.keys(AI_TASKS) as Array<keyof typeof AI_TASKS>) {
            const model = resolveAiModel(task).model;
            expect(model).not.toMatch(/-\d{8}$/);
            expect(model).not.toMatch(/claude-(sonnet|opus)-4-/);
        }
    });
});

describe('anthropicModelFor', () => {
    it('devuelve siempre un modelo Anthropic, incluso para tareas ruteadas a DeepSeek', () => {
        process.env.DEEPSEEK_API_KEY = 'sk-de-prueba';
        expect(anthropicModelFor('coco.chat.fallback')).toBe('claude-haiku-4-5');
    });

    it('ignora un override que apunte a otro proveedor', () => {
        // Quien llama a esta función habla con el SDK de Anthropic: devolverle
        // un modelo de DeepSeek produciría un 404 en vez de un ahorro.
        process.env.AI_MODEL_COCO_CHAT = 'deepseek-v4-flash';
        expect(anthropicModelFor('coco.chat')).toBe('claude-sonnet-5');
    });
});
