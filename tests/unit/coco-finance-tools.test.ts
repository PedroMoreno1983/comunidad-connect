import { describe, expect, it } from 'vitest';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole, describePendingAction, executeTool } from '@/lib/coco/tools';

describe('CoCo: finanzas de administración', () => {
    it('expone el registro manual y el reporte solo a administradores', () => {
        const names = TOOL_DEFINITIONS.map(tool => tool.name);
        for (const tool of ['record_payment', 'get_monthly_finance_report']) {
            expect(names).toContain(tool);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
            expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
            expect(isToolAllowedForRole(tool, 'system')).toBe(false);
        }
    });

    it('obliga a aprobar el pago y muestra los datos que alteran el saldo', () => {
        expect(MUTATING_TOOLS.has('record_payment')).toBe(true);
        expect(MUTATING_TOOLS.has('get_monthly_finance_report')).toBe(false);
        const summary = describePendingAction('record_payment', {
            unit_id: '101', amount: '150000', paid_at: '2026-10-28', method: 'transfer', reference: 'TR-123',
        }).summary;
        for (const value of ['101', '150000', '2026-10-28', 'transfer', 'TR-123', 'verificaste']) {
            expect(summary).toContain(value);
        }
    });

    it('rechaza al residente antes de consultar o escribir finanzas', async () => {
        const context = { role: 'resident', community_id: '11111111-1111-1111-1111-111111111111' };
        expect(await executeTool('record_payment', {}, context)).toHaveProperty('error');
        expect(await executeTool('get_monthly_finance_report', {}, context)).toHaveProperty('error');
    });
});
