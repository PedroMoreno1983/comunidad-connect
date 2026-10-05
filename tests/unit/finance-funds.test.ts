import { describe, expect, it } from 'vitest';
import { formatFundLabel, groupFundMovements, LEGAL_RESERVE_FUND, parseFundLabel } from '@/lib/finance/funds';

describe('fondos adicionales sobre reserve_fund_movements', () => {
    it('deja el fondo legal sin prefijo y etiqueta los demás', () => {
        expect(parseFundLabel('Aporte del gasto común 2026-09')).toEqual({
            fundName: LEGAL_RESERVE_FUND,
            description: 'Aporte del gasto común 2026-09',
        });
        expect(formatFundLabel('reserva', 'Aporte extra')).toBe('Aporte extra');
        expect(formatFundLabel('pintura', 'Fachada poniente')).toBe('[pintura] Fachada poniente');
        expect(parseFundLabel('[pintura] Fachada poniente')).toEqual({
            fundName: 'pintura',
            description: 'Fachada poniente',
        });
    });

    it('separa saldos por fondo para no mezclar la reserva legal con pintura o ascensor', () => {
        const grouped = groupFundMovements([
            { kind: 'contribution', amount: 100_000, label: 'Aporte emisión' },
            { kind: 'withdrawal', amount: 20_000, label: 'Uso reserva' },
            { kind: 'contribution', amount: 50_000, label: '[pintura] Recaudación extraordinaria' },
            { kind: 'withdrawal', amount: 10_000, label: '[pintura] Andamios' },
        ]);
        expect(grouped.find(fund => fund.name === LEGAL_RESERVE_FUND)).toMatchObject({
            balance: 80_000,
            totalContributions: 100_000,
            totalWithdrawals: 20_000,
        });
        expect(grouped.find(fund => fund.name === 'pintura')).toMatchObject({
            balance: 40_000,
            totalContributions: 50_000,
            totalWithdrawals: 10_000,
        });
    });
});
