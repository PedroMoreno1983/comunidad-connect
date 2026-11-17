/**
 * Calificar una reserva de estacionamiento. El bug: rateBooking actualizaba
 * columnas que no existían, se tragaba el error con un console.warn y la
 * pantalla agradecía igual. Nadie guardó nunca una calificación.
 *
 * Estos tests fijan que el error suba, que la pantalla deshaga las estrellas
 * si falla, y que CoCo califique con el perfil autenticado.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const supabaseMock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));

import { ParkingService } from '@/lib/api';
import { rateParkingBooking } from '@/lib/coco/parkingExtraTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';

const root = path.resolve(__dirname, '../..');
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

describe('el servicio de la pantalla', () => {
    it('usa la función de base y ya no escribe columnas directo', async () => {
        supabaseMock.rpc.mockResolvedValueOnce({ data: true, error: null });
        await ParkingService.rateBooking(ID, 4, ' buen lugar ');
        expect(supabaseMock.rpc).toHaveBeenCalledWith('rate_parking_booking', { p_booking_id: ID, p_rating: 4, p_comment: 'buen lugar' });
    });

    it('si falla, lanza el error (antes se lo tragaba)', async () => {
        supabaseMock.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Podrás calificar cuando termine la reserva' } });
        await expect(ParkingService.rateBooking(ID, 5)).rejects.toThrow('Podrás calificar cuando termine la reserva');
    });

    it('la pantalla deshace las estrellas y avisa si no se guardó', () => {
        const modal = fs.readFileSync(path.join(root, 'src/components/parking/ParkingAccessPassModal.tsx'), 'utf8');
        expect(modal).not.toContain('// Ignore');
        expect(modal).toContain('No se guardó tu calificación');
        expect(modal).toContain('setRated(previous.rated)');
    });

    it('la migración crea las columnas y la regla de 1 a 5', () => {
        const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20261117140000_parking_booking_rating.sql'), 'utf8');
        expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS rating SMALLINT/);
        expect(migration).toMatch(/rating BETWEEN 1 AND 5/);
        expect(migration).toMatch(/Solo el conductor puede calificar/);
    });
});

describe('CoCo', () => {
    it('es del residente y pide confirmación', () => {
        const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
        expect(nombres).toContain('rate_parking_booking');
        expect(isToolAllowedForRole('rate_parking_booking', 'resident')).toBe(true);
        expect(MUTATING_TOOLS.has('rate_parking_booking')).toBe(true);
    });

    it('califica con el perfil autenticado', async () => {
        const rpc = vi.fn(async () => ({ data: true, error: null }));
        const db = { rpc } as unknown as SupabaseClient;
        const result = await rateParkingBooking(db, VECINA, { booking_id: ID, rating: 4 }) as Record<string, unknown>;
        expect(result.success).toBe(true);
        expect(rpc).toHaveBeenCalledWith('coco_rate_parking_booking', { p_user_id: VECINA, p_booking_id: ID, p_rating: 4, p_comment: null });
    });

    it('fuera de 1 a 5 no llama a la base', async () => {
        const rpc = vi.fn();
        const result = await rateParkingBooking({ rpc } as unknown as SupabaseClient, VECINA, { booking_id: ID, rating: 9 }) as Record<string, unknown>;
        expect(result.error).toBeTruthy();
        expect(rpc).not.toHaveBeenCalled();
    });
});
