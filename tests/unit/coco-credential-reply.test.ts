/**
 * El enlace del portal de un maestro es una credencial: CoCo lo muestra una vez
 * tras la confirmación, no lo guarda, y si se reintenta la misma aprobación
 * dice que hay que pedir uno nuevo. Las colas internas no llevan enlace.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({ supabaseAdmin: {}, getSupabaseAdmin: () => ({}) }));
vi.setConfig({ testTimeout: 60_000 });

describe('credenciales en la respuesta de CoCo', () => {
    it('arma el texto con el enlace y el acceso a WhatsApp', async () => {
        const { credentialReply } = await import('@/lib/coco/agent');
        const text = credentialReply({ success: true, credential: { url: 'https://x.cl/proveedor/tok', whatsapp_link: 'https://wa.me/569?text=hola' } });
        expect(text).toContain('https://x.cl/proveedor/tok');
        expect(text).toContain('[Enviar por WhatsApp](https://wa.me/569?text=hola)');
        expect(credentialReply({ success: true, message: 'ok' })).toBe('');
    });

    it('un reintento con la credencial tachada no la finge: pide un enlace nuevo', async () => {
        const { replayableResult } = await import('@/lib/coco/agent');
        const replay = replayableResult({ success: true, credential: '[redacted]' }) as Record<string, unknown>;
        expect(replay.success).toBe(false);
        expect(String(replay.error)).toMatch(/enlace nuevo/);
        const other = { success: true, message: 'Reserva creada' };
        expect(replayableResult(other)).toBe(other);
    });
});

describe('colas internas', () => {
    it('la Mesa de ayuda interna no es un maestro', async () => {
        const { isInternalProvider } = await import('@/lib/services/providerPortal');
        expect(isInternalProvider({ id: 'b392cf17-0006-4000-8000-000000000010' })).toBe(true);
        expect(isInternalProvider({ id: 'otro', name: 'Mesa de ayuda interna' })).toBe(true);
        expect(isInternalProvider({ id: 'otro', name: 'Juan Gasfiter' })).toBe(false);
    });
});
