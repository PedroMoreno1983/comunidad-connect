import { describe, expect, it } from 'vitest';
import { buildDte, documentTotals, TaxDocumentError } from '@/lib/finance/taxDocumentBuilder';
import { normalizeRut } from '@/lib/utils/rut';
import type { InvoicingEmitter, TaxDocumentDraft } from '@/lib/types';

const emitter: InvoicingEmitter = {
    rut: '76.795.561-8',
    businessName: 'Administradora Los Andes SpA',
    activity: 'Administración de bienes inmuebles',
    activityCode: '682000',
    address: 'Av. Providencia 1234',
    commune: 'Providencia',
};

const draft: TaxDocumentDraft = {
    type: 33,
    issueDate: '2026-10-13',
    receiver: {
        rut: '76.430.498-5',
        businessName: 'Comunidad Edificio Ñuñoa',
        activity: 'Comunidad de copropietarios',
        address: 'Irarrázaval 2000',
        commune: 'Ñuñoa',
    },
    items: [
        { name: 'Honorarios de administración octubre', quantity: 1, unitPrice: 450000 },
        { name: 'Asesoría asamblea extraordinaria', quantity: 2, unitPrice: 37500 },
    ],
};

describe('documentos tributarios', () => {
    it('normaliza el RUT al formato del SII', () => {
        expect(normalizeRut('76.795.561-8')).toBe('76795561-8');
        expect(normalizeRut('76795561-9')).toBeNull();
    });

    it('calcula neto, IVA y total de una factura afecta', () => {
        expect(documentTotals(draft)).toEqual({ net: 525000, exempt: 0, tax: 99750, total: 624750 });
    });

    it('una factura exenta no lleva IVA y marca cada ítem como exento', () => {
        const { dte, totals } = buildDte({ ...draft, type: 34 }, emitter);
        expect(totals).toEqual({ net: 0, exempt: 525000, tax: 0, total: 525000 });
        expect(dte.Encabezado.Totales).toEqual({ MntExe: 525000, MntTotal: 525000 });
        expect(dte.Detalle.every(line => 'IndExe' in line && line.IndExe === 1)).toBe(true);
    });

    it('arma el DTE con los nombres del SII y los RUT normalizados', () => {
        const { dte } = buildDte(draft, emitter);
        expect(dte.Encabezado.IdDoc).toEqual({ TipoDTE: 33, Folio: 0, FchEmis: '2026-10-13', FmaPago: '2' });
        expect(dte.Encabezado.Emisor.RUTEmisor).toBe('76795561-8');
        expect(dte.Encabezado.Receptor).toMatchObject({ RUTRecep: '76430498-5', CmnaRecep: 'Ñuñoa' });
        expect(dte.Encabezado.Totales).toEqual({ MntNeto: 525000, TasaIVA: '19', IVA: 99750, MntTotal: 624750 });
        expect(dte.Detalle[1]).toEqual({ NroLinDet: 2, NmbItem: 'Asesoría asamblea extraordinaria', QtyItem: 2, PrcItem: 37500, MontoItem: 75000 });
    });

    it('rechaza antes de llamar al proveedor y dice todo lo que falta', () => {
        try {
            buildDte({ ...draft, receiver: { ...draft.receiver, rut: '1-1', commune: '' }, items: [{ name: 'x', quantity: 0, unitPrice: 10.5 }] }, emitter);
            throw new Error('debió fallar');
        } catch (error) {
            expect(error).toBeInstanceOf(TaxDocumentError);
            const problems = (error as TaxDocumentError).problems;
            expect(problems).toContain('El RUT del receptor no es válido.');
            expect(problems).toContain('Falta la comuna del receptor.');
            expect(problems.some(item => item.includes('cantidad'))).toBe(true);
            expect(problems.some(item => item.includes('precio entero'))).toBe(true);
        }
    });
});
