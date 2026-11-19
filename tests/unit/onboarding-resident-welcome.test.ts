/**
 * 19-11-2026: quien entra por nómina con correo recibe una bienvenida que lo
 * lleva a crear su contraseña. El enlace no vence: el código se pide al abrirlo.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const sent = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock('@/lib/email', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/email')>(),
    resend: { emails: { send: vi.fn(async (msg: Record<string, unknown>) => {
        sent.push(msg);
        return msg.to === 'falla@ejemplo.cl' ? { error: new Error('rebote') } : { error: null };
    }) } },
}));

import { renderResidentWelcomeHtml, residentWelcomeUrl, sendResidentWelcomeEmails } from '@/lib/onboarding/residentWelcome';

describe('bienvenida de residentes por nómina', () => {
    it('el enlace lleva a crear contraseña con el correo escrito', () => {
        expect(residentWelcomeUrl('ana+1@ejemplo.cl')).toMatch(/\/forgot-password\?email=ana%2B1%40ejemplo\.cl&bienvenida=1$/);
    });

    it('nombra la comunidad y la unidad, y escapa el HTML', () => {
        const html = renderResidentWelcomeHtml({ email: 'ana@ejemplo.cl', name: 'Ana <b>Pérez</b>', unit: 'Sitio 20' }, 'Condominio Lago & Bosque');
        expect(html).toContain('Condominio Lago &amp; Bosque');
        expect(html).toContain('Sitio 20');
        expect(html).toContain('Crear mi contraseña');
        expect(html).not.toContain('<b>Pérez');
    });

    it('un rebote no corta los demás envíos', async () => {
        const result = await sendResidentWelcomeEmails([
            { email: 'falla@ejemplo.cl', name: 'X', unit: '1' },
            { email: 'ana@ejemplo.cl', name: 'Ana', unit: '2' },
        ], 'Lago');
        expect(result).toEqual({ sent: 1, failed: ['falla@ejemplo.cl'] });
        expect(sent.at(-1)).toMatchObject({ to: 'ana@ejemplo.cl', subject: 'Tu acceso a Lago en Convive Connect' });
    });
});
