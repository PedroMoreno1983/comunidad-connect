import { describe, it, expect } from 'vitest';
import { suggestMatches, summarize, dayGap } from '@/lib/finance/reconciliation';

describe('dayGap', () => {
    it('cuenta días absolutos entre fechas', () => {
        expect(dayGap('2026-07-10', '2026-07-10')).toBe(0);
        expect(dayGap('2026-07-10', '2026-07-13')).toBe(3);
        expect(dayGap('2026-07-13', '2026-07-10')).toBe(3);
    });
    it('devuelve NaN si una fecha no parsea', () => {
        expect(Number.isNaN(dayGap('2026-07-10', 'basura'))).toBe(true);
    });
});

describe('suggestMatches', () => {
    it('empareja monto idéntico dentro de la ventana', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-10' }];
        const pays = [{ id: 'p1', amount: 150000, paidAt: '2026-07-11' }];
        const result = suggestMatches(txns, pays);
        expect(result).toEqual([
            { transactionId: 't1', paymentId: 'p1', dayGap: 1, referenceMatch: false },
        ]);
    });

    it('ignora los egresos (montos negativos)', () => {
        const txns = [{ id: 't1', amount: -150000, date: '2026-07-10' }];
        const pays = [{ id: 'p1', amount: 150000, paidAt: '2026-07-10' }];
        expect(suggestMatches(txns, pays)).toEqual([]);
    });

    it('no empareja fuera de la ventana de días', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-01' }];
        const pays = [{ id: 'p1', amount: 150000, paidAt: '2026-07-20' }];
        expect(suggestMatches(txns, pays, 5)).toEqual([]);
    });

    it('sí empareja fuera de ventana cuando la referencia coincide', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-01', reference: 'TRX-998' }];
        const pays = [{ id: 'p1', amount: 150000, paidAt: '2026-07-25', reference: 'trx998' }];
        const result = suggestMatches(txns, pays, 5);
        expect(result).toHaveLength(1);
        expect(result[0].referenceMatch).toBe(true);
    });

    it('no sugiere nada ante un empate ambiguo (dos pagos idénticos)', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-10' }];
        const pays = [
            { id: 'p1', amount: 150000, paidAt: '2026-07-11' },
            { id: 'p2', amount: 150000, paidAt: '2026-07-09' },
        ];
        // Ambos a 1 día de diferencia, sin referencia: ambiguo -> sin sugerencia.
        expect(suggestMatches(txns, pays)).toEqual([]);
    });

    it('desempata por menor diferencia de días', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-10' }];
        const pays = [
            { id: 'p1', amount: 150000, paidAt: '2026-07-14' },
            { id: 'p2', amount: 150000, paidAt: '2026-07-11' },
        ];
        const result = suggestMatches(txns, pays);
        expect(result).toHaveLength(1);
        expect(result[0].paymentId).toBe('p2');
    });

    it('no usa el mismo pago para dos movimientos', () => {
        const txns = [
            { id: 't1', amount: 150000, date: '2026-07-10' },
            { id: 't2', amount: 150000, date: '2026-07-10' },
        ];
        const pays = [{ id: 'p1', amount: 150000, paidAt: '2026-07-10' }];
        const result = suggestMatches(txns, pays);
        expect(result).toHaveLength(1);
    });

    it('la referencia vence a la cercanía de fecha', () => {
        const txns = [{ id: 't1', amount: 150000, date: '2026-07-10', reference: 'OP12345' }];
        const pays = [
            { id: 'p1', amount: 150000, paidAt: '2026-07-10' },            // mismo día, sin ref
            { id: 'p2', amount: 150000, paidAt: '2026-07-13', reference: 'op-12345' }, // ref coincide
        ];
        const result = suggestMatches(txns, pays);
        expect(result).toHaveLength(1);
        expect(result[0].paymentId).toBe('p2');
        expect(result[0].referenceMatch).toBe(true);
    });
});

describe('summarize', () => {
    it('cuenta estados y detecta depósitos sin explicar', () => {
        const result = summarize([
            { amount: 150000, status: 'matched' },
            { amount: 150000, status: 'pending' },   // ingreso sin conciliar
            { amount: -80000, status: 'pending' },    // egreso pendiente, no cuenta como depósito
            { amount: 90000, status: 'ignored' },
        ]);
        expect(result.totalTransactions).toBe(4);
        expect(result.matched).toBe(1);
        expect(result.pending).toBe(2);
        expect(result.ignored).toBe(1);
        expect(result.unexplainedDeposits).toBe(1);
        expect(result.pendingInflowAmount).toBe(150000);
    });
});
