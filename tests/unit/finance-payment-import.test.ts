import { describe, expect, it } from 'vitest';
import { BillingError } from '@/lib/finance/billingService';
import { buildUnitIndex, planPaymentImport, unitDisplayLabel, type ImportUnit } from '@/lib/finance/paymentImport';

const units: ImportUnit[] = [
    { id: 'a', number: '101', tower: 'A' },
    { id: 'b', number: '101', tower: 'B' },
    { id: 'c', number: '202', tower: 'A' },
];

describe('carga masiva de pagos', () => {
    it('arma el plan con unidad, monto, fecha y medio', () => {
        const rows = planPaymentImport([
            ['Unidad', 'Monto', 'Fecha', 'Medio', 'Referencia'],
            ['202', '15.000', '28/09/2026', 'Transferencia', 'OP-1'],
            ['Depto 202', 15000, '2026-09-29', 'efectivo', 'OP-2'],
        ], units);
        expect(rows).toHaveLength(2);
        expect(rows[0]).toMatchObject({
            unitId: 'c', unitLabel: '202', amount: 15_000, paidAt: '2026-09-28', method: 'transfer', status: 'ready',
        });
        expect(rows[1].method).toBe('cash');
    });

    it('falla la fila si el número existe en más de una torre', () => {
        const [row] = planPaymentImport([
            ['Unidad', 'Monto', 'Fecha'],
            ['101', '1000', '28/09/2026'],
        ], units);
        expect(row.status).toBe('error');
        expect(row.message).toMatch(/más de una unidad/);
        expect(row.unitId).toBeNull();
    });

    it('acepta la torre para desambiguar', () => {
        const [row] = planPaymentImport([
            ['Unidad', 'Monto', 'Fecha'],
            ['B-101', '1000', '28/09/2026'],
        ], units);
        expect(row.status).toBe('ready');
        expect(row.unitId).toBe('b');
        expect(row.unitLabel).toBe('B-101');
    });

    it('falla la segunda fila si la referencia se repite en la misma unidad', () => {
        const rows = planPaymentImport([
            ['Unidad', 'Monto', 'Fecha', 'Referencia'],
            ['202', '1000', '28/09/2026', 'ABC'],
            ['202', '2000', '29/09/2026', 'ABC'],
        ], units);
        expect(rows[0].status).toBe('ready');
        expect(rows[1].status).toBe('error');
        expect(rows[1].message).toMatch(/se repite/);
    });

    it('exige las columnas Unidad, Monto y Fecha', () => {
        expect(() => planPaymentImport([['Foo', 'Bar']], units)).toThrow(BillingError);
        expect(() => planPaymentImport([['Unidad', 'Fecha'], ['202', '28/09/2026']], units)).toThrow(/Monto/);
    });

    it('marca ambiguo un número repetido en el índice', () => {
        const index = buildUnitIndex(units);
        expect(index.get('101')).toBe('ambiguous');
        expect(index.get('b101')).toEqual(units[1]);
        expect(unitDisplayLabel(units[0])).toBe('101');
        expect(unitDisplayLabel(units[1])).toBe('B-101');
    });
});
