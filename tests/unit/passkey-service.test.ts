import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    list: vi.fn(),
    registerPasskey: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
    supabase: {
        auth: {
            passkey: { list: mocks.list },
            registerPasskey: mocks.registerPasskey,
        },
    },
}));

import { PasskeyService } from '@/lib/api/passkeys';

describe('PasskeyService en celular y navegador', () => {
    beforeEach(() => {
        mocks.list.mockResolvedValue({ data: [], error: null });
        mocks.registerPasskey.mockResolvedValue({ data: {}, error: null });
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    it('fuerza authenticatorAttachment="platform" al crear la llave para abrir Face ID o huella del propio celular', async () => {
        const createSpy = vi.fn().mockResolvedValue({});
        vi.stubGlobal('window', {
            localStorage: {
                getItem: vi.fn(),
                setItem: vi.fn(),
            },
        });
        vi.stubGlobal('navigator', {
            credentials: {
                create: createSpy,
            },
        });

        mocks.registerPasskey.mockImplementation(async () => {
            await navigator.credentials.create({
                publicKey: {
                    challenge: new Uint8Array([1, 2, 3]),
                    rp: { name: 'Convive Connect', id: 'conviveconnect.com' },
                    user: { id: new Uint8Array([4, 5, 6]), name: 'ana@comunidad.cl', displayName: 'Ana' },
                    pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
                    authenticatorSelection: {
                        residentKey: 'required',
                        userVerification: 'preferred',
                    },
                },
            });
            return { data: {}, error: null };
        });

        await PasskeyService.register();

        expect(createSpy).toHaveBeenCalledTimes(1);
        const passedOptions = createSpy.mock.calls[0][0] as CredentialCreationOptions;
        expect(passedOptions.publicKey?.authenticatorSelection).toEqual({
            residentKey: 'required',
            userVerification: 'required',
            authenticatorAttachment: 'platform',
        });
    });

    it('reintenta con las opciones por defecto si el dispositivo rechaza el filtro de plataforma', async () => {
        let attempts = 0;
        mocks.registerPasskey.mockImplementation(async () => {
            attempts += 1;
            if (attempts === 1) {
                return { data: null, error: new Error('NotSupportedError: platform authenticator unavailable') };
            }
            return { data: {}, error: null };
        });

        await PasskeyService.register();
        expect(mocks.registerPasskey).toHaveBeenCalledTimes(2);
    });
});
