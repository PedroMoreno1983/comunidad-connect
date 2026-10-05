import { describe, expect, it } from 'vitest';
import { buildBillNotice, monthStart, nextMonth, previousMonths, type NoticeInputs, type NoticeUnitRow } from '@/lib/finance/billNotice';

const unit: NoticeUnitRow = {
    id: 'u1',
    number: '101',
    tower: 'A',
    sharePermille: 250,
    ownerName: 'Ana Pérez',
};

function inputs(overrides: Partial<NoticeInputs> = {}): NoticeInputs {
    return {
        month: '2026-09',
        community: { name: 'Edificio Los Robles', address: 'Av. Principal 100' },
        units: [unit],
        expenses: [
            { id: 'e-aug', unitId: 'u1', month: '2026-08', amount: 40_000, dueDate: '2026-09-05' },
            { id: 'e-sep', unitId: 'u1', month: '2026-09', amount: 50_000, dueDate: '2026-10-05' },
        ],
        items: [
            { expenseId: 'e-sep', label: 'Electricidad', amount: 30_000 },
            { expenseId: 'e-sep', label: 'Agua (8 m³)', amount: 20_000 },
        ],
        charges: [
            { unitId: 'u1', month: '2026-08', kind: 'fine', label: 'Ruidos', amount: 10_000, status: 'pending' },
            { unitId: 'u1', month: '2026-09', kind: 'interest', label: 'Mora agosto', amount: 2_000, status: 'pending' },
        ],
        payments: [
            { unitId: 'u1', paidAt: '2026-08-10', amount: 40_000 },
            { unitId: 'u1', paidAt: '2026-09-03', amount: 20_000 },
        ],
        reserveRatio: 0.1,
        summary: {
            monthIncome: 1_200_000,
            monthExpenses: 900_000,
            cashBalance: 400_000,
            cashBalanceIsEstimate: false,
            reserveFundBalance: 80_000,
        },
        ...overrides,
    };
}

describe('aviso de cobro art. 31', () => {
    it('calcula saldo anterior, cargos del mes y pagos desde el inicio del periodo', () => {
        const notice = buildBillNotice(inputs(), unit);
        expect(notice.gastoComun).toBe(50_000);
        expect(notice.reserveContribution).toBe(5_000);
        expect(notice.previousBalance).toBe(10_000);
        expect(notice.periodCharges).toBe(52_000);
        expect(notice.paymentsSinceStart).toBe(20_000);
        expect(notice.totalDue).toBe(42_000);
        expect(notice.items).toHaveLength(2);
        expect(notice.unpaidPenalties.map(row => row.kind)).toEqual(['Multa', 'Interés por mora']);
        expect(notice.summary.monthIncome).toBe(1_200_000);
    });

    it('resta el descuento de comité del total a pagar', () => {
        const notice = buildBillNotice(inputs({
            charges: [
                { unitId: 'u1', month: '2026-09', kind: 'other', label: 'Descuento de comité (Ley 21.442)', amount: 8_000, status: 'paid', notes: 'ley_21442_committee_discount' },
            ],
        }), unit);
        expect(notice.monthCharges[0].amount).toBe(-8_000);
        expect(notice.monthCharges[0].kind).toBe('Descuento de comité');
        expect(notice.periodCharges).toBe(42_000);
        expect(notice.previousBalance).toBe(0);
        expect(notice.totalDue).toBe(22_000);
    });

    it('muestra saldo a favor cuando se pagó de más', () => {
        const notice = buildBillNotice(inputs({
            payments: [{ unitId: 'u1', paidAt: '2026-09-02', amount: 200_000 }],
            charges: [],
            expenses: [{ id: 'e-sep', unitId: 'u1', month: '2026-09', amount: 50_000, dueDate: null }],
        }), unit);
        expect(notice.previousBalance).toBe(0);
        expect(notice.totalDue).toBe(-150_000);
    });

    it('etiqueta unidades de otra torre y arma los 6 meses de historia', () => {
        const other: NoticeUnitRow = { ...unit, tower: 'B', number: '101' };
        const notice = buildBillNotice(inputs({ units: [other] }), other);
        expect(notice.unit.label).toBe('B-101');
        expect(notice.history).toHaveLength(6);
        expect(notice.history[5].month).toBe('2026-09');
        expect(previousMonths('2026-01', 2)).toEqual(['2025-12', '2026-01']);
        expect(monthStart('2026-09')).toBe('2026-09-01');
        expect(nextMonth('2026-12')).toBe('2027-01');
    });
});
