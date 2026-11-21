/**
 * 19-11-2026: saludos y preguntas de "dónde está / cómo hago" van a Haiku 5.5;
 * lo que escribe datos, lee adjuntos o retoma una acción pendiente sigue en Sonnet.
 */
import { describe, expect, it } from 'vitest';
import { isLightTurn } from '@/lib/coco/lightTurn';

const turn = (message: string, extra: Partial<Parameters<typeof isLightTurn>[0]> = {}) =>
    isLightTurn({ message, resuming: false, attachments: 0, requiredTool: null, ...extra });

describe('turno liviano de CoCo', () => {
    it('saludos y preguntas de orientación', () => {
        expect(turn('hola coco buen dia!')).toBe(true);
        expect(turn('Gracias')).toBe(true);
        expect(turn('¿dónde veo mis gastos comunes?')).toBe(true);
        expect(turn('cómo hago una reserva del quincho')).toBe(false); // "reserva" pide acción
        expect(turn('qué puedo hacer aquí')).toBe(true);
        // 21-11-2026: preguntas de cuenta que solo leen.
        expect(turn('¿cuánto debo de gastos comunes y cuándo vence?')).toBe(true);
        expect(turn('estoy al día?')).toBe(true);
        expect(turn('registra el pago de 60.000 de la unidad 101')).toBe(false);
    });

    it('lo que cambia datos o necesita más contexto va al modelo grande', () => {
        expect(turn('sitio 20 Jose ignacio valenzuela')).toBe(false);
        expect(turn('hola, compara mi lista: arroz, leche y pan')).toBe(false);
        expect(turn('crea un aviso para mañana')).toBe(false);
        expect(turn('hola', { resuming: true })).toBe(false);
        expect(turn('hola', { attachments: 1 })).toBe(false);
        expect(turn('hola', { requiredTool: 'set_unit_owner' })).toBe(false);
        expect(turn(`hola ${'x'.repeat(200)}`)).toBe(false);
    });
});
