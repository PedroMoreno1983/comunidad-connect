import { describe, expect, it } from 'vitest';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { GOOGLE_SCOPES, gmailRawMessage, googleAuthUrl, parseGoogleTokenResponse, singleEmail } from '@/lib/coco/googleOAuth';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('Google de un administrador', () => {
    it('pide solo lectura y envío de Gmail, y lectura y eventos de Calendar', () => {
        expect(GOOGLE_SCOPES).toEqual([
            'openid',
            'email',
            'https://www.googleapis.com/auth/gmail.readonly',
            'https://www.googleapis.com/auth/gmail.send',
            'https://www.googleapis.com/auth/calendar.readonly',
            'https://www.googleapis.com/auth/calendar.events',
        ]);
        const url = new URL(googleAuthUrl({ clientId: 'cliente', redirectUri: 'https://conviveconnect.com/api/admin/google/callback', state: 'abc' }));
        expect(url.searchParams.get('scope')).toBe(GOOGLE_SCOPES.join(' '));
        expect(url.searchParams.get('access_type')).toBe('offline');
        expect(url.searchParams.get('scope')).not.toContain('gmail.modify');
        expect(url.searchParams.get('scope')).not.toContain('https://www.googleapis.com/auth/calendar ');
    });

    it('no guarda un token vacío y arma un solo correo', () => {
        expect(parseGoogleTokenResponse({ access_token: 'ya', expires_in: 100, refresh_token: 're', scope: GOOGLE_SCOPES.join(' ') }, 0)?.expiresAt).toBe('1970-01-01T00:01:40.000Z');
        expect(parseGoogleTokenResponse({})).toBeNull();
        expect(singleEmail(' Admin@Correo.cl ')).toBe('admin@correo.cl');
        expect(singleEmail('dos personas')).toBeNull();
        const raw = Buffer.from(gmailRawMessage({ to: 'a@b.cl', subject: 'Hola', body: 'Texto' }), 'base64url').toString('utf8');
        expect(raw).toContain('To: a@b.cl');
        expect(raw).not.toContain('Bcc:');
    });

    it('leer no pide confirmación; enviar y crear sí', () => {
        expect(cocoToolRisk('list_my_gmail')).toBe('read');
        expect(cocoToolRisk('list_my_calendar')).toBe('read');
        expect(MUTATING_TOOLS.has('send_gmail')).toBe(true);
        expect(MUTATING_TOOLS.has('create_calendar_event')).toBe(true);
        expect(cocoToolRisk('send_gmail')).toBe('write_high');
        expect(isToolAllowedForRole('send_gmail', 'admin')).toBe(true);
        expect(isToolAllowedForRole('list_my_gmail', 'resident')).toBe(false);
    });
});
