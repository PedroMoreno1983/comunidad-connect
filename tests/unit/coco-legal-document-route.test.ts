import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/agentIdentity', () => ({ getAuthenticatedAgentProfile: vi.fn().mockResolvedValue({ id: 'u-1', community_id: 'c-1' }) }));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: vi.fn().mockResolvedValue(null) }));

import { POST } from '@/app/api/coco/legal-document/route';
import { PDFDocument, StandardFonts } from 'pdf-lib';

function requestWithFile(name: string, content: string) {
    const form = new FormData();
    form.append('file', new File([content], name));
    return new Request('http://localhost/api/coco/legal-document', { method: 'POST', body: form });
}

describe('lectura de documentos legales para CoCo', () => {
    it('extrae texto y no guarda el archivo', async () => {
        const response = await POST(requestWithFile('reglamento.txt', '  Artículo 1.  Uso de bienes comunes.  '));
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ name: 'reglamento.txt', text: 'Artículo 1. Uso de bienes comunes.', truncated: false });
        expect(response.headers.get('cache-control')).toBe('no-store');
    });

    it('rechaza extensiones ajenas y PDFs falsos', async () => {
        const unsupported = await POST(requestWithFile('orden.exe', 'texto'));
        expect(unsupported.status).toBe(400);
        const invalidPdf = await POST(requestWithFile('norma.pdf', 'no es PDF'));
        expect(invalidPdf.status).toBe(400);
    });

    it('lee un PDF de texto sin guardar el archivo', async () => {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage();
        const font = await pdf.embedFont(StandardFonts.Helvetica);
        page.drawText('Reglamento de copropiedad', { x: 40, y: 700, font });
        const bytes = await pdf.save();
        const form = new FormData();
        form.append('file', new File([bytes], 'reglamento.pdf', { type: 'application/pdf' }));
        const response = await POST(new Request('http://localhost/api/coco/legal-document', { method: 'POST', body: form }));
        expect(response.status).toBe(200);
        expect((await response.json()).text).toContain('Reglamento de copropiedad');
    });

    it('renderiza las primeras páginas de un plano PDF sin texto', async () => {
        const pdf = await PDFDocument.create();
        const page = pdf.addPage([600, 400]);
        page.drawRectangle({ x: 80, y: 80, width: 300, height: 200 });
        const bytes = await pdf.save();
        const form = new FormData();
        form.append('file', new File([bytes], 'plano.pdf', { type: 'application/pdf' }));
        const response = await POST(new Request('http://localhost/api/coco/legal-document', { method: 'POST', body: form }));
        expect(response.status).toBe(200);
        const result = await response.json();
        expect(result.pageImages).toHaveLength(1);
        expect(result.pageImages[0]).toMatch(/^data:image\/png;base64,/);
        expect(result.pageCount).toBe(1);
    });
});
