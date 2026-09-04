/**
 * Los tests de `coco-parking-tools` cubren el cableado: que las herramientas
 * existan, que el residente las alcance, que reservar pida confirmacion. Nada
 * cubria el *ejecutor*, que es donde vive la logica con consecuencias: el
 * aislamiento entre comunidades, la validacion de fechas y la delegacion en la
 * funcion de base que crea la reserva.
 *
 * La guarda que mas importa es la de comunidad. `book_parking` comprueba que el
 * cupo pertenezca a la comunidad del residente antes de reservarlo; sin esa
 * comprobacion, un spot_id de otro condominio revelaria su existencia y, peor,
 * podria reservarse.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
    tables: {} as Record<string, Row | null>,
    rpc: vi.fn(),
    rpcCalls: [] as { fn: string; args: Row }[],
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => {
    const from = (table: string) => {
        const builder: Record<string, unknown> = {
            select: () => builder,
            maybeSingle: async () => ({ data: mocks.tables[table] ?? null, error: null }),
            single: async () => ({ data: mocks.tables[table] ?? null, error: null }),
            then: (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => {
                const row = mocks.tables[table];
                return Promise.resolve({ data: row ? [row] : [], error: null }).then(ok, err);
            },
        };
        for (const method of ['eq', 'neq', 'in', 'gte', 'lte', 'gt', 'lt', 'is', 'not', 'or', 'ilike', 'order', 'limit', 'range', 'contains', 'overlaps']) {
            builder[method] = () => builder;
        }
        return builder;
    };
    const client = {
        from,
        rpc: async (fn: string, args: Row) => {
            mocks.rpcCalls.push({ fn, args });
            return mocks.rpc(fn, args);
        },
    };
    return { supabaseAdmin: client, getSupabaseAdmin: () => client };
});

import { executeTool } from '@/lib/coco/tools';

// UUID v4 valido: isUuid exige version [1-5] y variante [89ab].
const COMUNIDAD_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMUNIDAD_B = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const SPOT_ID = 'cccccccc-cccc-4ccc-accc-cccccccccccc';

const residente = {
    user_id: 'resident-1',
    name: 'Vecina',
    role: 'resident' as const,
    unit_id: 'unit-1',
    community_id: COMUNIDAD_A,
    currentPage: '/estacionamientos',
    channel: 'web' as const,
};

function reservar(input: Record<string, string>, ctx = residente) {
    return executeTool('book_parking', input, ctx) as Promise<Row>;
}

describe('book_parking: aislamiento entre comunidades', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rpcCalls = [];
        mocks.tables = {};
        mocks.rpc.mockResolvedValue({ data: 'booking-1', error: null });
    });

    it('reserva un cupo de la propia comunidad', async () => {
        mocks.tables.parking_spots = { label: 'A-12', community_id: COMUNIDAD_A };
        mocks.tables.parking_bookings = {
            starts_at: '2026-09-14T12:00:00.000Z',
            ends_at: '2026-09-14T16:00:00.000Z',
            total_amount: 6000,
            access_code: 'PK-4821',
            status: 'confirmed',
        };

        const result = await reservar({
            spot_id: SPOT_ID,
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T13:00:00-03:00',
        });

        expect(result.error).toBeUndefined();
        expect(result.reserva_id).toBe('booking-1');
        expect(result.estacionamiento).toBe('A-12');
        expect(result.access_code).toBe('PK-4821');
        expect(result.donde_verla).toBe('/estacionamientos');
        // La creacion se delega en la funcion de base, que revalida y calcula.
        expect(mocks.rpcCalls[0].fn).toBe('coco_create_parking_booking');
        expect(mocks.rpcCalls[0].args.p_user_id).toBe('resident-1');
        expect(mocks.rpcCalls[0].args.p_spot_id).toBe(SPOT_ID);
    });

    it('RECHAZA un cupo de otra comunidad sin revelar que existe', async () => {
        mocks.tables.parking_spots = { label: 'Z-99', community_id: COMUNIDAD_B };

        const result = await reservar({
            spot_id: SPOT_ID,
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T13:00:00-03:00',
        });

        expect(result.error).toBe('Ese estacionamiento no existe en tu comunidad.');
        // La respuesta es la misma que para un cupo inexistente: no filtra la
        // etiqueta del cupo ajeno ni confirma que este ahi.
        expect(JSON.stringify(result)).not.toContain('Z-99');
        // Y sobre todo: nunca se llamo a la funcion que crea la reserva.
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('RECHAZA un cupo inexistente con el mismo mensaje', async () => {
        mocks.tables.parking_spots = null;

        const result = await reservar({
            spot_id: SPOT_ID,
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T13:00:00-03:00',
        });

        expect(result.error).toBe('Ese estacionamiento no existe en tu comunidad.');
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('RECHAZA si el residente no tiene comunidad resuelta', async () => {
        const result = await reservar(
            { spot_id: SPOT_ID, starts_at: '2026-09-14T09:00:00-03:00', ends_at: '2026-09-14T13:00:00-03:00' },
            { ...residente, community_id: '' },
        );

        expect(String(result.error)).toContain('comunidad');
        expect(mocks.rpcCalls).toHaveLength(0);
    });
});

describe('book_parking: validacion de entrada antes de tocar la base', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rpcCalls = [];
        mocks.tables = { parking_spots: { label: 'A-12', community_id: COMUNIDAD_A } };
        mocks.rpc.mockResolvedValue({ data: 'booking-1', error: null });
    });

    it('exige un spot_id con forma de UUID, no un nombre inventado por el modelo', async () => {
        const result = await reservar({
            spot_id: 'el estacionamiento A-12',
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T13:00:00-03:00',
        });

        expect(String(result.error)).toContain('search_parking');
        expect(mocks.rpcCalls).toHaveLength(0);
    });

    it('rechaza fechas que no son ISO 8601', async () => {
        const result = await reservar({
            spot_id: SPOT_ID,
            starts_at: 'el viernes a las nueve',
            ends_at: 'hasta la tarde',
        });

        expect(String(result.error)).toContain('ISO 8601');
        expect(mocks.rpcCalls).toHaveLength(0);
    });
});

describe('book_parking: los errores de la funcion de base llegan al residente', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.rpcCalls = [];
        mocks.tables = { parking_spots: { label: 'A-12', community_id: COMUNIDAD_A } };
    });

    it('devuelve el mensaje tal cual, porque ya esta escrito para una persona', async () => {
        // La funcion de base responde cosas como "Registra tu vehiculo antes de
        // reservar". Envolverlo en un error generico perderia la instruccion.
        mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Registra tu vehiculo antes de reservar.' } });

        const result = await reservar({
            spot_id: SPOT_ID,
            starts_at: '2026-09-14T09:00:00-03:00',
            ends_at: '2026-09-14T13:00:00-03:00',
        });

        expect(result.error).toBe('Registra tu vehiculo antes de reservar.');
    });
});

describe('get_my_parking distingue "no tienes nada" de "nunca te registraste"', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.tables = {};
    });

    it('avisa que falta registrar vehiculo cuando no hay conductor', async () => {
        mocks.tables.parking_drivers = null;

        const result = await executeTool('get_my_parking', {}, residente) as Row;

        expect(result.vehiculo_registrado).toBeNull();
        // Sin esta nota, CoCo respondia "no tienes reservas" a alguien que en
        // realidad no puede reservar todavia, y el residente quedaba atascado.
        expect(String(result.nota)).toContain('/estacionamientos');
    });

    it('no agrega la nota cuando el conductor ya existe', async () => {
        mocks.tables.parking_drivers = { id: 'driver-1', plate: 'ABCD12', vehicle_description: 'Sedan gris' };

        const result = await executeTool('get_my_parking', {}, residente) as Row;

        expect(result.vehiculo_registrado).toEqual({ patente: 'ABCD12', descripcion: 'Sedan gris' });
        expect(result.nota).toBeUndefined();
    });
});
