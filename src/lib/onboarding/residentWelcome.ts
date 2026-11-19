import 'server-only';

import { BRAND, FROM_EMAIL, emailWrapper, escapeEmailHtml, resend } from '@/lib/email';
import { CANONICAL_SITE_URL } from '@/lib/config';

/**
 * Correo de bienvenida para residentes que entran por nómina (19-11-2026).
 *
 * La nómina crea la cuenta sin avisar a nadie: la persona no sabía que tenía
 * acceso. El correo no lleva un código (vence en una hora): lleva a "Crear mi
 * contraseña" con el correo ya escrito, y ahí se pide un código fresco cuando
 * la persona lo abra, aunque sea días después.
 */

export interface ResidentWelcome {
    email: string;
    name: string;
    unit: string;
}

export function residentWelcomeUrl(email: string) {
    return `${CANONICAL_SITE_URL}/forgot-password?email=${encodeURIComponent(email)}&bienvenida=1`;
}

export function renderResidentWelcomeHtml(person: ResidentWelcome, communityName: string) {
    const name = escapeEmailHtml(person.name.split(/\s+/)[0] || 'vecino');
    const community = escapeEmailHtml(communityName || 'tu comunidad');
    const unit = escapeEmailHtml(person.unit);
    const url = escapeEmailHtml(residentWelcomeUrl(person.email));
    return emailWrapper(`
        <h1 style="font-family:${BRAND.serif};font-size:30px;font-weight:400;color:${BRAND.ink};">Hola, ${name}</h1>
        <p style="color:${BRAND.inkMuted};font-size:15px;line-height:1.6;">La administración de <strong>${community}</strong> te dio acceso a Convive Connect como residente de la unidad ${unit}.</p>
        <p style="color:${BRAND.inkMuted};font-size:15px;line-height:1.6;">Ahí ves tus gastos comunes, avisos de la comunidad, reservas de espacios comunes y puedes preguntarle a CoCo, el asistente, lo que necesites.</p>
        <p style="color:${BRAND.inkMuted};font-size:15px;line-height:1.6;">Para entrar, crea tu contraseña. Te mandamos un código a este mismo correo.</p>
        <p style="margin:28px 0;"><a href="${url}" style="display:inline-block;padding:13px 20px;border-radius:10px;background:${BRAND.ink};color:#fff;text-decoration:none;font-weight:600;">Crear mi contraseña</a></p>
        <p style="color:${BRAND.inkTertiary};font-size:13px;line-height:1.6;">El botón sirve cuando quieras. Si no vives en ${community}, ignora este correo.</p>
    `, `Tu acceso a ${communityName || 'tu comunidad'}`);
}

/** Envía la bienvenida a cada cuenta nueva. Nunca lanza: devuelve cuántas salieron. */
export async function sendResidentWelcomeEmails(people: ResidentWelcome[], communityName: string) {
    let sent = 0;
    const failed: string[] = [];
    for (const person of people) {
        try {
            const { error } = await resend.emails.send({
                from: FROM_EMAIL,
                to: person.email,
                subject: `Tu acceso a ${communityName || 'tu comunidad'} en Convive Connect`,
                html: renderResidentWelcomeHtml(person, communityName),
            });
            if (error) throw error;
            sent++;
        } catch (error) {
            failed.push(person.email);
            console.error('[onboarding/welcome] send failed:', error);
        }
    }
    return { sent, failed };
}
