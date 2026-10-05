import { describe, expect, it } from 'vitest';
import { prorateExpenses, type ProrationExpense, type ProrationUnit } from '@/lib/finance/prorration';
import { applyWaterConsumption, consumptionM3, previousBillingMonth, waterPeriodFromBillingMonth } from '@/lib/finance/waterBilling';

function unit(id: string, sharePermille: number | null, consumptionM3Value: number | null = null): ProrationUnit {
    return { id, label: id, sharePermille, consumptionM3: consumptionM3Value };
}

describe('consumo de agua en el prorrateo', () => {
    it('calcula m³ entre lecturas consecutivas y rechaza un medidor que retrocede', () => {
        expect(consumptionM3(120.4, 110)).toBe(10.4);
        expect(consumptionM3(100, 110)).toBeNull();
        expect(consumptionM3(100, null)).toBeNull();
        expect(waterPeriodFromBillingMonth('2026-09')).toEqual({ month: 'Septiembre', year: 2026 });
        expect(previousBillingMonth('2026-01')).toBe('2025-12');
    });

    it('pasa el egreso de agua a consumo cuando hay lecturas consecutivas', () => {
        const result = applyWaterConsumption({
            billingMonth: '2026-09',
            expenses: [
                { id: 'agua', category: 'water', label: 'Agua', amount: 30_000, prorateMethod: 'share' },
                { id: 'luz', category: 'electricity', label: 'Luz', amount: 10_000, prorateMethod: 'share' },
            ],
            units: [unit('a', 500), unit('b', 500)],
            readings: [
                { unitId: 'a', periodMonth: 'Agosto', year: 2026, value: 100 },
                { unitId: 'a', periodMonth: 'Septiembre', year: 2026, value: 130 },
                { unitId: 'b', periodMonth: 'Agosto', year: 2026, value: 200 },
                { unitId: 'b', periodMonth: 'Septiembre', year: 2026, value: 210 },
            ],
        });
        expect(result.expenses.find(row => row.id === 'agua')?.prorateMethod).toBe('consumption');
        expect(result.expenses.find(row => row.id === 'luz')?.prorateMethod).toBe('share');
        expect(result.units.find(row => row.id === 'a')?.consumptionM3).toBe(30);
        expect(result.units.find(row => row.id === 'b')?.consumptionM3).toBe(10);
    });

    it('reparte el agua por m³ sin perder pesos', () => {
        const result = prorateExpenses(
            [{ id: 'agua', category: 'water', label: 'Agua', amount: 40_000, prorateMethod: 'consumption' }],
            [unit('a', 500, 30), unit('b', 500, 10)],
        );
        expect(result.totalCharged).toBe(40_000);
        expect(result.units.find(row => row.unitId === 'a')!.total).toBe(30_000);
        expect(result.units.find(row => row.unitId === 'b')!.total).toBe(10_000);
        expect(result.units[0].items[0].label).toContain('m³');
    });

    it('avisa y no cambia el método si nadie tiene dos lecturas', () => {
        const result = applyWaterConsumption({
            billingMonth: '2026-09',
            expenses: [{ id: 'agua', category: 'water', label: 'Agua', amount: 10_000, prorateMethod: 'share' }],
            units: [unit('a', 1000)],
            readings: [{ unitId: 'a', periodMonth: 'Septiembre', year: 2026, value: 50 }],
        });
        expect(result.expenses[0].prorateMethod).toBe('share');
        expect(result.warnings.join(' ')).toMatch(/alícuota/);
    });
});
