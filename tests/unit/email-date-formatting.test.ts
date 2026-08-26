import { describe, expect, it } from 'vitest';
import { formatEmailDate } from '../../src/lib/email';

/**
 * Las fechas de los correos se corrían un día.
 *
 * `new Date('2026-09-14')` se interpreta como medianoche UTC; al formatearla
 * en horario de Chile (UTC-3/-4) retrocede al 13. Los residentes recibían la
 * confirmación de su reserva y la fecha de vencimiento de su gasto común un
 * día antes de lo que realmente eran.
 *
 * Detectado al renderizar las plantillas para revisar el diseño.
 */
describe('fechas de los correos', () => {
    it('no retrocede un día en una fecha de calendario', () => {
        expect(formatEmailDate('2026-09-14', { day: 'numeric', month: 'long', year: 'numeric' }))
            .toBe('14 de septiembre de 2026');
    });

    it('mantiene el día de la semana correcto', () => {
        // El 14 de septiembre de 2026 es lunes.
        expect(formatEmailDate('2026-09-14', { weekday: 'long' })).toBe('lunes');
    });

    it('respeta el primer día del mes, el caso que más se nota', () => {
        expect(formatEmailDate('2026-09-01', { day: 'numeric', month: 'long' }))
            .toBe('1 de septiembre');
    });

    it('no se cae con el último día del año', () => {
        expect(formatEmailDate('2026-12-31', { day: 'numeric', month: 'long', year: 'numeric' }))
            .toBe('31 de diciembre de 2026');
    });

    it('sigue aceptando una marca de tiempo completa', () => {
        // Con hora explícita la conversión de zona sí es correcta: no se toca.
        const salida = formatEmailDate('2026-09-14T15:00:00-03:00', { day: 'numeric', month: 'long' });
        expect(salida).toBe('14 de septiembre');
    });
});
