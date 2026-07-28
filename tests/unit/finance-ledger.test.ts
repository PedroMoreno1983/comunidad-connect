import { describe, expect, it } from 'vitest';
import {
    buildAccountStatement, calculateLateInterest, monthsBetween,
    type LedgerCharge, type LedgerPayment,
} from '@/lib/finance/ledger';

function charge(id: string, month: string, amount: number, dueDate: string, kind: LedgerCharge['kind'] = 'gasto_comun'): LedgerCharge {
    return { id, kind, label: `Cargo ${id}`, amount, month, dueDate, createdAt: `${dueDate}T00:00:00Z` };
}

function payment(id: string, paidAt: string, amount: number, reference: string | null = null): LedgerPayment {
    return { id, amount, paidAt, method: 'transfer', reference, createdAt: `${paidAt}T00:00:00Z` };
}

describe('buildAccountStatement', () => {
    it('arrastra la deuda impaga de un mes al siguiente', () => {
        const statement = buildAccountStatement(
            [charge('c1', '2026-05', 100_000, '2026-06-05'), charge('c2', '2026-06', 120_000, '2026-07-05')],
            [],
            '2026-07-10',
        );

        expect(statement.balance).toBe(220_000);
        // El saldo del último movimiento es el acumulado, no el del mes.
        expect(statement.entries.at(-1)!.balance).toBe(220_000);
    });

    it('descuenta los pagos del saldo', () => {
        const statement = buildAccountStatement(
            [charge('c1', '2026-05', 100_000, '2026-06-05')],
            [payment('p1', '2026-06-03', 100_000)],
            '2026-06-10',
        );

        expect(statement.balance).toBe(0);
        expect(statement.overdueAmount).toBe(0);
    });

    it('soporta pago parcial: queda debiendo la diferencia, no el total', () => {
        const statement = buildAccountStatement(
            [charge('c1', '2026-05', 100_000, '2026-06-05')],
            [payment('p1', '2026-06-03', 60_000)],
            '2026-06-10',
        );

        expect(statement.balance).toBe(40_000);
        expect(statement.overdueAmount).toBe(40_000);
    });

    it('imputa los pagos a la deuda más antigua primero', () => {
        // Debe mayo y junio, paga el equivalente a mayo: junio queda pendiente,
        // mayo no. Si se imputara al revés, mayo aparecería moroso más tiempo.
        const statement = buildAccountStatement(
            [charge('c1', '2026-05', 100_000, '2026-06-05'), charge('c2', '2026-06', 120_000, '2026-07-05')],
            [payment('p1', '2026-06-04', 100_000)],
            '2026-07-10',
        );

        expect(statement.overdueAmount).toBe(120_000);
        expect(statement.oldestOverdueMonth).toBe('2026-06');
    });

    it('no cuenta como vencido un cargo cuyo vencimiento aún no llega', () => {
        const statement = buildAccountStatement(
            [charge('c1', '2026-08', 100_000, '2026-09-05')],
            [],
            '2026-08-15',
        );

        expect(statement.balance).toBe(100_000);
        expect(statement.overdueAmount).toBe(0);
        expect(statement.oldestOverdueMonth).toBeNull();
    });

    it('refleja saldo a favor cuando la unidad pagó de más', () => {
        const statement = buildAccountStatement(
            [charge('c1', '2026-05', 100_000, '2026-06-05')],
            [payment('p1', '2026-06-03', 150_000)],
            '2026-06-10',
        );

        expect(statement.balance).toBe(-50_000);
        expect(statement.overdueAmount).toBe(0);
    });

    it('ordena el cargo antes que el pago del mismo día', () => {
        // No se puede pagar algo que todavía no se cobró: si el pago quedara
        // primero, la cartola mostraría un saldo a favor que nunca existió.
        const statement = buildAccountStatement(
            [charge('c1', '2026-06', 50_000, '2026-06-05')],
            [payment('p1', '2026-06-05', 50_000)],
            '2026-06-10',
        );

        expect(statement.entries[0].kind).toBe('gasto_comun');
        expect(statement.entries[0].balance).toBe(50_000);
        expect(statement.entries[1].kind).toBe('payment');
        expect(statement.entries[1].balance).toBe(0);
    });

    it('mezcla multas e intereses con el gasto común en una sola cartola', () => {
        const statement = buildAccountStatement(
            [
                charge('c1', '2026-06', 100_000, '2026-07-05'),
                charge('c2', '2026-06', 30_000, '2026-07-05', 'fine'),
                charge('c3', '2026-07', 2_000, '2026-08-05', 'interest'),
            ],
            [],
            '2026-08-10',
        );

        expect(statement.totalCharged).toBe(132_000);
        expect(statement.balance).toBe(132_000);
        expect(statement.entries.map(e => e.kind)).toContain('fine');
        expect(statement.entries.map(e => e.kind)).toContain('interest');
    });

    it('devuelve una cartola vacía sin reventar', () => {
        const statement = buildAccountStatement([], [], '2026-07-10');
        expect(statement.entries).toEqual([]);
        expect(statement.balance).toBe(0);
        expect(statement.overdueAmount).toBe(0);
    });
});

describe('calculateLateInterest', () => {
    it('aplica la tasa mensual sobre el capital adeudado', () => {
        expect(calculateLateInterest(100_000, 1.5, 1)).toBe(1_500);
        expect(calculateLateInterest(100_000, 1.5, 3)).toBe(4_500);
    });

    it('no capitaliza: 3 meses al 1,5% es 4,5%, no interés compuesto', () => {
        const simple = calculateLateInterest(100_000, 1.5, 3);
        const compound = Math.round(100_000 * (1.015 ** 3 - 1));
        expect(simple).toBe(4_500);
        expect(simple).toBeLessThan(compound);
    });

    it('devuelve cero cuando no corresponde cobrar interés', () => {
        expect(calculateLateInterest(0, 1.5, 2)).toBe(0);
        expect(calculateLateInterest(100_000, 0, 2)).toBe(0);
        expect(calculateLateInterest(100_000, 1.5, 0)).toBe(0);
        expect(calculateLateInterest(-5_000, 1.5, 2)).toBe(0);
    });
});

describe('monthsBetween', () => {
    it('cuenta meses completos incluso cruzando año', () => {
        expect(monthsBetween('2026-05', '2026-07')).toBe(2);
        expect(monthsBetween('2025-11', '2026-02')).toBe(3);
        expect(monthsBetween('2026-07', '2026-07')).toBe(0);
    });

    it('nunca devuelve negativo si el orden viene invertido', () => {
        expect(monthsBetween('2026-07', '2026-05')).toBe(0);
    });
});
