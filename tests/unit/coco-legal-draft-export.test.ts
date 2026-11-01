import { describe, expect, it, vi } from 'vitest';

const profile = vi.hoisted(() => ({ current: { id: 'u-1', community_id: 'c-1', role: 'admin' } as { id: string; community_id: string; role: string } | null }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/agentIdentity', () => ({ getAuthenticatedAgentProfile: vi.fn(async () => profile.current) }));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: 'Edificio Ejemplo' } }) }) }) }) }) }));

import { POST } from '@/app/api/coco/legal-draft/route';
import { markdownToDocx } from '@/lib/coco/docx';
import { markdownToPdf } from '@/lib/coco/pdf';
import { LEGAL_DRAFT_MARKER, canDraftLegalDocuments } from '@/lib/coco/legalDraftMarker';
import { isToolAllowedForRole } from '@/lib/coco/tools';
import { PDFDocument } from 'pdf-lib';

const SAMPLE = `**${LEGAL_DRAFT_MARKER}**\n\n# Contrato\n## Cláusulas\n1. Jornada [a completar]\n2. Remuneración [monto]\n\n| Dato | Estado |\n|---|---|\n| RUT trabajador | Pendiente |\n| Remuneración | Pendiente |\n\n- Fuente BCN`;
const req = (body: unknown) => new Request('http://localhost/api/coco/legal-draft', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

describe('borradores legales: solo administración', () => {
    it('solo el rol admin puede generar borradores', () => {
        expect(canDraftLegalDocuments('admin')).toBe(true);
        for (const role of ['resident', 'concierge', 'system', '', undefined]) expect(canDraftLegalDocuments(role)).toBe(false);
        expect(isToolAllowedForRole('prepare_legal_draft', 'admin')).toBe(true);
        expect(isToolAllowedForRole('prepare_legal_draft', 'resident')).toBe(false);
        expect(isToolAllowedForRole('prepare_legal_draft', 'concierge')).toBe(false);
    });

    it('rechaza con 403 a residentes y conserjería, y con 401 sin sesión', async () => {
        profile.current = { id: 'u-2', community_id: 'c-1', role: 'resident' };
        expect((await POST(req({ text: SAMPLE, format: 'pdf' }))).status).toBe(403);
        profile.current = { id: 'u-3', community_id: 'c-1', role: 'concierge' };
        expect((await POST(req({ text: SAMPLE }))).status).toBe(403);
        profile.current = null;
        expect((await POST(req({ text: SAMPLE }))).status).toBe(401);
    });

    it('entrega Word y PDF al administrador', async () => {
        profile.current = { id: 'u-1', community_id: 'c-1', role: 'admin' };
        const docx = await POST(req({ text: SAMPLE, format: 'docx' }));
        expect(docx.status).toBe(200);
        expect(docx.headers.get('content-type')).toContain('wordprocessingml');
        const pdf = await POST(req({ text: SAMPLE, format: 'pdf' }));
        expect(pdf.status).toBe(200);
        expect(pdf.headers.get('content-type')).toBe('application/pdf');
        expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 5).toString()).toBe('%PDF-');
    });
});

describe('exportación con línea editorial Convive', () => {
    it('Word legible con tablas reales, listas numeradas, logo, encabezado y pie', async () => {
        const file = markdownToDocx(SAMPLE, { community: 'Edificio Ejemplo' });
        const raw = file.toString('latin1');
        for (const part of ['word/header1.xml', 'word/footer1.xml', 'word/numbering.xml', 'word/styles.xml', 'word/media/logo.png']) expect(raw).toContain(part);
        expect(raw).toContain('<w:tbl>');
        expect(raw).toContain('<w:numId w:val="101"/>');
        expect(raw).toContain('Heading2');
        expect(raw).toContain('NUMPAGES');
        const mammoth = await import('mammoth');
        const html = (await mammoth.convertToHtml({ buffer: file })).value;
        expect(html).toContain('<table>');
        expect(html).toContain('RUT trabajador');
        expect(html).toContain('<ol>');
        expect(html).toContain(LEGAL_DRAFT_MARKER);
    });

    it('PDF válido con encabezado, pie numerado y tabla', async () => {
        const long = SAMPLE + '\n\n' + Array.from({ length: 80 }, (_, i) => `${i + 1}. Cláusula de ejemplo número ${i + 1} con texto suficiente para ocupar una línea completa del documento.`).join('\n');
        const file = await markdownToPdf(long, { community: 'Edificio Ejemplo' });
        const doc = await PDFDocument.load(file);
        expect(doc.getPageCount()).toBeGreaterThan(1);
        expect(doc.getSubject()).toBe(LEGAL_DRAFT_MARKER);
        await import('pdf-parse/worker');
        const { PDFParse } = await import('pdf-parse');
        const parser = new PDFParse({ data: file });
        const text = (await parser.getText()).text;
        await parser.destroy();
        expect(text).toContain('RUT trabajador');
        expect(text).toContain('Edificio Ejemplo');
        expect(text).toMatch(/Página 1 de \d+/);
        expect(text).toContain('BORRADOR PARA REVISIÓN DE ABOGADO');
    }, 20_000);
});
