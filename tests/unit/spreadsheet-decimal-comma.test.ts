/**
 * Derechos desde Excel: los números salen con coma decimal (es-CL) para que
 * 1,125 no se lea como mil ciento veinticinco, y las celdas con formato de
 * porcentaje (guardadas como fracción) salen en %.
 */
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { spreadsheetBufferToRows } from '@/lib/server/spreadsheetText';
import { extractRightsFromTable } from '@/lib/onboarding/unitRightsImport';

async function workbook(rows: (string | number)[][], percentColumn?: number): Promise<Buffer> {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet('Nómina');
    rows.forEach(row => sheet.addRow(row));
    if (percentColumn) sheet.getColumn(percentColumn).eachCell((cell, rowNumber) => { if (rowNumber > 1) cell.numFmt = '0.000%'; });
    return Buffer.from(await book.xlsx.writeBuffer());
}

describe('spreadsheetBufferToRows con decimalComma', () => {
    it('números con coma decimal: 1,125 % no se lee como 1.125', async () => {
        const buffer = await workbook([['unidad', 'derechos_porcentaje'], ['101', 1.125], ['102', 98.875]]);
        const [sheet] = await spreadsheetBufferToRows(buffer, { decimalComma: true });
        expect(sheet[1][1]).toBe('1,125');
        const table = extractRightsFromTable(sheet);
        expect(table?.byUnit.get('101')).toBe('1,125');
        expect(table?.byUnit.get('102')).toBe('98,875');
    });

    it('celdas con formato de porcentaje (fracción en Excel) salen en %', async () => {
        const buffer = await workbook([['unidad', 'prorrateo'], ['101', 0.00532], ['102', 0.99468]], 2);
        const [sheet] = await spreadsheetBufferToRows(buffer, { decimalComma: true });
        expect(sheet[1][1]).toBe('0,532%');
        const table = extractRightsFromTable(sheet);
        expect(table?.meta.scale).toBe('percent');
        expect(table?.byUnit.get('101')).toBe('0,532');
    });

    it('sin la opción, igual que antes', async () => {
        const buffer = await workbook([['unidad', 'x'], ['101', 1.125]]);
        const [sheet] = await spreadsheetBufferToRows(buffer);
        expect(sheet[1][1]).toBe('1.125');
    });
});
