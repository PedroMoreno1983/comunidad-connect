import { describe, expect, it } from 'vitest';
import { buildFinancialStatements, type StatementInputs } from '@/lib/finance/financialStatements';

const base: StatementInputs = {
    year: 2026,
    cutoffMonth: '2026-03',
    openingCash: 100_000,
    journalBank: 90_000,
    unitIds: ['a', 'b'],
    expenses: [
        { unitId: 'a', month: '2026-01', amount: 50_000 },
        { unitId: 'b', month: '2026-02', amount: 50_000 },
    ],
    charges: [{ unitId: 'a', month: '2026-02', kind: 'fine', amount: 10_000 }],
    payments: [
        { unitId: 'a', paidAt: '2026-01-10', amount: 50_000 },
        { unitId: 'b', paidAt: '2026-03-02', amount: 20_000 },
    ],
    communityExpenses: [
        { month: '2026-01', category: 'electricity', amount: 30_000 },
        { month: '2026-02', category: 'water', amount: 10_000 },
    ],
    reserveMovements: [{ month: '2026-01', kind: 'contribution', amount: 5_000, label: 'Aporte emisión' }],
};

describe('estados financieros', () => {
    it('arma resultado, flujo y situación sin descuadrar el patrimonio', () => {
        const statements = buildFinancialStatements(base);
        expect(statements.income.totalIncome).toBe(110_000);
        expect(statements.income.totalExpenses).toBe(40_000);
        expect(statements.income.reserveTransfer).toBe(5_000);
        expect(statements.income.result).toBe(65_000);
        expect(statements.cashFlow.months).toHaveLength(3);
        expect(statements.cashFlow.endingCash).toBe(statements.position.cash);
        expect(statements.position.journalBank).toBe(90_000);
        expect(
            statements.position.cash + statements.position.receivables,
        ).toBe(statements.position.totalAssets);
        expect(
            statements.position.advances + statements.position.reserveFund + statements.position.accumulatedSurplus,
        ).toBe(statements.position.totalAssets);
    });

    it('no mete un fondo de pintura en el traspaso a la reserva legal ni un descuento de comité como ingreso', () => {
        const statements = buildFinancialStatements({
            ...base,
            charges: [
                ...base.charges,
                { unitId: 'a', month: '2026-02', kind: 'other', amount: 15_000, label: 'Descuento de comité (Ley 21.442)' },
            ],
            reserveMovements: [
                ...base.reserveMovements,
                { month: '2026-02', kind: 'contribution', amount: 40_000, label: '[pintura] Recaudación' },
            ],
        });
        expect(statements.income.reserveTransfer).toBe(5_000);
        expect(statements.income.totalIncome).toBe(110_000);
        expect(statements.position.reserveFund).toBe(5_000);
    });
});
