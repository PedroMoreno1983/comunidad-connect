import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { NextRequest } from 'next/server';
import { parsePersonalBill } from '@/lib/utilities/personalBill';
import { POST } from '@/app/api/resident/utility-accounts/read-bill/route';

vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: vi.fn().mockResolvedValue({ id: 'perfil-pruebas' }),
}));
vi.mock('@/lib/security/rateLimit', () => ({
    enforceDistributedRateLimit: vi.fn().mockResolvedValue(null),
}));

describe('boletas personales', () => {
    it('lee un PDF de texto y devuelve solo el identificador, monto y fecha', async () => {
        const pdf = await PDFDocument.create();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        const page = pdf.addPage();
        page.drawText('N° de cliente: 112233-4', { font, y: 700 });
        page.drawText('Total a pagar: $35.900', { font, y: 660 });
        page.drawText('Pagar hasta el 30 de noviembre de 2026', { font, y: 620 });
        const body = new FormData();
        body.set('file', new Blob([Uint8Array.from(await pdf.save())], { type: 'application/pdf' }), 'boleta-prueba.pdf');

        const result = await POST(new NextRequest('http://localhost/api/resident/utility-accounts/read-bill', { method: 'POST', body }));
        expect(result.status).toBe(200);
        expect(result.headers.get('cache-control')).toContain('no-store');
        expect(await result.json()).toEqual({ customerNumber: '112233-4', dueDate: '2026-11-30', amount: 35900 });
    });

    it('deja vacíos los datos dudosos y no reutiliza la fecha de emisión', () => {
        expect(parsePersonalBill('Emisión 06/11/2026 Vencimiento 31/11/2026 Total a pagar $20.000 Total a pagar $40.000'))
            .toEqual({ customerNumber: null, dueDate: null, amount: null });
        expect(parsePersonalBill('RUT 11.222.333-4 Fecha de emisión: 10/10/2026 Vence 20/10/2026'))
            .toEqual({ customerNumber: null, dueDate: '2026-10-20', amount: null });
    });
});
