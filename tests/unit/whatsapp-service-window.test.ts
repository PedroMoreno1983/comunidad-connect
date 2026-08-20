import { describe, expect, it } from 'vitest';
import { serviceWindowIsOpen } from '@/lib/server/whatsappNotify';

/**
 * La ventana de servicio decide si un aviso sale como texto libre o como
 * plantilla. Equivocarse hacia "abierta" significa que Twilio rechaza el envío
 * con el error 63016 y el residente nunca se entera, así que ante la duda esta
 * función tiene que responder "cerrada".
 */
describe('serviceWindowIsOpen', () => {
    const now = new Date('2026-08-19T12:00:00Z').getTime();
    const hoursAgo = (h: number) => new Date(now - h * 60 * 60 * 1000).toISOString();

    it('está cerrada si el residente nunca escribió', () => {
        expect(serviceWindowIsOpen(null, now)).toBe(false);
        expect(serviceWindowIsOpen(undefined, now)).toBe(false);
        expect(serviceWindowIsOpen('', now)).toBe(false);
    });

    it('está abierta con un mensaje reciente', () => {
        expect(serviceWindowIsOpen(hoursAgo(0.5), now)).toBe(true);
        expect(serviceWindowIsOpen(hoursAgo(12), now)).toBe(true);
    });

    it('está cerrada pasadas las 24 horas', () => {
        expect(serviceWindowIsOpen(hoursAgo(24), now)).toBe(false);
        expect(serviceWindowIsOpen(hoursAgo(25), now)).toBe(false);
        expect(serviceWindowIsOpen(hoursAgo(72), now)).toBe(false);
    });

    it('cierra 5 minutos antes del límite real', () => {
        // A 23h50m todavía quedan 10 minutos de ventana real, pero el margen la
        // da por cerrada: entre la decisión y la entrega en Twilio pasa tiempo.
        expect(serviceWindowIsOpen(hoursAgo(23.5), now)).toBe(true);
        expect(serviceWindowIsOpen(hoursAgo(23.99), now)).toBe(false);
    });

    it('está cerrada con una fecha ilegible', () => {
        expect(serviceWindowIsOpen('no es una fecha', now)).toBe(false);
        expect(serviceWindowIsOpen(12345, now)).toBe(false);
        expect(serviceWindowIsOpen({}, now)).toBe(false);
    });

    it('está cerrada si la fecha viene del futuro', () => {
        // Un reloj desincronizado no debe abrir la ventana indefinidamente.
        expect(serviceWindowIsOpen(hoursAgo(-48), now)).toBe(false);
    });
});
