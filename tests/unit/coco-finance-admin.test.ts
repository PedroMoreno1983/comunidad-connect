/**
 * Correcciones financieras por CoCo. No hay lógica de dinero en estas
 * herramientas: delegan en collectionService y billingService. Estos tests
 * vigilan que solo la administración las alcance, que pidan confirmación, que
 * la unidad se resuelva dentro de la comunidad y que el error de negocio
 * (p. ej. mes ya emitido) llegue tal cual.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const finance = vi.hoisted(() => ({
    addUnitCharge: vi.fn(async () => ({})),
    cancelUnitCharge: vi.fn(async () => ({})),
    deletePayment: vi.fn(async () => ({})),
    getUnitStatement: vi.fn(),
    deleteCommunityExpense: vi.fn(),
}));
vi.mock('@/lib/finance/collectionService', () => ({
    addUnitCharge: finance.addUnitCharge, cancelUnitCharge: finance.cancelUnitCharge,
    deletePayment: finance.deletePayment, getUnitStatement: finance.getUnitStatement,
    PAYMENT_METHODS: new Set(['transfer']), recordPayment: vi.fn(),
}));
vi.mock('@/lib/finance/billingService', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/finance/billingService')>();
    return { ...real, deleteCommunityExpense: finance.deleteCommunityExpense, listCommunityExpenses: vi.fn() };
});

import { addChargeForAdmin, cancelChargeForAdmin, deleteExpenseForAdmin, getUnitAccount } from '@/lib/coco/financeAdminTools';
import { BillingError } from '@/lib/finance/billingService';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function unitsDb(units: Record<string, unknown>[]) {
    const filters: [string, unknown][] = [];
    const b: Record<string, unknown> = {};
    b.eq = (col: string, val: unknown) => { filters.push([col, val]); return b; };
    for (const op of ['select', 'limit']) b[op] = () => b;
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: units, error: null }).then(ok);
    return { db: { from: () => b } as unknown as SupabaseClient, filters };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    const TOOLS = ['get_unit_account', 'add_unit_charge', 'cancel_unit_charge', 'delete_unit_payment', 'list_community_expenses', 'delete_community_expense'];

    it.each(TOOLS)('%s es solo de la administración', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
        expect(isToolAllowedForRole(tool, 'concierge')).toBe(false);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
    });

    it('las que mueven dinero piden confirmación', () => {
        for (const tool of ['add_unit_charge', 'cancel_unit_charge', 'delete_unit_payment', 'delete_community_expense']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('delegan en la lógica de finanzas', () => {
    it('el cargo se busca por número dentro de la comunidad y lo registra el admin', async () => {
        const { db, filters } = unitsDb([{ id: 'unit-504', number: '504', tower: 'A' }]);
        const result = await addChargeForAdmin(db, COMUNIDAD, ADMIN, { unit_number: '504', month: '2026-11', kind: 'fine', label: 'Ruidos', amount: 20000 }) as Record<string, unknown>;
        expect(result.success).toBe(true);
        expect(filters).toContainEqual(['community_id', COMUNIDAD]);
        expect(finance.addUnitCharge).toHaveBeenCalledWith(COMUNIDAD, ADMIN, expect.objectContaining({ unitId: 'unit-504', kind: 'fine', amount: 20000 }));
    });

    it('si hay dos 504 pide la torre y no cobra', async () => {
        finance.addUnitCharge.mockClear();
        const { db } = unitsDb([{ id: 'a', number: '504', tower: 'A' }, { id: 'b', number: '504', tower: 'B' }]);
        const result = await addChargeForAdmin(db, COMUNIDAD, ADMIN, { unit_number: '504', month: '2026-11', kind: 'fine', label: 'x', amount: 1 }) as Record<string, unknown>;
        expect(result.error).toMatch(/torre/);
        expect(finance.addUnitCharge).not.toHaveBeenCalled();
    });

    it('anular exige un id real', async () => {
        finance.cancelUnitCharge.mockClear();
        expect((await cancelChargeForAdmin(COMUNIDAD, { charge_id: 'la multa' }) as Record<string, unknown>).error).toBeTruthy();
        expect(finance.cancelUnitCharge).not.toHaveBeenCalled();
    });

    it('el error de negocio llega tal cual (mes ya emitido)', async () => {
        finance.deleteCommunityExpense.mockRejectedValueOnce(new BillingError('issued', 'Ese mes ya se emitió: anula la emisión antes de borrar gastos.', 409));
        const result = await deleteExpenseForAdmin(COMUNIDAD, { expense_id: ID }) as Record<string, unknown>;
        expect(result.error).toMatch(/ya se emitió/);
    });

    it('la cuenta separa cargos anulables de pagos y del gasto común', async () => {
        finance.getUnitStatement.mockResolvedValueOnce({
            balance: 50000, overdueAmount: 0,
            entries: [
                { id: 'exp1', kind: 'gasto_comun', label: 'Gasto común 2026-11', amount: 80000, month: '2026-11', date: '2026-11-05', reference: null },
                { id: 'ch1', kind: 'fine', label: 'Ruidos', amount: 20000, month: '2026-11', date: '2026-11-10', reference: null },
                { id: 'pay1', kind: 'payment', label: 'Pago', amount: -50000, month: null, date: '2026-11-12', reference: 'TRX1' },
            ],
        });
        const { db } = unitsDb([{ id: 'unit-504', number: '504', tower: 'A' }]);
        const account = await getUnitAccount(db, COMUNIDAD, { unit_number: '504' }) as { cargos: Record<string, unknown>[]; pagos: Record<string, unknown>[] };
        expect(account.cargos.find(c => c.charge_id === 'exp1')?.anulable).toBe(false);
        expect(account.cargos.find(c => c.charge_id === 'ch1')?.anulable).toBe(true);
        expect(account.pagos).toEqual([expect.objectContaining({ payment_id: 'pay1', monto: 50000 })]);
    });
});
