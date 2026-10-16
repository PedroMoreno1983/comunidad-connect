/**
 * Efecto contable de las liquidaciones a dueños de estacionamientos: el arriendo
 * entra completo como ingreso, pero lo entregado al dueño es gasto; el abono no
 * es caja y la transferencia sí sale de caja.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildFinancialStatements, type StatementInputs } from '@/lib/finance/financialStatements';

const base: StatementInputs = {
    year: 2026,
    cutoffMonth: '2026-03',
    openingCash: 0,
    journalBank: 0,
    unitIds: ['tenant', 'owner'],
    expenses: [],
    // El arrendatario paga $10.000 por el arriendo (cargo 'service').
    charges: [{ unitId: 'tenant', month: '2026-02', kind: 'service', amount: 10_000, label: 'Estacionamiento E-1' }],
    payments: [{ unitId: 'tenant', paidAt: '2026-02-10', amount: 10_000 }],
    communityExpenses: [],
    reserveMovements: [],
};

describe('liquidaciones en los estados financieros', () => {
    it('abono al dueño: gasto por el neto, sin salida de caja y sin contar el abono como recaudación', () => {
        const statements = buildFinancialStatements({
            ...base,
            payments: [...base.payments, { unitId: 'owner', paidAt: '2026-02-11', amount: 9_000, nonCash: true }],
            parkingPayouts: [{ month: '2026-02', netAmount: 9_000, kind: 'credit' }],
        });
        expect(statements.income.totalIncome).toBe(10_000);
        expect(statements.income.expenseLines).toContainEqual({
            category: 'parking_owner_payouts', label: 'Liquidaciones a dueños de estacionamientos', total: 9_000,
        });
        expect(statements.income.result).toBe(1_000); // solo la comisión es de la comunidad
        expect(statements.cashFlow.totalInflow).toBe(10_000);
        expect(statements.cashFlow.totalOutflow).toBe(0);
        expect(statements.position.cash).toBe(10_000);
        // El dueño queda con saldo a favor (anticipo) por el abono.
        expect(statements.position.advances).toBe(9_000);
        expect(statements.position.advances + statements.position.reserveFund + statements.position.accumulatedSurplus)
            .toBe(statements.position.totalAssets);
    });

    it('transferencia al dueño: gasto y salida de caja en el mes en que se transfirió', () => {
        const statements = buildFinancialStatements({
            ...base,
            parkingPayouts: [{ month: '2026-03', netAmount: 9_000, kind: 'transfer' }],
        });
        expect(statements.income.result).toBe(1_000);
        expect(statements.cashFlow.months.find(row => row.month === '2026-03')?.outflow).toBe(9_000);
        expect(statements.position.cash).toBe(1_000);
        expect(statements.cashFlow.endingCash).toBe(statements.position.cash);
    });

    it('arriendo pagado por Haulmer: ingreso y entrada de caja aunque no pase por la cuenta de la unidad', () => {
        const statements = buildFinancialStatements({
            ...base,
            charges: [],
            payments: [],
            providerParkingCharges: [{ paidMonth: '2026-02', amount: 10_000, refundedMonth: null }],
            parkingPayouts: [{ month: '2026-03', netAmount: 8_750, kind: 'transfer' }],
        });
        expect(statements.income.lines.find(line => line.label.startsWith('Cargos extraordinarios'))?.total).toBe(10_000);
        expect(statements.income.result).toBe(1_250); // comisión del 12,5 %
        expect(statements.cashFlow.months.find(row => row.month === '2026-02')?.inflow).toBe(10_000);
        expect(statements.position.cash).toBe(1_250);
        expect(statements.cashFlow.endingCash).toBe(statements.position.cash);
    });

    it('arriendo por Haulmer reembolsado: sale del ingreso y de la caja el mes del reembolso', () => {
        const statements = buildFinancialStatements({
            ...base,
            charges: [],
            payments: [],
            providerParkingCharges: [{ paidMonth: '2026-02', amount: 10_000, refundedMonth: '2026-03' }],
        });
        expect(statements.income.totalIncome).toBe(0);
        expect(statements.income.result).toBe(0);
        expect(statements.cashFlow.months.find(row => row.month === '2026-03')?.outflow).toBe(10_000);
        expect(statements.position.cash).toBe(0);
    });

    it('sin liquidaciones no cambia nada', () => {
        const statements = buildFinancialStatements(base);
        expect(statements.income.result).toBe(10_000);
        expect(statements.income.expenseLines).toEqual([]);
    });
});

const state = vi.hoisted(() => ({
    rows: [] as { id: string; credit_unit_id: string | null; status: string; credit_reconciled_at: string | null }[],
    updated: [] as string[],
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => {
            let ids: string[] = [];
            let updating = false;
            const query = {
                select: () => query,
                eq: () => query,
                is: () => query,
                limit: () => query,
                in: (_key: string, values: string[]) => { ids = values; return query; },
                update: () => { updating = true; return query; },
                then: (resolve: (result: unknown) => unknown) => {
                    if (updating) {
                        for (const row of state.rows) if (ids.includes(row.id)) row.credit_reconciled_at = 'now';
                        state.updated.push(...ids);
                        return Promise.resolve({ error: null }).then(resolve);
                    }
                    const pending = state.rows.filter(row => row.status === 'credited' && row.credit_reconciled_at === null);
                    return Promise.resolve({ data: pending, error: null }).then(resolve);
                },
            };
            return query;
        },
    }),
}));

import { reconcileParkingPayoutCredits } from '@/lib/parkingPayouts/reconcileCredits';

describe('recálculo de la unidad abonada', () => {
    beforeEach(() => {
        state.rows = [];
        state.updated = [];
    });

    it('recalcula cada unidad abonada una vez y marca las liquidaciones', async () => {
        state.rows = [
            { id: 'p1', credit_unit_id: 'u1', status: 'credited', credit_reconciled_at: null },
            { id: 'p2', credit_unit_id: 'u1', status: 'credited', credit_reconciled_at: null },
            { id: 'p3', credit_unit_id: 'u2', status: 'credited', credit_reconciled_at: null },
            { id: 'p4', credit_unit_id: 'u3', status: 'credited', credit_reconciled_at: 'antes' },
        ];
        const reconciledUnits: string[] = [];
        const count = await reconcileParkingPayoutCredits('c1', async (_community, unitId) => { reconciledUnits.push(unitId); });
        expect(reconciledUnits).toEqual(['u1', 'u2']);
        expect(count).toBe(3);
        expect(state.updated.sort()).toEqual(['p1', 'p2', 'p3']);
    });

    it('si recalcular abre otro abono, lo toma en la vuelta siguiente (máximo 3 vueltas)', async () => {
        state.rows = [{ id: 'p1', credit_unit_id: 'u1', status: 'credited', credit_reconciled_at: null }];
        let next = 2;
        const units: string[] = [];
        await reconcileParkingPayoutCredits('c1', async (_community, unitId) => {
            units.push(unitId);
            state.rows.push({ id: `p${next}`, credit_unit_id: `u${next}`, status: 'credited', credit_reconciled_at: null });
            next += 1;
        });
        expect(units).toEqual(['u1', 'u2', 'u3']);
    });
});
