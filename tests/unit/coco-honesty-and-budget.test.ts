/**
 * 18-11-2026: un PDF escaneado de 42 páginas se rechazó por "límite diario de
 * IA" (la lectura de escaneos se medía con el cupo de residente, sin rol), el
 * modelo solo supo "(No pude leer: …)" y respondió que la extracción "falló".
 * Además, si el turno fallaba, el mensaje de la persona no quedaba guardado.
 */

import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const COMMUNITY = '0ec125f4-770a-42ec-9327-6a694af69787';
const USER = '8bca3842-a85c-4746-89d4-d2a3d45c3b9e';
const THREAD = '6f1e2d3c-4b5a-4c6d-8e7f-001122334455';

const state = vi.hoisted(() => ({
    askCoCo: vi.fn(),
    saveDeliveredTurn: vi.fn(async () => undefined),
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({}), supabaseAdmin: {} }));
vi.mock('@/lib/coco/session-store', () => ({
    getSession: vi.fn(async () => ({ conversation: [], user_context: { community_id: COMMUNITY, title: 'Nueva conversación' } })),
    saveDeliveredTurn: state.saveDeliveredTurn,
    checkRateLimit: vi.fn(() => true),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceRateLimit: vi.fn(() => null) }));
vi.mock('@/lib/coco/usageSignals', () => ({ recordUsageSignal: vi.fn(async () => undefined) }));
vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: vi.fn(async () => ({ id: USER, name: 'Admin', role: 'admin', community_id: COMMUNITY, unit_id: 'unit-1' })),
}));
vi.mock('@/lib/coco/agent', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/agent')>();
    return { ...actual, askCoCo: state.askCoCo };
});
vi.mock('@/lib/coco/chatAttachments', async importOriginal => {
    const actual = await importOriginal<typeof import('@/lib/coco/chatAttachments')>();
    return { ...actual, canAttachToProviders: vi.fn(async () => false) };
});

import { POST } from '@/app/api/coco/route';
import { COCO_SYSTEM_PROMPT } from '@/lib/coco/system-prompt';
import { COCO_NO_INVENTION_RULE } from '@/lib/coco/honestyRules';
import { attachmentFailureFromError, attachmentFailuresTurnNote, parseAttachmentFailures } from '@/lib/coco/attachmentFailures';
import { CommunityDocumentError, documentFailureCode } from '@/lib/coco/communityDocuments';
import { estimatePdfTokens, pdfPageCountFromBase64 } from '@/lib/coco/agent';
import { AiBudgetExceededError, ADMIN_DAILY_TOKEN_FLOOR, budgetUserMessage, chileDayStart, dailyLimitForRole, dailyTokensOf } from '@/lib/ai/budget';

function post(body: Record<string, unknown>) {
    return POST(new NextRequest('http://localhost/api/coco', { method: 'POST', body: JSON.stringify({ currentPage: '/chat', threadId: THREAD, ...body }) }));
}

const SCAN_NAME = 'Copia Escritura REGLAMENTO INTERNO.pdf';
const budgetFailure = {
    file: SCAN_NAME, status: 'failed', reason_code: 'budget_exceeded',
    reason_text: 'Hoy usaste todo el presupuesto de IA de tu cuenta.',
};

beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'clave-de-prueba');
    state.askCoCo.mockReset();
    state.saveDeliveredTurn.mockClear();
});

describe('regla de no inventar', () => {
    it('está en el prompt del chat y en el del Agent Center', () => {
        expect(COCO_SYSTEM_PROMPT).toContain(COCO_NO_INVENTION_RULE);
        expect(COCO_NO_INVENTION_RULE).toContain('di la causa exacta que recibiste');
        expect(COCO_NO_INVENTION_RULE).toContain('No pidas que se reintente salvo que el error lo justifique');
        expect(COCO_NO_INVENTION_RULE).toContain('Nunca inventes datos, montos, fechas');
        expect(COCO_NO_INVENTION_RULE).toContain('Si no sabes algo o no lo leíste, dilo');
        const agentLoop = readFileSync('src/lib/agent-center/agentLoop.ts', 'utf8');
        expect(agentLoop).toContain('${COCO_NO_INVENTION_RULE}');
    });
});

describe('adjuntos fallidos como dato estructurado', () => {
    it('un error de presupuesto al leer un documento es budget_exceeded, no un fallo de lectura', () => {
        expect(documentFailureCode(new AiBudgetExceededError('sin presupuesto', 'daily_role_token_limit'))).toBe('budget_exceeded');
        expect(documentFailureCode(new CommunityDocumentError('El máximo es 25 MB.', 413))).toBe('too_large');
        expect(documentFailureCode(new CommunityDocumentError('Usa PDF…', 400, 'unsupported_type'))).toBe('unsupported_type');
        expect(attachmentFailureFromError(SCAN_NAME, { name: 'ChatAttachmentError', code: 'budget_exceeded', message: 'Sin presupuesto' }, 'upload_failed').reason_code).toBe('budget_exceeded');
    });

    it('solo acepta códigos de la lista cerrada', () => {
        expect(parseAttachmentFailures([budgetFailure, { ...budgetFailure, reason_code: 'corrupt' }])).toHaveLength(1);
    });

    it('el modelo recibe { file, status, reason_code: budget_exceeded, reason_text } y la instrucción de no suponer otra causa', async () => {
        state.askCoCo.mockResolvedValue({ reply: 'No leí la escritura porque se agotó el presupuesto de IA.', updatedHistory: [] });
        const response = await post({ message: 'Analiza este documento', attachmentNames: [SCAN_NAME], attachmentErrors: [budgetFailure] });
        expect(response.status).toBe(200);
        const options = state.askCoCo.mock.calls[0][3] as { attachmentFailures: unknown[]; storedMessage: string };
        expect(options.attachmentFailures).toEqual([budgetFailure]);
        expect(options.storedMessage).toContain(`Adjunto: ${SCAN_NAME}`);
        const note = attachmentFailuresTurnNote(parseAttachmentFailures(options.attachmentFailures));
        expect(note).toContain('"reason_code":"budget_exceeded"');
        expect(note).toContain('No supongas otra causa');
    });
});

describe('el mensaje se guarda apenas llega', () => {
    it('antes de llamar al modelo, con los nombres de los adjuntos (sin base64)', async () => {
        state.askCoCo.mockImplementation(async () => {
            expect(state.saveDeliveredTurn).toHaveBeenCalledTimes(1);
            return { reply: 'Listo', updatedHistory: [] };
        });
        await post({ message: 'Revisa esto', attachmentNames: ['factura.webp'], images: ['data:image/png;base64,iVBORw0KGgo='] });
        const [key, session] = state.saveDeliveredTurn.mock.calls[0] as unknown as [string, { conversation: Array<{ role: string; content: string }>; user_context: { title: string } }];
        expect(key).toBe(`web:${USER}:${THREAD}`);
        expect(session.conversation).toEqual([{ role: 'user', content: 'Revisa esto\nAdjunto: factura.webp' }]);
        expect(session.user_context.title).toBe('Revisa esto');
        expect(JSON.stringify(session)).not.toContain('base64');
    });

    it('si el turno falla, queda el mensaje y un aviso de error', async () => {
        state.askCoCo.mockRejectedValue(new AiBudgetExceededError(budgetUserMessage('daily_role_token_limit', 'admin'), 'daily_role_token_limit'));
        const response = await post({ message: 'confirmo' });
        expect(response.status).toBe(429);
        const last = state.saveDeliveredTurn.mock.calls.at(-1) as unknown as [string, { conversation: Array<{ role: string; content: string }> }];
        expect(last[1].conversation[0]).toEqual({ role: 'user', content: 'confirmo' });
        expect(last[1].conversation[1].role).toBe('assistant');
        expect(last[1].conversation[1].content).toContain('presupuesto de IA');
    });
});

describe('presupuesto diario', () => {
    it('admin y superadmin tienen cupo para 2–3 escrituras de ~50 páginas', () => {
        const budget = { staff_daily_token_limit: 300_000, resident_daily_token_limit: 100_000 };
        expect(dailyLimitForRole(budget, 'admin')).toBe(ADMIN_DAILY_TOKEN_FLOOR);
        expect(dailyLimitForRole(budget, 'superadmin')).toBe(ADMIN_DAILY_TOKEN_FLOOR);
        expect(dailyLimitForRole(budget, 'concierge')).toBe(300_000);
        expect(dailyLimitForRole(budget, 'resident')).toBe(100_000);
        expect(dailyLimitForRole(budget, undefined)).toBe(100_000);
        // Tres escrituras de 50 páginas con 4 rondas cada una caben.
        expect(ADMIN_DAILY_TOKEN_FLOOR).toBeGreaterThan(3 * 4 * 50 * 2_300);
    });

    it('la caché leída cuenta al 10 % para el cupo diario', () => {
        expect(dailyTokensOf({ total_tokens: 100_000, metadata: { cacheReadTokens: 80_000 } })).toBe(28_000);
        expect(dailyTokensOf({ total_tokens: 5_000, metadata: null })).toBe(5_000);
    });

    it('el cupo se renueva a medianoche de Chile', () => {
        expect(chileDayStart(new Date('2026-11-18T18:36:00Z'))).toBe('2026-11-18T03:00:00.000Z');
        expect(chileDayStart(new Date('2026-07-10T02:00:00Z'))).toBe('2026-07-09T04:00:00.000Z');
    });

    it('los mensajes no usan jerga, llevan tildes y le dicen al admin qué hacer', () => {
        const admin = budgetUserMessage('daily_role_token_limit', 'admin');
        expect(admin).not.toMatch(/limite|l[ií]mite diario|rol\b|manana|ampliacion/);
        expect(admin).toContain('medianoche');
        expect(admin).toContain('Convive Connect');
        expect(budgetUserMessage('monthly_cost_limit', 'resident')).toContain('administración');
    });
});

describe('estimación de PDF por página', () => {
    it('un escaneo de 42 páginas son ~97 mil tokens, sin importar que pese 8 MB', () => {
        const pages = Array.from({ length: 42 }, (_, i) => `${i + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`).join('\n');
        const pdf = `%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n2 0 obj << /Type /Pages /Count 42 >> endobj\n${pages}\n${'x'.repeat(8_000_000)}`;
        const base64 = Buffer.from(pdf, 'latin1').toString('base64');
        expect(pdfPageCountFromBase64(base64)).toBe(42);
        expect(estimatePdfTokens(base64)).toBe(42 * 2_300);
    });
});
