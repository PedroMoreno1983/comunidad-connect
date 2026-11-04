import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getProfile: vi.fn() }));

vi.mock('@/lib/server/agentIdentity', () => ({
    getAuthenticatedAgentProfile: mocks.getProfile,
}));

import { GET as getCocoWhatsapp, POST as postCocoWhatsapp } from '@/app/api/coco/whatsapp/route';
import { GET as getWhatsappStatus } from '@/app/api/whatsapp/status/route';

const SID = 'AC1234567890abcdef1234567890abcd';
const FROM = 'whatsapp:+56911112222';

function leaksConfiguration(body: string) {
    return /AC1234|11112222|accountSidMasked|fromMasked|requiredEnv|TWILIO_|WHATSAPP_WEBHOOK_SECRET|COCO_TWILIO|COCO_WHATSAPP_FROM/.test(body);
}

describe('estado público de WhatsApp', () => {
    beforeEach(() => {
        mocks.getProfile.mockResolvedValue(null);
        vi.stubEnv('TWILIO_ACCOUNT_SID', SID);
        vi.stubEnv('TWILIO_AUTH_TOKEN', 'token-secreto-de-prueba');
        vi.stubEnv('TWILIO_WHATSAPP_FROM', FROM);
        vi.stubEnv('WHATSAPP_WEBHOOK_SECRET', 'hook-secret');
        vi.stubEnv('COCO_WHATSAPP_FROM', '');
        vi.stubEnv('COCO_TWILIO_AUTH_TOKEN', '');
        vi.stubEnv('PLATFORM_CREATOR_EMAILS', 'admin@example.com');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it('el GET de /api/coco/whatsapp sin administrador no describe la configuración', async () => {
        const response = await getCocoWhatsapp();
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(JSON.parse(text)).toEqual({ ok: true });
        expect(leaksConfiguration(text)).toBe(false);
    });

    it('un residente tampoco ve SID, número ni variables', async () => {
        mocks.getProfile.mockResolvedValue({ id: 'resident-1', role: 'resident', email: 'residente@example.com' });
        const text = await (await getCocoWhatsapp()).text();
        expect(JSON.parse(text)).toEqual({ ok: true });
        expect(leaksConfiguration(text)).toBe(false);
    });

    it('un administrador sí puede ver el diagnóstico del webhook', async () => {
        mocks.getProfile.mockResolvedValue({ id: 'admin-1', role: 'admin', email: 'admin@example.com' });
        const body = await (await getCocoWhatsapp()).json();
        expect(body.configured).toBe(true);
        expect(body.accountSidMasked).not.toBe(SID);
        expect(body.accountSidMasked).toContain('...');
    });

    it('el GET de /api/whatsapp/status sin administrador no describe la configuración', async () => {
        const response = await getWhatsappStatus(new NextRequest('http://localhost/api/whatsapp/status'));
        const text = await response.text();
        expect(response.status).toBe(200);
        expect(JSON.parse(text)).toEqual({ ok: true });
        expect(leaksConfiguration(text)).toBe(false);
    });

    it('un administrador de comunidad que no es de la plataforma tampoco ve ese diagnóstico', async () => {
        mocks.getProfile.mockResolvedValue({ id: 'admin-2', role: 'admin', email: 'otro@example.com' });
        const text = await (await getWhatsappStatus(new NextRequest('http://localhost/api/whatsapp/status'))).text();
        expect(JSON.parse(text)).toEqual({ ok: true });
        expect(leaksConfiguration(text)).toBe(false);
    });

    it('el creador de la plataforma sigue viendo el estado para configurar Twilio', async () => {
        mocks.getProfile.mockResolvedValue({ id: 'admin-1', role: 'admin', email: 'admin@example.com' });
        const body = await (await getWhatsappStatus(new NextRequest('http://localhost/api/whatsapp/status'))).json();
        expect(body.configured).toBe(true);
        expect(body.requiredEnv.TWILIO_ACCOUNT_SID).toBe(true);
    });

    it('el POST del webhook sigue rechazando una firma ausente y no devuelve el diagnóstico', async () => {
        const request = new NextRequest('https://conviveconnect.com/api/coco/whatsapp', {
            method: 'POST',
            body: new URLSearchParams({ Body: 'hola', WaId: '56911112222' }),
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
        });
        const response = await postCocoWhatsapp(request);
        const text = await response.text();
        expect(response.status).toBe(401);
        expect(text).toBe('');
        expect(leaksConfiguration(text)).toBe(false);
    });
});
