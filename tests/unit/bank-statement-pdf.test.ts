import { describe, expect, it } from 'vitest';
import { tableFromPdf } from '@/lib/finance/bankStatementParser';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { parseBankStatement } from '@/lib/finance/bankStatementParser';

describe('cartolas PDF conservadoras', () => {
    it('acepta una tabla con encabezados y continúa páginas de igual formato', () => {
        expect(tableFromPdf([
            [['Fecha', 'Glosa', 'Abonos', 'Cargos'], ['28/10/2026', 'Pago casa 101', '150.000', '']],
            [['Fecha', 'Glosa', 'Abonos', 'Cargos'], ['29/10/2026', 'Luz común', '', '40.000']],
        ])).toEqual([
            ['Fecha', 'Glosa', 'Abonos', 'Cargos'],
            ['28/10/2026', 'Pago casa 101', '150.000', ''],
            ['29/10/2026', 'Luz común', '', '40.000'],
        ]);
    });

    it('rechaza saldos sin columna inequívoca de movimiento', () => {
        expect(() => tableFromPdf([[['Fecha', 'Saldo'], ['28/10/2026', '150.000']]])).toThrow(/Monto o Abonos\/Cargos/);
    });

    it('rechaza tablas que cambian de columnas', () => {
        expect(() => tableFromPdf([
            [['Fecha', 'Monto'], ['28/10/2026', '150.000']],
            [['Fecha', 'Abono'], ['29/10/2026', '40.000']],
        ])).toThrow(/columnas distintas/);
    });

    it('lee un PDF tabular completo antes de ofrecer movimientos para confirmar', async () => {
        const document = await PDFDocument.create();
        const page = document.addPage([600, 800]);
        const font = await document.embedFont(StandardFonts.Helvetica);
        const columns = [40, 150, 395, 495, 560];
        const rows = [710, 675, 640];
        for (const x of columns) page.drawLine({ start: { x, y: rows[0] }, end: { x, y: rows[2] }, thickness: 1 });
        for (const y of rows) page.drawLine({ start: { x: columns[0], y }, end: { x: columns[4], y }, thickness: 1 });
        for (const [text, x] of [['Fecha', 46], ['Glosa', 156], ['Abonos', 401], ['Cargos', 501]] as const) {
            page.drawText(text, { x, y: 690, font, size: 10 });
        }
        for (const [text, x] of [['28/10/2026', 46], ['Pago casa 101', 156], ['150.000', 401]] as const) {
            page.drawText(text, { x, y: 655, font, size: 10 });
        }
        const file = new File([await document.save()], 'cartola.pdf', { type: 'application/pdf' });
        const movements = await parseBankStatement(file);
        expect(movements).toHaveLength(1);
        expect(movements[0]).toMatchObject({ txnDate: '2026-10-28', amount: 150000, description: 'Pago casa 101' });
    });
});
