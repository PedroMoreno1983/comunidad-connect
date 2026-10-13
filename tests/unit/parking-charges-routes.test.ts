/**
 * Rutas del cobro de estacionamientos: la de procesar el cobro tras reservar
 * (solo el conductor o la administración de esa comunidad, y nunca con un monto
 * del cliente) y el webhook de Haulmer con referencia PARKING_<id>.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

const mocks = vi.hoisted(() => ({
    user: null as { id: string } | null,
    tables: {} as Record<string, Row | null>,
    rpc: vi.fn(),
    processParkingCharge: vi.fn(),
}));

vi.mock('@/lib/server/agentIdentity', () => ({
    getSupabaseUserClient: async () => ({
        auth: { getUser: async () => ({ data: { user: mocks.user }, error: null }) },
    }),
}));

vi.mock('@/lib/security/rateLimit', () => ({
    enforceDistributedRateLimit: async () => null,
}));

vi.mock('@/lib/supabase/supabaseAdmin', () => {
    const from = (table: string) => {
        const builder: Record<string, unknown> = {
            select: () => builder,
            eq: () => builder,
            maybeSingle: async () => ({ data: mocks.tables[table] ?? null, error: null }),
        };
        return builder;
    };
    const client = { from, rpc: (fn: string, args: Row) => mocks.rpc(fn, args) };
    return { supabaseAdmin: client, getSupabaseAdmin: () => client };
});

vi.mock('@/lib/payments/parkingCharges', () => ({
    processParkingCharge: mocks.processParkingCharge,
}));

import { POST as processRoute } from '@/app/api/parking/charges/process/route';
import { POST as haulmerWebhook } from '@/app/api/webhooks/haulmer/route';
import { signHaulmerParams } from '@/lib/services/haulmer';

const BOOKING_ID = '33333333-3333-4333-8333-333333333333';
const CHARGE_ID = '44444444-4444-4444-9444-444444444444';
const COMMUNITY_A = 'community-a';

function processRequest(body: unknown) {
    return new Request('http://localhost/api/parking/charges/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = null;
    mocks.tables = {
        parking_bookings: { id: BOOKING_ID, community_id: COMMUNITY_A, driver_id: 'driver-1', parking_drivers: { user_id: 'driver-user' } },
    };
    mocks.processParkingCharge.mockResolvedValue({ charge: null, provider: 'common_expenses', checkoutUrl: null });
});

describe('POST /api/parking/charges/process', () => {
    it('exige sesión', async () => {
        const response = await processRoute(processRequest({ bookingId: BOOKING_ID }));
        expect(response.status).toBe(401);
    });

    it('el conductor procesa el cobro de su reserva, y el monto del cliente se ignora', async () => {
        mocks.user = { id: 'driver-user' };
        const response = await processRoute(processRequest({ bookingId: BOOKING_ID, amount: 1 }));
        expect(response.status).toBe(200);
        expect(mocks.processParkingCharge).toHaveBeenCalledTimes(1);
        // Solo (cliente de base, bookingId): ningún monto llega a la capa de cobro.
        expect(mocks.processParkingCharge.mock.calls[0]).toHaveLength(2);
        expect(mocks.processParkingCharge.mock.calls[0][1]).toBe(BOOKING_ID);
    });

    it('un residente que no es el conductor no puede tocar el cobro', async () => {
        mocks.user = { id: 'otro-vecino' };
        mocks.tables.profiles = { role: 'resident', community_id: COMMUNITY_A };
        const response = await processRoute(processRequest({ bookingId: BOOKING_ID }));
        expect(response.status).toBe(403);
        expect(mocks.processParkingCharge).not.toHaveBeenCalled();
    });

    it('la administración de otra comunidad tampoco', async () => {
        mocks.user = { id: 'admin-b' };
        mocks.tables.profiles = { role: 'admin', community_id: 'community-b' };
        const response = await processRoute(processRequest({ bookingId: BOOKING_ID }));
        expect(response.status).toBe(403);
    });

    it('la administración de la comunidad sí', async () => {
        mocks.user = { id: 'admin-a' };
        mocks.tables.profiles = { role: 'admin', community_id: COMMUNITY_A };
        const response = await processRoute(processRequest({ bookingId: BOOKING_ID }));
        expect(response.status).toBe(200);
    });

    it('rechaza un id inválido', async () => {
        mocks.user = { id: 'driver-user' };
        const response = await processRoute(processRequest({ bookingId: 'x' }));
        expect(response.status).toBe(400);
    });
});

describe('webhook de Haulmer: arriendos de estacionamiento', () => {
    it('una referencia PARKING_<id> va al libro con el monto informado por Haulmer', async () => {
        process.env.HAULMER_SECRET_KEY = 'secret-abc';
        process.env.HAULMER_ACCOUNT_ID = 'acc-123';
        mocks.rpc.mockResolvedValue({ data: 'processed', error: null });

        const params: Record<string, string> = {
            x_account_id: 'acc-123',
            x_amount: '4500',
            x_currency: 'CLP',
            x_reference: `PARKING_${CHARGE_ID}`,
            x_result: 'completed',
            x_gateway_reference: 'gw-9',
        };
        params.x_signature = signHaulmerParams(params, 'secret-abc');

        const response = await haulmerWebhook(new Request('http://localhost/api/webhooks/haulmer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params).toString(),
        }));

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ received: true, status: 'processed' });
        expect(mocks.rpc).toHaveBeenCalledWith('parking_charge_apply_provider_result', {
            p_charge_id: CHARGE_ID,
            p_result: 'completed',
            p_paid_amount: 4500,
            p_gateway_reference: 'gw-9',
        });
    });
});
