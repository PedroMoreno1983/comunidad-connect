import { describe, expect, it } from 'vitest';
import {
    FALLBACK_READ_ONLY_TOOLS,
    fallbackToolsForRole,
    isFallbackReadOnlyTool,
    toOpenAiTool,
    type AnthropicStyleTool,
} from '@/lib/ai/toolBridge';
import { MUTATING_TOOLS, TOOL_DEFINITIONS, isToolAllowedForRole } from '@/lib/coco/tools';

const ALL_TOOLS = TOOL_DEFINITIONS as unknown as AnthropicStyleTool[];

describe('lista blanca del respaldo', () => {
    it('NO contiene ninguna herramienta que escriba', () => {
        // Esta es la prueba que importa. Si alguien agrega una herramienta que
        // muta a FALLBACK_READ_ONLY_TOOLS, aquí se cae — antes de que un modelo
        // de respaldo emita gasto común durante una caída.
        const escriben = FALLBACK_READ_ONLY_TOOLS.filter(name => MUTATING_TOOLS.has(name));
        expect(escriben).toEqual([]);
    });

    it('no incluye remember_preference, que escribe aunque no esté clasificada como tal', () => {
        expect(FALLBACK_READ_ONLY_TOOLS).not.toContain('remember_preference');
    });

    it('deja fuera emitir cobros pero permite previsualizarlos', () => {
        expect(FALLBACK_READ_ONLY_TOOLS).not.toContain('issue_billing');
        expect(FALLBACK_READ_ONLY_TOOLS).not.toContain('add_community_expense');
        expect(FALLBACK_READ_ONLY_TOOLS).toContain('preview_billing');
    });

    it('solo nombra herramientas que existen de verdad', () => {
        const existentes = new Set(ALL_TOOLS.map(tool => tool.name));
        const fantasmas = FALLBACK_READ_ONLY_TOOLS.filter(name => !existentes.has(name));
        expect(fantasmas).toEqual([]);
    });
});

describe('toOpenAiTool', () => {
    it('envuelve el schema sin tocarlo', () => {
        const input_schema = { type: 'object', properties: { unit_id: { type: 'string' } } };
        const converted = toOpenAiTool({ name: 'get_payment_status', description: 'Estado de pago', input_schema });
        expect(converted).toEqual({
            type: 'function',
            function: { name: 'get_payment_status', description: 'Estado de pago', parameters: input_schema },
        });
    });

    it('convierte todas las herramientas reales sin perder el nombre', () => {
        const converted = ALL_TOOLS.map(toOpenAiTool);
        expect(converted).toHaveLength(ALL_TOOLS.length);
        expect(converted.every(tool => tool.type === 'function' && Boolean(tool.function.name))).toBe(true);
    });
});

describe('fallbackToolsForRole', () => {
    it('aplica también el control de rol, no solo la lista blanca', () => {
        // get_defaulters_list es de lectura, pero la nómina de morosos no la ve
        // un residente. Sin este filtro la lista blanca sola la habría expuesto.
        const paraResidente = fallbackToolsForRole(ALL_TOOLS, 'resident', isToolAllowedForRole)
            .map(tool => tool.function.name);
        expect(paraResidente).not.toContain('get_defaulters_list');

        const paraAdmin = fallbackToolsForRole(ALL_TOOLS, 'admin', isToolAllowedForRole)
            .map(tool => tool.function.name);
        expect(paraAdmin).toContain('get_defaulters_list');
    });

    it('nunca entrega una herramienta que escriba, sea cual sea el rol', () => {
        for (const role of ['resident', 'admin', 'concierge', 'system', undefined]) {
            const nombres = fallbackToolsForRole(ALL_TOOLS, role, isToolAllowedForRole)
                .map(tool => tool.function.name);
            expect(nombres.filter(name => MUTATING_TOOLS.has(name))).toEqual([]);
        }
    });

    it('le da al residente lo que necesita para una consulta típica', () => {
        const nombres = fallbackToolsForRole(ALL_TOOLS, 'resident', isToolAllowedForRole)
            .map(tool => tool.function.name);
        expect(nombres).toContain('get_payment_status');
        expect(nombres).toContain('get_claim_status');
    });
});

describe('isFallbackReadOnlyTool', () => {
    it('es la segunda barrera en el punto de ejecución', () => {
        expect(isFallbackReadOnlyTool('get_payment_status')).toBe(true);
        expect(isFallbackReadOnlyTool('issue_billing')).toBe(false);
        expect(isFallbackReadOnlyTool('herramienta_inventada')).toBe(false);
    });
});
