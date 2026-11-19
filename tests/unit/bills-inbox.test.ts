/**
 * 19-11-2026: las boletas de luz, agua y gas llegan solas por correo a una
 * dirección de la comunidad (Resend inbound) y quedan en una bandeja para
 * registrarlas en un clic.
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => { throw new Error('sin base en tests'); } }));

import { inboxAddress, resendDownloadAllowed, tokensFromRecipients, verifySvixSignature } from '@/lib/finance/billsInbox';

const SECRET = 'whsec_' + Buffer.from('clave-de-prueba-de-32-bytes!!!!!').toString('base64');
const sign = (id: string, ts: string, body: string) =>
    'v1,' + createHmac('sha256', Buffer.from(SECRET.slice(6), 'base64')).update(`${id}.${ts}.${body}`).digest('base64');

beforeEach(() => { process.env.BILLS_INBOUND_DOMAIN = 'boletas.conviveconnect.com'; });
afterEach(() => { delete process.env.BILLS_INBOUND_DOMAIN; });

describe('firma del webhook de Resend (Svix)', () => {
    const now = Date.UTC(2026, 10, 19, 12);
    const ts = String(Math.floor(now / 1000));
    const body = '{"type":"email.received"}';

    it('acepta la firma correcta', () => {
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), body, now })).toBe(true);
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: `v1,otra ${sign('msg_1', ts, body)}`, body, now })).toBe(true);
    });

    it('rechaza cuerpo alterado, firma ajena, vieja o ausente', () => {
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), body: body + ' ', now })).toBe(false);
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_2', timestamp: ts, signature: sign('msg_1', ts, body), body, now })).toBe(false);
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), body, now: now + 10 * 60_000 })).toBe(false);
        expect(verifySvixSignature({ secret: SECRET, id: 'msg_1', timestamp: ts, signature: null, body, now })).toBe(false);
        expect(verifySvixSignature({ secret: '', id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), body, now })).toBe(false);
    });
});

describe('dirección de la comunidad', () => {
    it('reconoce el token en to, cc o received_for, solo de nuestro dominio', () => {
        expect(tokensFromRecipients(['Bahía <bp7k2m9xq4ab@boletas.conviveconnect.com>'])).toEqual(['bp7k2m9xq4ab']);
        expect(tokensFromRecipients(['bp7k2m9xq4ab+enel@BOLETAS.conviveconnect.com'])).toEqual(['bp7k2m9xq4ab']);
        expect(tokensFromRecipients(['bp7k2m9xq4ab@otro.cl', 'x@boletas.conviveconnect.com', 42])).toEqual([]);
    });

    it('arma la dirección solo si el dominio está configurado', () => {
        expect(inboxAddress('bp7k2m9xq4ab')).toBe('bp7k2m9xq4ab@boletas.conviveconnect.com');
        delete process.env.BILLS_INBOUND_DOMAIN;
        expect(inboxAddress('bp7k2m9xq4ab')).toBeNull();
    });
});

describe('seguridad', () => {
    it('solo baja adjuntos del CDN de Resend', () => {
        expect(resendDownloadAllowed('https://inbound-cdn.resend.com/a/b?sig=1')).toBe(true);
        expect(resendDownloadAllowed('http://inbound-cdn.resend.com/a')).toBe(false);
        expect(resendDownloadAllowed('https://resend.com.evil.cl/a')).toBe(false);
        expect(resendDownloadAllowed('https://169.254.169.254/latest')).toBe(false);
    });

    it('la bandeja solo la lee la administración y el token no llega al navegador', () => {
        const sql = readFileSync('supabase/migrations/20261119020000_bills_inbox.sql', 'utf8');
        expect(sql).toContain("public.get_my_role() = 'admin'");
        expect(sql).not.toMatch(/GRANT SELECT \(bills_inbox_token\)/);
        expect(sql).toContain('UNIQUE (email_id, attachment_id)');
    });
});
