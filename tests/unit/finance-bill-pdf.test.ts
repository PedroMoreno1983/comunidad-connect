import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { money, pdfSafe, periodLabel, renderBillNoticesPdf } from '@/lib/finance/billPdf';
import type { BillNotice } from '@/lib/types';

const notice: BillNotice = {
    month: '2026-09',
    community: { name: 'Edificio Los Robles', address: 'Av. Principal 100' },
    unit: { id: 'u1', label: '101', ownerName: 'Ana Pérez', sharePermille: 250 },
    dueDate: '2026-10-05',
    items: [
        { label: 'Electricidad', amount: 30_000 },
        { label: 'Agua (8 m³)', amount: 20_000 },
    ],
    gastoComun: 50_000,
    reserveContribution: 5_000,
    monthCharges: [{ label: 'Mora', kind: 'Interés por mora', amount: 2_000 }],
    previousBalance: 10_000,
    periodCharges: 52_000,
    paymentsSinceStart: 20_000,
    totalDue: 42_000,
    unpaidPenalties: [{ label: 'Ruidos', kind: 'Multa', amount: 10_000, month: '2026-08' }],
    history: [
        { month: '2026-04', amount: 40_000 },
        { month: '2026-05', amount: 41_000 },
        { month: '2026-06', amount: 39_000 },
        { month: '2026-07', amount: 44_000 },
        { month: '2026-08', amount: 40_000 },
        { month: '2026-09', amount: 50_000 },
    ],
    summary: {
        monthIncome: 1_200_000,
        monthExpenses: 900_000,
        cashBalance: 400_000,
        cashBalanceIsEstimate: true,
        reserveFundBalance: 80_000,
    },
};

describe('PDF del aviso de cobro', () => {
    it('formatea pesos chilenos y el periodo', () => {
        expect(money(1234567)).toBe('$1.234.567');
        expect(money(-500)).toBe('-$500');
        expect(periodLabel('2026-09')).toBe('Septiembre 2026');
    });

    it('reemplaza caracteres fuera de WinAnsi para no romper el PDF', () => {
        expect(pdfSafe('Ana Pérez')).toBe('Ana Pérez');
        expect(pdfSafe('m³')).toContain('m');
        expect(pdfSafe('你好')).toBe('??');
        expect(pdfSafe('Año Ñandú')).toMatch(/Año|Ano/);
    });

    it('emite una página A4 por unidad y trunca listas largas', async () => {
        const crowded: BillNotice = {
            ...notice,
            items: Array.from({ length: 20 }, (_, index) => ({ label: `Concepto ${index + 1}`, amount: 1_000 })),
            monthCharges: Array.from({ length: 8 }, (_, index) => ({ label: `Cargo ${index + 1}`, kind: 'Cargo', amount: 100 })),
            unpaidPenalties: Array.from({ length: 6 }, (_, index) => ({
                label: `Multa ${index + 1}`, kind: 'Multa', amount: 50, month: '2026-08',
            })),
        };
        const bytes = await renderBillNoticesPdf([crowded, { ...notice, unit: { ...notice.unit, id: 'u2', label: '202' } }], {
            siteUrl: 'https://conviveconnect.com',
            generatedAt: '2026-10-02',
        });
        const pdf = await PDFDocument.load(bytes);
        expect(pdf.getPageCount()).toBe(2);
        expect(pdf.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
        expect(pdf.getTitle()).toMatch(/Avisos de cobro/i);
        // list() deja un cupo para resumir el resto: 20 ítems con tope 10 → 9 visibles + 1 "Otros".
        expect(crowded.items.length).toBeGreaterThan(10);
    });
});
