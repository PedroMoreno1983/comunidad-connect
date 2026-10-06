import { describe, expect, it } from 'vitest';
import { chooseOpenCharge, matchUnitFromGlosa, suggestDeposits, suggestUnitMatches, type DepositUnitCandidate } from '@/lib/finance/depositMatch';

const units: DepositUnitCandidate[] = [
    { id: 'u1204', number: '1204', tower: 'A' },
    { id: 'u1104', number: '1104', tower: 'A' },
    { id: 'u12', number: '12', tower: 'A' },
    { id: 'u805a', number: '805', tower: 'A' },
    { id: 'u805b', number: '805', tower: 'B' },
    { id: 'u150', number: '150', tower: 'A' },
];

describe('matchUnitFromGlosa', () => {
    it('lee depto 1204 y no lo confunde con 12', () => {
        expect(matchUnitFromGlosa('TEF DEPTO 1204 PEDRO', units)?.id).toBe('u1204');
        expect(matchUnitFromGlosa('depto1204', units)?.id).toBe('u1204');
    });

    it('exige un prefijo cuando el número tiene menos de tres dígitos', () => {
        expect(matchUnitFromGlosa('abono 12', units)).toBeNull();
        expect(matchUnitFromGlosa('departamento 12', units)?.id).toBe('u12');
    });

    it('no usa el 150 de un monto 150.000', () => {
        expect(matchUnitFromGlosa('TRANSFERENCIA $150.000 DEPTO 1204', units)?.id).toBe('u1204');
        expect(matchUnitFromGlosa('abono 150.000', units)).toBeNull();
    });

    it('no elige si el mismo número está en dos torres', () => {
        expect(matchUnitFromGlosa('pago 805', units)).toBeNull();
        expect(matchUnitFromGlosa('torre B depto 805', units)?.id).toBe('u805b');
        expect(matchUnitFromGlosa('B-805', units)?.id).toBe('u805b');
        expect(matchUnitFromGlosa('depto Z 1204', units)).toBeNull();
    });

    it('no elige si la glosa nombra dos unidades', () => {
        expect(matchUnitFromGlosa('depto 1204 y depto 1104', units)).toBeNull();
    });

    it('ignora un año suelto y acepta depto 2024', () => {
        const withYear = [...units, { id: 'u2024', number: '2024', tower: 'A' }];
        expect(matchUnitFromGlosa('pago 01/10/2024', withYear)).toBeNull();
        expect(matchUnitFromGlosa('depto 2024', withYear)?.id).toBe('u2024');
    });

    it('sigue encontrando la unidad en una segunda lectura', () => {
        expect(matchUnitFromGlosa('depto 1104', units)?.id).toBe('u1104');
        expect(matchUnitFromGlosa('depto 1204', units)?.id).toBe('u1204');
    });
});

describe('chooseOpenCharge', () => {
    const charges = [
        { id: 'old', unitId: 'u1204', month: '2026-08', amount: 80000 },
        { id: 'oct', unitId: 'u1204', month: '2026-10', amount: 150000 },
    ];

    it('prefiere el cobro cuyo monto es el del abono', () => {
        expect(chooseOpenCharge(charges, 150000)).toEqual({
            charge: charges[1],
            amountMatches: true,
        });
    });

    it('si ningún monto coincide, exige elegir el mes', () => {
        expect(chooseOpenCharge(charges, 40000).charge).toBeNull();
        expect(chooseOpenCharge(charges, 40000).amountMatches).toBe(false);
    });
});

describe('suggestDeposits', () => {
    it('propone registrar el abono en el mes que coincide', () => {
        const [proposal] = suggestDeposits(
            [{ id: 't1', amount: 150000, description: 'TEF DEPTO 1204', reference: 'OP-9' }],
            units,
            [{ id: 'oct', unitId: 'u1204', month: '2026-10', amount: 150000 }],
            [],
            new Set(),
        );
        expect(proposal).toMatchObject({
            kind: 'record',
            unitId: 'u1204',
            unitLabel: '1204',
            expenseId: 'oct',
            month: '2026-10',
            amountMatchesCharge: true,
        });
    });

    it('cruza un pago ya registrado en vez de crear otro', () => {
        const [proposal] = suggestDeposits(
            [{ id: 't1', amount: 150000, description: 'depto 1204' }],
            units,
            [],
            [{ id: 'p1', unitId: 'u1204', amount: 150000 }],
            new Set(),
        );
        expect(proposal).toMatchObject({ kind: 'match', paymentId: 'p1' });
    });

    it('no propone nada si hay dos pagos iguales para esa unidad', () => {
        expect(suggestDeposits(
            [{ id: 't1', amount: 150000, description: 'depto 1204' }],
            units,
            [],
            [
                { id: 'p1', unitId: 'u1204', amount: 150000 },
                { id: 'p2', unitId: 'u1204', amount: 150000 },
            ],
            new Set(),
        )).toEqual([]);
    });

    it('no repite un movimiento que ya tiene calce de pago', () => {
        expect(suggestDeposits(
            [{ id: 't1', amount: 150000, description: 'depto 1204' }],
            units,
            [],
            [],
            new Set(['t1']),
        )).toEqual([]);
    });
});


describe('unit-scoped reconciliation', () => {
    const movements = [{ id: 't1', amount: 1000, description: 'depto 1204', date: '2026-10-05' }];
    it('does not suggest another unit even when amount and date match', () => {
        expect(suggestUnitMatches(movements, [{ id: 'wrong', unitId: 'u1104', amount: 1000, paidAt: '2026-10-05' }], units)).toEqual([]);
    });
    it('keeps ambiguous towers for manual review', () => {
        expect(suggestUnitMatches([{ ...movements[0], description: 'depto 805' }], [{ id: 'p', unitId: 'u805a', amount: 1000, paidAt: '2026-10-05' }], units)).toEqual([]);
    });
    it('does not assign an existing payment to a second transaction', () => {
        const payments = [{ id: 'p', unitId: 'u1204', amount: 1000, paidAt: '2026-10-05' }];
        expect(suggestDeposits(movements, units, [], payments, new Set(), new Set(['p'])).some(item => item.paymentId === 'p')).toBe(false);
    });
    it('does not match a payment from another month by amount alone', () => {
        expect(suggestDeposits(movements, units, [], [{ id: 'p', unitId: 'u1204', amount: 1000, paidAt: '2026-07-05' }], new Set())).toEqual([]);
    });
    it('does not preselect between equal balances in two months', () => {
        expect(chooseOpenCharge([{ id: 'a', unitId: 'u1204', month: '2026-09', amount: 1000 }, { id: 'b', unitId: 'u1204', month: '2026-10', amount: 1000 }], 1000).charge).toBeNull();
    });
});
