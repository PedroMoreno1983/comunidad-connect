import { describe, expect, it } from 'vitest';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { handoffChain, planSpecialists, SPECIALIST_BRIEFS } from '@/lib/coco/specialists';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('Cocos especializados', () => {
    it('arma la cadena de traspaso y no escribe en el encargo', () => {
        const plan = planSpecialists('Revisa la cobranza y el reglamento de la asamblea');
        expect(plan).toMatchObject({ specialists: ['cobranza', 'legal'] });
        if ('error' in plan) return;
        expect(handoffChain(plan.specialists)).toEqual([
            { from: 'coco', to: 'cobranza' },
            { from: 'cobranza', to: 'legal' },
        ]);
        expect(Object.values(SPECIALIST_BRIEFS).join(' ')).not.toMatch(/\bdeudor|\bmoros|\$/);
        expect(planSpecialists('hola')).toEqual({ error: 'Dime el pedido que hay que repartir.' });
    });

    it('pide confirmación y solo lo usa la administración', () => {
        expect(MUTATING_TOOLS.has('coordinate_specialists')).toBe(true);
        expect(cocoToolRisk('coordinate_specialists')).toBe('write_high');
        expect(isToolAllowedForRole('coordinate_specialists', 'admin')).toBe(true);
        expect(isToolAllowedForRole('coordinate_specialists', 'resident')).toBe(false);
    });
});
