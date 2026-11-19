/**
 * Varios adjuntos en un mensaje del chat de CoCo (18-11-2026): la foto de una
 * factura y dos PDF del reglamento, uno escaneado, en el mismo mensaje.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const COMMUNITY = '0ec125f4-770a-42ec-9327-6a694af69787';
const USER = '8bca3842-a85c-4746-89d4-d2a3d45c3b9e';
const SCAN = `${COMMUNITY}/${USER}/33333333-3333-4333-8333-333333333333.pdf`;

const state = vi.hoisted(() => ({
    askCoCo: vi.fn(),
    loadVisualPdf: vi.fn(),
    discardVisualPdf: vi.fn(async () => undefined),
}));

vi.mock('@/lib/coco/session-store', () => ({
    getSession: vi.fn(async () => null),
    saveDeliveredTurn: vi.fn(async () => undefined),
    checkRateLimit: vi.fn(() => true),
}));
vi.mock('@/lib/ai/budget', async importOriginal => ({ ...await importOriginal<typeof import('@/lib/ai/budget')>(), getPersonAllowance: vi.fn(async () => null) }));
vi.mock('@/lib/security/rateLimit', () => ({ enforceRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/coco/usageSignals', () => ({ recordUsageSignal: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: vi.fn(async () => ({ id: '8bca3842-a85c-4746-89d4-d2a3d45c3b9e', name: 'Pedro', role: 'resident', community_id: '0ec125f4-770a-42ec-9327-6a694af69787', unit_id: 'unit-1' })),
}));
vi.mock('@/lib/coco/agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/agent')>();
    return { ...actual, askCoCo: state.askCoCo };
});
vi.mock('@/lib/coco/chatAttachments', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/chatAttachments')>();
    return { ...actual, canAttachToProviders: vi.fn(async () => false) };
});
vi.mock('@/lib/coco/communityDocuments', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/communityDocuments')>();
    return { ...actual, loadVisualPdf: state.loadVisualPdf, discardVisualPdf: state.discardVisualPdf };
});

import { POST } from '@/app/api/coco/route';
import { documentTurnNote, estimateHistoryTokens, withoutHeavyBlocks } from '@/lib/coco/agent';
import {
    MAX_CHAT_ATTACHMENTS, MAX_CHAT_IMAGES_TOTAL_CHARS, MAX_ONE_DOCUMENT_CHARS, MAX_TURN_DOCUMENT_CHARS,
    addChatAttachments, attachmentSummary, classifyChatFile, documentTextShare, imageDataUrlBudget,
} from '@/lib/coco/chatAttachmentRules';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function post(body: Record<string, unknown>) {
    return POST(new NextRequest('http://localhost/api/coco', { method: 'POST', body: JSON.stringify({ currentPage: '/chat', ...body }) }));
}

function file(name: string, type: string, size: number) {
    return new File([new Uint8Array(Math.min(size, 16))], name, { type }) as File & { size: number };
}

beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'clave-de-prueba');
    state.askCoCo.mockReset();
    state.askCoCo.mockResolvedValue({ reply: 'Listo.', updatedHistory: [] });
    state.loadVisualPdf.mockReset();
    state.discardVisualPdf.mockClear();
});

describe('reglas de adjuntos', () => {
    it('acepta la factura .webp y los PDF del reglamento; rechaza lo que no sirve', () => {
        expect(classifyChatFile({ name: 'factura-cge.webp', type: 'image/webp', size: 900_000 })).toEqual({ kind: 'image' });
        expect(classifyChatFile({ name: 'reglamento-1998.pdf', type: 'application/pdf', size: 8 * 1024 * 1024 })).toEqual({ kind: 'document' });
        // El navegador a veces no informa el tipo: manda la extensión.
        expect(classifyChatFile({ name: 'foto.JPG', type: '', size: 10 })).toEqual({ kind: 'image' });
        expect(classifyChatFile({ name: 'nomina.xlsx', type: '', size: 10 })).toEqual({ kind: 'document' });
        expect(classifyChatFile({ name: 'video.mp4', type: 'video/mp4', size: 10 })).toHaveProperty('error');
        expect(classifyChatFile({ name: 'grande.pdf', type: 'application/pdf', size: 26 * 1024 * 1024 })).toHaveProperty('error');
    });

    it(`junta hasta ${MAX_CHAT_ATTACHMENTS}, sin repetidos, y explica lo que quedó fuera`, () => {
        let id = 0;
        const makeId = () => String(++id);
        const first = addChatAttachments([], [
            file('factura-cge.webp', 'image/webp', 10),
            file('reglamento-1.pdf', 'application/pdf', 10),
            file('reglamento-2.pdf', 'application/pdf', 10),
        ], makeId);
        expect(first.attachments.map(item => item.kind)).toEqual(['image', 'document', 'document']);
        expect(first.rejected).toEqual([]);
        const second = addChatAttachments(first.attachments, [
            file('reglamento-1.pdf', 'application/pdf', 10),
            file('a.pdf', 'application/pdf', 10),
            file('b.pdf', 'application/pdf', 10),
            file('c.pdf', 'application/pdf', 10),
            file('d.exe', 'application/octet-stream', 10),
        ], makeId);
        expect(second.attachments).toHaveLength(MAX_CHAT_ATTACHMENTS);
        expect(second.rejected.join(' ')).toContain('d.exe');
        expect(second.rejected.join(' ')).toContain('quedó fuera 1');
    });

    it('reparte el texto de los documentos y el peso de las imágenes', () => {
        expect(documentTextShare(1)).toBe(MAX_ONE_DOCUMENT_CHARS);
        expect(documentTextShare(5) * 5).toBeLessThanOrEqual(MAX_TURN_DOCUMENT_CHARS);
        expect(imageDataUrlBudget(5) * 5).toBeLessThanOrEqual(MAX_CHAT_IMAGES_TOTAL_CHARS);
        // Imágenes + texto de documentos caben bajo los 4,5 MB del cuerpo en Vercel.
        expect(MAX_CHAT_IMAGES_TOTAL_CHARS + MAX_TURN_DOCUMENT_CHARS * 2).toBeLessThan(4.5 * 1024 * 1024 * 0.9);
        expect(attachmentSummary(['a.pdf', 'b.pdf'])).toBe('Adjuntos (2): a.pdf · b.pdf');
    });
});

describe('/api/coco con varios adjuntos', () => {
    it('pasa las imágenes y todos los documentos al modelo en el mismo turno', async () => {
        const response = await post({
            message: '¿Qué dicen estos documentos sobre los gastos comunes?',
            images: [PNG],
            legalDocuments: [
                { name: 'reglamento-1.pdf', text: '[Página 1]\nARTICULO PRIMERO', pageCount: 9, truncated: false, documentId: '11111111-2222-4333-8444-555555555555' },
                { name: 'reglamento-2.pdf', text: 'x'.repeat(40_000), pageCount: 42, truncated: false, documentId: '66666666-2222-4333-8444-555555555555' },
                { name: 'acta.docx', text: 'Acta de asamblea', pageCount: 0, truncated: false },
            ],
        });
        expect(response.status).toBe(200);
        const options = state.askCoCo.mock.calls[0][3];
        expect(options.images).toHaveLength(1);
        expect(options.legalDocuments.map((document: { name: string }) => document.name)).toEqual(['reglamento-1.pdf', 'reglamento-2.pdf', 'acta.docx']);
        // El texto largo se recorta a su parte y queda marcado como parcial.
        expect(options.legalDocuments[1].text.length).toBe(documentTextShare(3));
        expect(options.legalDocuments[1].truncated).toBe(true);
    });

    it('un PDF escaneado sin transcribir va como PDF para leer con visión y después se borra', async () => {
        state.loadVisualPdf.mockResolvedValue('JVBERi0xLjQ=');
        const response = await post({
            message: 'Revisa el reglamento escaneado',
            legalDocuments: [{ name: 'escaneado.pdf', text: '', pageCount: 42, truncated: false, visualPdfPath: SCAN }],
        });
        expect(response.status).toBe(200);
        expect(state.loadVisualPdf).toHaveBeenCalledWith(COMMUNITY, USER, SCAN);
        const options = state.askCoCo.mock.calls[0][3];
        expect(options.legalDocuments[0].visualPdf).toBe('JVBERi0xLjQ=');
        expect(state.discardVisualPdf).toHaveBeenCalledWith(COMMUNITY, USER, SCAN);
    });

    it('no lee el PDF de otra persona', async () => {
        await post({
            message: 'Revisa',
            legalDocuments: [{ name: 'ajeno.pdf', text: '', pageCount: 3, truncated: false, visualPdfPath: `${COMMUNITY}/otra/33333333-3333-4333-8333-333333333333.pdf` }],
        });
        expect(state.loadVisualPdf).not.toHaveBeenCalled();
        expect(state.askCoCo.mock.calls[0][3].legalDocuments[0].visualPdf).toBeUndefined();
    });

    it(`rechaza más de ${MAX_CHAT_ATTACHMENTS} archivos`, async () => {
        const response = await post({ message: 'Hola', images: Array.from({ length: MAX_CHAT_ATTACHMENTS + 1 }, () => PNG) });
        expect(response.status).toBe(400);
        expect(state.askCoCo).not.toHaveBeenCalled();
    });

    it('sigue aceptando un adjunto en el formato anterior (widget flotante)', async () => {
        await post({ message: 'Mira', imageBase64: PNG, legalDocument: { name: 'a.pdf', text: 'hola', pageCount: 1, truncated: false } });
        const options = state.askCoCo.mock.calls[0][3];
        expect(options.images).toHaveLength(1);
        expect(options.legalDocuments).toHaveLength(1);
    });
});

describe('turno del modelo', () => {
    it('numera los documentos y avisa cuando el PDF va para leer con visión', () => {
        const note = documentTurnNote({ name: 'escaneado.pdf', text: '', truncated: false, pageCount: 42, visualPdf: 'JVBER' }, 1, 2);
        expect(note).toContain('Documento aportado 2 de 2: escaneado.pdf');
        expect(note).toContain('el PDF completo va adjunto');
        expect(note).not.toContain('<documento');
    });

    it('no guarda el PDF en base64 en la sesión', () => {
        const content = [{ type: 'text', text: 'hola' }, { type: 'document', title: 'escaneado.pdf', source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(1000) } }];
        expect(JSON.stringify(withoutHeavyBlocks(content))).not.toContain('AAAA');
        expect(withoutHeavyBlocks('texto')).toBe('texto');
    });

    it('estima imágenes y PDF por tamaño visual, no por su base64', () => {
        const image = { role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'A'.repeat(1_000_000) } }] };
        expect(estimateHistoryTokens([image])).toBeLessThan(5_000);
        const pdf = { role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: 'A'.repeat(10_000_000) } }] };
        expect(estimateHistoryTokens([pdf])).toBeGreaterThan(50_000);
    });
});
