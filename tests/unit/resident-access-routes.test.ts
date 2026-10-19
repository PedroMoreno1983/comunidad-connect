import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    enforceRateLimit: vi.fn(),
    checkRateLimitBySubject: vi.fn(),
    profileMaybeSingle: vi.fn(),
    unitMaybeSingle: vi.fn(),
    insertConsents: vi.fn(),
    getUserById: vi.fn(),
    generateLink: vi.fn(),
    sendEmail: vi.fn(),
    verifyOtp: vi.fn(),
    signOut: vi.fn(),
}));

vi.mock('@/lib/security/rateLimit', () => ({
    enforceDistributedRateLimit: mocks.enforceRateLimit,
    checkDistributedRateLimitBySubject: mocks.checkRateLimitBySubject,
}));

vi.mock('@/lib/email', () => ({
    BRAND: { serif: 'serif', ink: '#111', inkMuted: '#444', inkTertiary: '#777' },
    FROM_EMAIL: 'Convive Connect <hola@conviveconnect.com>',
    emailWrapper: (html: string) => html,
    escapeEmailHtml: (value: string) => value,
    resend: { emails: { send: mocks.sendEmail } },
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: (table: string) => {
            if (table === 'profiles') {
                return {
                    select: () => ({
                        eq: () => ({ maybeSingle: mocks.profileMaybeSingle }),
                    }),
                };
            }
            if (table === 'units') {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({ maybeSingle: mocks.unitMaybeSingle }),
                        }),
                    }),
                };
            }
            if (table === 'privacy_consent_events') {
                return { insert: mocks.insertConsents };
            }
            throw new Error(`Unexpected table ${table}`);
        },
        auth: {
            admin: {
                getUserById: mocks.getUserById,
                generateLink: mocks.generateLink,
            },
        },
    }),
}));

vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: {
            verifyOtp: mocks.verifyOtp,
            signOut: mocks.signOut,
        },
    }),
}));

import { POST as requestResidentAccess } from '@/app/api/auth/resident-access/route';
import { GET as confirmResidentAccess } from '@/app/api/auth/resident-confirm/route';

describe('acceso autónomo de residentes por correo', () => {
    beforeEach(() => {
        mocks.enforceRateLimit.mockResolvedValue(null);
        mocks.checkRateLimitBySubject.mockResolvedValue(true);
        mocks.profileMaybeSingle.mockResolvedValue({
            data: {
                id: 'user-1',
                name: 'Ana Torres',
                email: 'ana@comunidad.cl',
                role: 'resident',
                unit_id: 'unit-101',
                community_id: 'comm-1',
            },
            error: null,
        });
        mocks.unitMaybeSingle.mockResolvedValue({ data: { id: 'unit-101' }, error: null });
        mocks.insertConsents.mockResolvedValue({ error: null });
        mocks.getUserById.mockResolvedValue({
            data: { user: { id: 'user-1', email: 'ana@comunidad.cl' } },
            error: null,
        });
        mocks.generateLink.mockResolvedValue({
            data: { properties: { hashed_token: 'hash-123' } },
            error: null,
        });
        mocks.sendEmail.mockResolvedValue({ data: { id: 'email-1' }, error: null });
        mocks.verifyOtp.mockResolvedValue({
            data: { user: { id: 'user-1', email: 'ana@comunidad.cl' } },
            error: null,
        });
        mocks.signOut.mockResolvedValue({ error: null });
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('envía enlace personal cuando el correo pertenece a un residente con unidad en nómina', async () => {
        const req = new NextRequest('https://conviveconnect.com/api/auth/resident-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'Ana@Comunidad.cl ' }),
        });

        const res = await requestResidentAccess(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(mocks.generateLink).toHaveBeenCalledWith({
            type: 'magiclink',
            email: 'ana@comunidad.cl',
        });
        expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
        const sentArgs = mocks.sendEmail.mock.calls[0][0];
        expect(sentArgs.to).toBe('ana@comunidad.cl');
        expect(sentArgs.html).toContain('/api/auth/resident-confirm?token_hash=hash-123');
    });

    it('responde ok sin filtrar existencia cuando el perfil no tiene unidad o no es residente', async () => {
        mocks.profileMaybeSingle.mockResolvedValue({
            data: { id: 'user-2', email: 'admin@comunidad.cl', role: 'admin', unit_id: null },
            error: null,
        });

        const req = new NextRequest('https://conviveconnect.com/api/auth/resident-access', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@comunidad.cl' }),
        });

        const res = await requestResidentAccess(req);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ ok: true });
        expect(mocks.generateLink).not.toHaveBeenCalled();
        expect(mocks.sendEmail).not.toHaveBeenCalled();
    });

    it('confirma el enlace de un solo uso, registra consentimientos y redirige a /home', async () => {
        const req = new NextRequest('https://conviveconnect.com/api/auth/resident-confirm?token_hash=hash-123');
        const res = await confirmResidentAccess(req);

        expect(res.status).toBe(307);
        expect(res.headers.get('Location')).toBe('https://conviveconnect.com/home');
        expect(mocks.verifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-123', type: 'magiclink' });
        expect(mocks.insertConsents).toHaveBeenCalledTimes(1);
        expect(mocks.signOut).not.toHaveBeenCalled();
    });

    it('rechaza el enlace y cierra sesión si la unidad no pertenece a la comunidad del residente', async () => {
        mocks.unitMaybeSingle.mockResolvedValue({ data: null, error: null });
        const req = new NextRequest('https://conviveconnect.com/api/auth/resident-confirm?token_hash=hash-123');
        const res = await confirmResidentAccess(req);

        expect(res.status).toBe(307);
        expect(res.headers.get('Location')).toBe('https://conviveconnect.com/resident-access?error=invalid');
        expect(mocks.signOut).toHaveBeenCalledTimes(1);
        expect(mocks.insertConsents).not.toHaveBeenCalled();
    });
});
