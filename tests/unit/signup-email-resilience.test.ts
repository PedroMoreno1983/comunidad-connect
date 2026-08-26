import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Un fallo al enviar el correo de confirmación no puede destruir una cuenta
 * que se creó correctamente.
 *
 * La ruta de registro borraba el usuario si `admin.auth.resend` devolvía
 * error. Bastaba topar el rate limit de correos de Supabase
 * (over_email_send_rate_limit) para perder un registro válido —con su perfil,
 * su unidad vinculada y sus consentimientos ya escritos—, y el residente veía
 * exactamente el mismo "No se pudo crear la cuenta" que produce un código de
 * invitación inválido. Al reintentar volvía a topar el límite.
 *
 * Detectado durante la verificación en producción del 2026-08-25.
 */

const routeSource = readFileSync(
    join(process.cwd(), 'src/app/api/auth/signup/route.ts'),
    'utf8',
);

/** Recorta el bloque que sigue a la llamada de reenvío del correo. */
function blockAfterResend() {
    const start = routeSource.indexOf('admin.auth.resend');
    expect(start, 'la ruta debe seguir enviando el correo de confirmación').toBeGreaterThan(-1);
    return routeSource.slice(start, start + 700);
}

describe('registro: el correo de confirmación no es parte de la transacción', () => {
    it('no borra al usuario cuando falla el envío del correo', () => {
        expect(blockAfterResend()).not.toContain('deleteUser');
    });

    it('no propaga el error del correo como fallo del registro', () => {
        const block = blockAfterResend();
        const throwsConfirmation = /if \(confirmationError\) \{[\s\S]{0,200}?throw confirmationError/.test(block);
        expect(throwsConfirmation).toBe(false);
    });

    it('deja rastro del fallo en vez de tragárselo en silencio', () => {
        expect(blockAfterResend()).toMatch(/logger\.(warn|error)/);
    });

    it('informa al cliente si el correo no salió, para no mandarlo a una bandeja vacía', () => {
        expect(routeSource).toContain('confirmationEmailSent');
    });

    it('sí revierte cuando lo que falla es la creación real de datos', () => {
        // El rollback debe seguir existiendo para perfil y consentimientos: ahí
        // la cuenta quedaría a medias y sin arreglo posible desde el login.
        const beforeResend = routeSource.slice(0, routeSource.indexOf('admin.auth.resend'));
        expect(beforeResend).toContain('deleteUser');
        expect(beforeResend).toMatch(/profileError|consentError/);
    });
});
