import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { denyUnlessSharedSecret, matchesSharedSecret } from '@/lib/security/sharedSecret';

const SECRET = 'secreto-compartido-de-prueba';

function request(headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/interno', { method: 'POST', headers });
}

describe('matchesSharedSecret', () => {
    it('accepts the exact secret', () => {
        expect(matchesSharedSecret(SECRET, SECRET)).toBe(true);
    });

    it('rejects empty, null and different-length values without throwing', () => {
        expect(matchesSharedSecret(null, SECRET)).toBe(false);
        expect(matchesSharedSecret(undefined, SECRET)).toBe(false);
        expect(matchesSharedSecret('', SECRET)).toBe(false);
        expect(matchesSharedSecret('corto', SECRET)).toBe(false);
        expect(matchesSharedSecret(`${SECRET}-extra`, SECRET)).toBe(false);
    });

    it('rejects a value of the same length that differs', () => {
        const sameLength = `${SECRET.slice(0, -1)}X`;

        expect(sameLength).toHaveLength(SECRET.length);
        expect(matchesSharedSecret(sameLength, SECRET)).toBe(false);
    });
});

describe('denyUnlessSharedSecret', () => {
    it('fails closed with 503 when the secret is not configured', () => {
        for (const missing of [undefined, '', '   ']) {
            const denied = denyUnlessSharedSecret(request({ authorization: `Bearer ${SECRET}` }), missing);

            expect(denied?.status).toBe(503);
        }
    });

    it('rejects a request with no credential', () => {
        expect(denyUnlessSharedSecret(request(), SECRET)?.status).toBe(401);
    });

    it('rejects a wrong bearer token', () => {
        expect(denyUnlessSharedSecret(request({ authorization: 'Bearer incorrecto' }), SECRET)?.status).toBe(401);
    });

    it('accepts the Authorization: Bearer header', () => {
        expect(denyUnlessSharedSecret(request({ authorization: `Bearer ${SECRET}` }), SECRET)).toBeNull();
    });

    it('ignores an Authorization header that is not a Bearer scheme', () => {
        expect(denyUnlessSharedSecret(request({ authorization: SECRET }), SECRET)?.status).toBe(401);
    });

    it('accepts an extra header only when the route opts in', () => {
        const withHeader = request({ 'x-cron-secret': SECRET });

        expect(denyUnlessSharedSecret(withHeader, SECRET)?.status).toBe(401);
        expect(denyUnlessSharedSecret(withHeader, SECRET, { headers: ['x-cron-secret'] })).toBeNull();
    });
});
