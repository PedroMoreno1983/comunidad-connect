import { describe, expect, it } from 'vitest';
import { parseBankStatement } from '@/lib/finance/bankStatementParser';

describe('cartola bancaria', () => {
    it('lee CSV chileno con abonos, cargos y glosas entre comillas', async () => {
        const csv = 'Fecha;Abonos;Cargos;Glosa;N° operación\n'
            + '28/09/2026;1.000;0;"Pago, unidad 101";ABC-1\n'
            + '29/09/2026;0;12.500;Comisión;ABC-2\n';
        const file = new File([csv], 'cartola.csv', { type: 'text/csv' });
        expect(await parseBankStatement(file)).toEqual([
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago, unidad 101', reference: 'ABC-1' },
            { txnDate: '2026-09-29', amount: -12500, description: 'Comisión', reference: 'ABC-2' },
        ]);
    });

    it('rechaza fechas imposibles antes de importar', async () => {
        const file = new File(['Fecha,Monto\n31/02/2026,1000'], 'cartola.csv');
        await expect(parseBankStatement(file)).rejects.toThrow(/Fila 2.*Fecha inválida/);
    });
});
