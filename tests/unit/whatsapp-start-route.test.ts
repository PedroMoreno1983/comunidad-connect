import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getProfile: vi.fn(),
    getSettings: vi.fn(),
}));

vi.mock('@/lib/server/agentIdentity', () => ({ getAuthenticatedAgentProfile: mocks.getProfile }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => ({
            select: () => ({
                eq: () => ({ maybeSingle: mocks.getSettings }),
            }),
        }),
    }),
}));

import { GET } from '@/app/api/whatsapp/start/route';

describe('inicio de CoCo por WhatsApp', () => {
    beforeEach(() => {
        mocks.getProfile.mockResolvedValue({ id: 'resident-1' });
        mocks.getSettings.mockResolvedValue({ data: { phone_number: '+56912345678', whatsapp_enabled: true }, error: null });
        vi.stubEnv('TWILIO_ACCOUNT_SID', 'configured');
        vi.stubEnv('TWILIO_AUTH_TOKEN', 'configured');
        vi.stubEnv('TWILIO_WHATSAPP_FROM', 'whatsapp:+56987654321');
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllEnvs();
    });

    it('rechaza a quien no inició sesión', async () => {
        mocks.getProfile.mockResolvedValue(null);
        const response = await GET();
        expect(response.status).toBe(401);
        expect(mocks.getSettings).not.toHaveBeenCalled();
    });

    it('abre el número configurado con un saludo cuando el residente está habilitado', async () => {
        const response = await GET();
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            available: true,
            url: 'https://wa.me/56987654321?text=Hola%20CoCo',
        });
        expect(response.headers.get('Cache-Control')).toBe('private, no-store');
    });

    it('no ofrece el enlace sin consentimiento', async () => {
        mocks.getSettings.mockResolvedValue({ data: { phone_number: '+56912345678', whatsapp_enabled: false }, error: null });
        expect(await (await GET()).json()).toEqual({ available: false, reason: 'consent' });
    });

    it('no ofrece el enlace si el teléfono del perfil no coincide con el formato chileno', async () => {
        mocks.getSettings.mockResolvedValue({ data: { phone_number: '+123', whatsapp_enabled: true }, error: null });
        expect(await (await GET()).json()).toEqual({ available: false, reason: 'phone' });
    });

    it('no ofrece el enlace si el remitente no está configurado', async () => {
        vi.stubEnv('TWILIO_WHATSAPP_FROM', '');
        expect(await (await GET()).json()).toEqual({ available: false, reason: 'unconfigured' });
    });
});
