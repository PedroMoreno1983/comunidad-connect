import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { parseBankStatement } from '@/lib/finance/bankStatementParser';
import { planBankImport, type BankIdentityRow } from '@/lib/finance/bankImportIdentity';

describe('cartola bancaria', () => {
    it('lee CSV chileno con abonos, cargos y glosas entre comillas', async () => {
        const csv = 'Fecha;Abonos;Cargos;Glosa;N° operación\n'
            + '28/09/2026;1.000;0;"Pago, unidad 101";ABC-1\n'
            + '29/09/2026;0;12.500;Comisión;ABC-2\n';
        const file = new File([csv], 'cartola.csv', { type: 'text/csv' });
        expect(await parseBankStatement(file)).toEqual([
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago, unidad 101', reference: 'ABC-1', importKey: expect.any(String) },
            { txnDate: '2026-09-29', amount: -12500, description: 'Comisión', reference: 'ABC-2', importKey: expect.any(String) },
        ]);
    });

    it('rechaza fechas imposibles antes de importar', async () => {
        const file = new File(['Fecha,Monto\n31/02/2026,1000'], 'cartola.csv');
        await expect(parseBankStatement(file)).rejects.toThrow(/Fila 2.*Fecha inválida/);
    });

    it('detecta el separador en la fila de cabecera, no en el titulo previo', async () => {
        const csv = 'Cartola cuenta corriente\nFecha;Abonos;Cargos;Glosa\n28/09/2026;1.000;0;Pago unidad\n';
        const file = new File([csv], 'cartola.csv', { type: 'application/vnd.ms-excel' });
        expect(await parseBankStatement(file)).toEqual([
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago unidad', reference: '', importKey: expect.any(String) },
        ]);
    });

    it('usa el resultado visible de una formula de la planilla', async () => {
        const book = new ExcelJS.Workbook();
        const sheet = book.addWorksheet('Cartola');
        sheet.addRow(['Fecha', 'Monto', 'Glosa']);
        sheet.addRow(['28/09/2026', { formula: '500+500', result: 1000 }, 'Abono']);
        const buffer = await book.xlsx.writeBuffer();
        const file = new File([buffer], 'cartola.xlsx');
        expect(await parseBankStatement(file)).toEqual([
            { txnDate: '2026-09-28', amount: 1000, description: 'Abono', reference: '', importKey: expect.any(String) },
        ]);
    });

    it('identifica filas iguales dentro del archivo y distingue otra cartola', async () => {
        const content = 'Fecha;Monto;Glosa\n28/09/2026;1.000;Pago\n28/09/2026;1.000;Pago\n';
        const first = await parseBankStatement(new File([content], 'septiembre.csv'));
        const retry = await parseBankStatement(new File([content], 'septiembre.csv'));
        const other = await parseBankStatement(new File([`Cuenta 123\n${content}`], 'otra-cartola.csv'));
        expect(first[0].importKey).not.toBe(first[1].importKey);
        expect(first.map(row => row.importKey)).toEqual(retry.map(row => row.importKey));
        expect(first[0].importKey).not.toBe(other[0].importKey);
    });
});

describe('identidad de una cartola', () => {
    const legacy = (id: string, reference: string | null, importKey: string | null = null): BankIdentityRow => ({
        id, txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference, importKey,
    });

    it('adopta la fila vieja sin clave y no la usa dos veces', () => {
        const existing = [legacy('a', null), legacy('b', null)];
        const claimed = new Set<string>();
        const first = planBankImport(
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference: null, importKey: 'aa' },
            existing, claimed,
        );
        expect(first).toEqual({ kind: 'adopt', id: 'a' });
        if (first.kind === 'adopt') claimed.add(first.id);
        const second = planBankImport(
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference: null, importKey: 'bb' },
            existing, claimed,
        );
        expect(second).toEqual({ kind: 'adopt', id: 'b' });
    });

    it('no confunde otra cartola cuando la fila vieja ya tiene clave', () => {
        const existing = [legacy('a', 'OP-1', 'archivo-uno')];
        expect(planBankImport(
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference: 'OP-1', importKey: 'archivo-dos' },
            existing, new Set(),
        )).toEqual({ kind: 'insert' });
    });

    it('omite la misma cartola y un alta manual repetida', () => {
        const existing = [legacy('a', null, 'misma-cartola')];
        expect(planBankImport(
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference: null, importKey: 'misma-cartola' },
            existing, new Set(),
        )).toEqual({ kind: 'skip' });
        expect(planBankImport(
            { txnDate: '2026-09-28', amount: 1000, description: 'Pago', reference: null, importKey: null },
            existing, new Set(),
        )).toEqual({ kind: 'skip' });
    });
});
