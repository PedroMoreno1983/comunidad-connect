import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({}) }));
vi.mock('@/lib/server/whatsappNotify', () => ({ sendWhatsAppNotificationForUser: vi.fn() }));

describe('firma del aviso al portón', () => {
    it('es HMAC-SHA256 de "timestamp.cuerpo", verificable por cualquier controlador', async () => {
        const { signAccessEvent } = await import('@/lib/operations/intercomService');
        const body = JSON.stringify({ event: 'access.granted', unit: '402' });
        const expected = createHmac('sha256', 'secreto').update(`1791850000.${body}`).digest('hex');
        expect(signAccessEvent('secreto', '1791850000', body)).toBe(`sha256=${expected}`);
        // Cambiar el cuerpo o la hora invalida la firma: no se puede reenviar ni alterar.
        expect(signAccessEvent('secreto', '1791850001', body)).not.toBe(`sha256=${expected}`);
        expect(signAccessEvent('secreto', '1791850000', body.replace('402', '403'))).not.toBe(`sha256=${expected}`);
    });
});
