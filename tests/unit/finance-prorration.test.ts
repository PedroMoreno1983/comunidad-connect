import { describe, expect, it } from 'vitest';
import { prorateExpenses, type ProrationExpense, type ProrationUnit } from '@/lib/finance/prorration';

function unit(id: string, sharePermille: number | null): ProrationUnit {
    return { id, label: `Depto ${id}`, sharePermille };
}

function expense(amount: number, prorateMethod: 'share' | 'equal' = 'share'): ProrationExpense {
    return { id: `e-${amount}-${prorateMethod}`, category: 'other', label: 'Egreso', amount, prorateMethod };
}

describe('prorateExpenses', () => {
    it('reparte en partes iguales sin perder ni inventar pesos', () => {
        // 1.000.000 / 3 = 333.333,33 -- redondear cada parte por separado daría
        // 999.999 o 1.000.002. El total cobrado debe cuadrar exactamente.
        const result = prorateExpenses(
            [expense(1_000_000, 'equal')],
            [unit('a', null), unit('b', null), unit('c', null)],
        );

        expect(result.totalCharged).toBe(1_000_000);
        expect(result.totalCharged).toBe(result.totalExpenses);
        expect(result.units.map(u => u.total).sort()).toEqual([333_333, 333_333, 333_334]);
    });

    it('reparte por alícuota respetando la proporción', () => {
        const result = prorateExpenses(
            [expense(1_000_000)],
            [unit('a', 500), unit('b', 300), unit('c', 200)],
        );

        expect(result.totalCharged).toBe(1_000_000);
        expect(result.units.find(u => u.unitId === 'a')!.total).toBe(500_000);
        expect(result.units.find(u => u.unitId === 'b')!.total).toBe(300_000);
        expect(result.units.find(u => u.unitId === 'c')!.total).toBe(200_000);
        expect(result.fellBackToEqualSplit).toBe(false);
    });

    it('cae a partes iguales y avisa cuando falta alguna alícuota', () => {
        const result = prorateExpenses(
            [expense(900)],
            [unit('a', 500), unit('b', null), unit('c', 200)],
        );

        expect(result.fellBackToEqualSplit).toBe(true);
        expect(result.warnings.join(' ')).toContain('no tienen alícuota');
        // Partes iguales, no proporcional: si hubiera usado alícuotas, 'a'
        // tendría mucho más que 'c'.
        expect(result.units.map(u => u.total)).toEqual([300, 300, 300]);
        expect(result.totalCharged).toBe(900);
    });

    it('advierte si las alícuotas no suman 1000 por mil pero igual reparte todo', () => {
        const result = prorateExpenses(
            [expense(1000)],
            [unit('a', 100), unit('b', 100)],
        );

        expect(result.warnings.join(' ')).toContain('1000‰');
        expect(result.fellBackToEqualSplit).toBe(false);
        expect(result.totalCharged).toBe(1000);
        expect(result.units.map(u => u.total)).toEqual([500, 500]);
    });

    it('combina egresos por alícuota y por partes iguales en la misma emisión', () => {
        const result = prorateExpenses(
            [expense(1000, 'share'), expense(300, 'equal')],
            [unit('a', 750), unit('b', 250)],
        );

        // a: 750 (alicuota) + 150 (igual) = 900 ; b: 250 + 150 = 400
        expect(result.units.find(u => u.unitId === 'a')!.total).toBe(900);
        expect(result.units.find(u => u.unitId === 'b')!.total).toBe(400);
        expect(result.totalCharged).toBe(1300);
        expect(result.totalExpenses).toBe(1300);
    });

    it('conserva el desglose por egreso para que el residente vea en qué se va su gasto común', () => {
        const result = prorateExpenses(
            [
                { id: 'luz', category: 'electricity', label: 'Electricidad', amount: 200, prorateMethod: 'share' },
                { id: 'sueldo', category: 'salaries', label: 'Remuneraciones', amount: 400, prorateMethod: 'share' },
            ],
            [unit('a', 500), unit('b', 500)],
        );

        const first = result.units[0];
        expect(first.items).toHaveLength(2);
        expect(first.items.find(i => i.expenseId === 'luz')!.amount).toBe(100);
        expect(first.items.find(i => i.expenseId === 'sueldo')!.amount).toBe(200);
        expect(first.total).toBe(300);
    });

    it('cuadra exactamente con montos y alícuotas irregulares', () => {
        // Caso adverso: monto primo y alícuotas con decimales.
        const units = [unit('a', 333.3333), unit('b', 333.3333), unit('c', 333.3334)];
        const result = prorateExpenses([expense(1_000_003)], units);

        expect(result.totalCharged).toBe(1_000_003);
        expect(result.totalCharged).toBe(result.totalExpenses);
        // Ninguna unidad se lleva más de un peso de diferencia respecto de otra.
        const totals = result.units.map(u => u.total);
        expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(1);
    });

    it('ignora egresos en cero y no genera líneas vacías', () => {
        const result = prorateExpenses(
            [expense(0, 'equal'), expense(500, 'equal')],
            [unit('a', null), unit('b', null)],
        );

        expect(result.totalExpenses).toBe(500);
        expect(result.units.every(u => u.items.length === 1)).toBe(true);
    });

    it('no revienta si la comunidad no tiene unidades', () => {
        const result = prorateExpenses([expense(1000)], []);
        expect(result.units).toEqual([]);
        expect(result.totalCharged).toBe(0);
        expect(result.warnings.join(' ')).toContain('no tiene unidades');
    });

    it('reparte de forma determinista: dos corridas iguales dan el mismo resultado', () => {
        const units = [unit('a', null), unit('b', null), unit('c', null)];
        const first = prorateExpenses([expense(100, 'equal')], units);
        const second = prorateExpenses([expense(100, 'equal')], units);
        expect(first.units.map(u => u.total)).toEqual(second.units.map(u => u.total));
    });
});
