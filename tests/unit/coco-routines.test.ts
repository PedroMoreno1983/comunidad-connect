import { describe, expect, it } from 'vitest';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';
import { nextRoutineInstant, parseRoutineRequest, routineDelivery } from '@/lib/coco/routines';
import { isToolAllowedForRole, MUTATING_TOOLS } from '@/lib/coco/tools';

describe('rutinas del administrador', () => {
    it('entiende cada lunes a las 8 y deja las 9 si no hay hora', () => {
        const monday = parseRoutineRequest('cada lunes a las 8 mándame el resumen');
        expect(monday).toMatchObject({ cadence: 'weekly', weekday: 1, timeLocal: '08:00' });
        const plain = parseRoutineRequest('cada lunes mándame el resumen');
        expect(plain).toMatchObject({ cadence: 'weekly', weekday: 1, timeLocal: '09:00' });
        expect(parseRoutineRequest('el día 5 de cada mes el resumen')).toMatchObject({ cadence: 'monthly', dayOfMonth: 5, timeLocal: '09:00' });
        expect(parseRoutineRequest('avísame luego')).toEqual({ error: 'Dime cada cuánto: cada lunes, cada día o el día 5 de cada mes.' });
    });

    it('programa el próximo lunes de Chile después de un miércoles', () => {
        if ('error' in parseRoutineRequest('cada lunes mándame el resumen')) return;
        const draft = parseRoutineRequest('cada lunes mándame el resumen');
        if ('error' in draft) return;
        const next = nextRoutineInstant(draft, new Date('2026-11-04T15:00:00.000Z'));
        expect(next.toISOString()).toBe('2026-11-09T12:00:00.000Z');
    });

    it('el resumen no trae montos y crear pide confirmación', () => {
        expect(routineDelivery('mándame el resumen', { assemblies: 1, bookings: 2 })).toContain('1 asamblea');
        expect(routineDelivery('mándame el resumen', { assemblies: 1, bookings: 2 })).not.toMatch(/\$|deudor/);
        expect(MUTATING_TOOLS.has('create_routine')).toBe(true);
        expect(MUTATING_TOOLS.has('list_routines')).toBe(false);
        expect(cocoToolRisk('create_routine')).toBe('write_high');
        expect(cocoToolRisk('pause_routine')).toBe('write_high');
        expect(cocoToolRisk('delete_routine')).toBe('write_high');
        expect(isToolAllowedForRole('create_routine', 'admin')).toBe(true);
        expect(isToolAllowedForRole('create_routine', 'resident')).toBe(false);
        expect(isToolAllowedForRole('list_routines', 'resident')).toBe(false);
    });
});
