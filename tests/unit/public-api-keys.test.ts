import { describe, expect, it, vi } from 'vitest';

const row = { id: 'key-1', community_id: 'community-1', scopes: ['finance'], revoked_at: null as string | null };
const lookups: string[] = [];

vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => ({
        from: () => ({
            select: () => ({
                eq: (_column: string, hash: string) => ({
                    maybeSingle: async () => {
                        lookups.push(hash);
                        return { data: hash === expectedHash ? row : null, error: null };
                    },
                }),
            }),
            update: () => ({ eq: async () => ({ error: null }) }),
        }),
    }),
}));

let expectedHash = '';

describe('claves de la API pública', () => {
    it('genera claves con prefijo visible y guarda solo la huella', async () => {
        const { generateApiKey, hashSecret } = await import('@/lib/security/apiKeys');
        const generated = generateApiKey();
        expect(generated.key).toMatch(/^cc_live_[a-z0-9]{8}_[A-Za-z0-9_-]{32,}$/);
        expect(generated.key.startsWith(`cc_live_${generated.prefix}_`)).toBe(true);
        expect(generated.hash).toBe(hashSecret(generated.key));
        expect(generated.hash).not.toContain(generated.key.slice(17));
        expect(generateApiKey().key).not.toBe(generated.key);
    });

    it('rechaza sin consultar la base una cabecera que no tiene forma de clave', async () => {
        const { authenticateApiKey } = await import('@/lib/security/apiKeys');
        lookups.length = 0;
        expect(await authenticateApiKey(null, 'finance')).toMatchObject({ ok: false, status: 401 });
        expect(await authenticateApiKey('Bearer abc', 'finance')).toMatchObject({ ok: false, status: 401 });
        expect(lookups).toHaveLength(0);
    });

    it('acepta la clave correcta solo para los permisos que tiene', async () => {
        const { authenticateApiKey, generateApiKey } = await import('@/lib/security/apiKeys');
        const generated = generateApiKey();
        expectedHash = generated.hash;
        expect(await authenticateApiKey(`Bearer ${generated.key}`, 'finance')).toEqual({ ok: true, communityId: 'community-1', keyId: 'key-1' });
        expect(await authenticateApiKey(`Bearer ${generated.key}`, 'access')).toMatchObject({ ok: false, status: 403 });
        row.revoked_at = '2026-10-13T00:00:00Z';
        expect(await authenticateApiKey(`Bearer ${generated.key}`, 'finance')).toMatchObject({ ok: false, status: 401 });
    });
});
