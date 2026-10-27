/**
 * Capa de proveedor del cobro de estacionamientos (PaymentProvider): Haulmer
 * apagado por defecto, respaldo a gastos comunes, monto siempre desde el libro
 * y nunca desde el cliente, e idempotencia del link de pago.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    createPaymentLink: vi.fn(),
}));

vi.mock('@/lib/services/haulmer', () => ({
    HaulmerService: { createPaymentLink: mocks.createPaymentLink },
    signHaulmerParams: vi.fn(),
}));

import {
    createCommonExpensesProvider,
    createHaulmerParkingProvider,
    parkingChargeReference,
    parkingHaulmerUnavailableReason,
} from '@/lib/payments/paymentProvider';
import { processParkingCharge, type ParkingChargesDb } from '@/lib/payments/parkingCharges';
import { describeParkingCharge, freeCancellationDeadline, isFreeCancellation } from '@/lib/parking';

const CHARGE_ID = '11111111-1111-4111-8111-111111111111';
const BOOKING_ID = '22222222-2222-4222-9222-222222222222';
const HAULMER_ON = {
    PARKING_HAULMER_ENABLED: 'true',
    HAULMER_ACCOUNT_ID: 'acc-123',
    HAULMER_SECRET_KEY: 'secret-abc',
};

type Row = Record<string, unknown>;

function fakeDb(charge: Row | null) {
    const state = { charge: charge ? { ...charge } : null };
    const rpcCalls: { fn: string; args: Row }[] = [];
    const tables: Record<string, Row | null> = {
        parking_drivers: { full_name: 'Vecino Conductor', phone: '+56911112222', user_id: 'user-1' },
        profiles: { email: 'vecino@example.com' },
    };
    const db: ParkingChargesDb = {
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({
                        data: table === 'parking_charges' ? state.charge : tables[table] ?? null,
                        error: null,
                    }),
                }),
            }),
        }),
        rpc: async (fn: string, args: Row) => {
            rpcCalls.push({ fn, args });
            if (fn === 'parking_charge_fallback_to_unit' && state.charge) {
                state.charge = { ...state.charge, status: 'charged', method: 'common_expenses', unit_id: 'unit-202' };
                return { data: 'charged', error: null };
            }
            if (fn === 'parking_charge_register_checkout' && state.charge) {
                state.charge = { ...state.charge, payment_url: args.p_payment_url, provider_reference: args.p_provider_reference };
                return { data: true, error: null };
            }
            return { data: null, error: null };
        },
    };
    return { db, rpcCalls, state };
}

const haulmerPending: Row = {
    id: CHARGE_ID,
    booking_id: BOOKING_ID,
    community_id: 'community-a',
    driver_id: 'driver-1',
    amount: 4500,
    method: 'haulmer',
    status: 'pending',
    needs_review: false,
    payment_url: null,
    created_at: '2026-10-13T12:00:00Z',
};

beforeEach(() => {
    vi.clearAllMocks();
});

describe('interruptor de Haulmer para estacionamientos', () => {
    it('queda activo con credenciales Haulmer sin requerir flag extra', () => {
        expect(parkingHaulmerUnavailableReason({
            HAULMER_ACCOUNT_ID: 'acc-123',
            HAULMER_SECRET_KEY: 'secret-abc',
        })).toBeNull();
    });

    it('sin credenciales indica que faltan las claves de Haulmer', () => {
        expect(parkingHaulmerUnavailableReason({})).toMatch(/HAULMER_ACCOUNT_ID/);
        expect(parkingHaulmerUnavailableReason({ PARKING_HAULMER_ENABLED: 'true' })).toMatch(/HAULMER_ACCOUNT_ID/);
        expect(parkingHaulmerUnavailableReason({
            PARKING_HAULMER_ENABLED: 'true',
            HAULMER_ACCOUNT_ID: 'TU_ACCOUNT',
            HAULMER_SECRET_KEY: 'placeholder',
        })).not.toBeNull();
    });

    it('se puede desactivar explícitamente con PARKING_HAULMER_ENABLED=false', () => {
        expect(parkingHaulmerUnavailableReason({
            ...HAULMER_ON,
            PARKING_HAULMER_ENABLED: 'false',
        })).toMatch(/PARKING_HAULMER_ENABLED/);
    });

    it('con flag y credenciales queda disponible', () => {
        expect(parkingHaulmerUnavailableReason(HAULMER_ON)).toBeNull();
    });

    it('el reembolso por API de Haulmer es un stub explícito: no promete devolver plata', async () => {
        const provider = createHaulmerParkingProvider(HAULMER_ON);
        const result = await provider.refund({ chargeId: CHARGE_ID, amount: 4500, providerReference: 'x' });
        expect(result.refunded).toBe(false);
        expect(result.reason).toMatch(/TODO/);
    });
});

describe('processParkingCharge', () => {
    it('con el método por defecto no hace nada: la base ya cargó el cobro al reservar', async () => {
        const { db, rpcCalls } = fakeDb({ ...haulmerPending, method: 'common_expenses', status: 'charged' });
        const result = await processParkingCharge(db, BOOKING_ID, {
            haulmer: createHaulmerParkingProvider(HAULMER_ON),
        });
        expect(result.provider).toBe('common_expenses');
        expect(result.charge?.status).toBe('charged');
        expect(result.checkoutUrl).toBeNull();
        expect(rpcCalls).toEqual([]);
        expect(mocks.createPaymentLink).not.toHaveBeenCalled();
    });

    it('si la comunidad eligió Haulmer pero no hay credenciales, respalda en gastos comunes', async () => {
        const { db, rpcCalls } = fakeDb(haulmerPending);
        const result = await processParkingCharge(db, BOOKING_ID, {
            haulmer: createHaulmerParkingProvider({}),
        });
        expect(mocks.createPaymentLink).not.toHaveBeenCalled();
        expect(rpcCalls).toHaveLength(1);
        expect(rpcCalls[0].fn).toBe('parking_charge_fallback_to_unit');
        expect(rpcCalls[0].args).toEqual({ p_charge_id: CHARGE_ID, p_reason: expect.stringMatching(/HAULMER_ACCOUNT_ID/) });
        // Ningún monto viaja a la base: lo tiene el libro.
        expect(Object.keys(rpcCalls[0].args)).not.toContain('p_amount');
        expect(result.charge?.status).toBe('charged');
        expect(result.provider).toBe('common_expenses');
        expect(result.fallbackReason).toMatch(/HAULMER_ACCOUNT_ID/);
    });

    it('con Haulmer habilitado genera el link con el monto del libro y la referencia PARKING_<id>', async () => {
        mocks.createPaymentLink.mockResolvedValue({ url: 'https://pay.example/abc', token: 'tok-1', reference: 'r' });
        const { db, rpcCalls } = fakeDb(haulmerPending);
        const result = await processParkingCharge(db, BOOKING_ID, {
            haulmer: createHaulmerParkingProvider(HAULMER_ON),
            returnUrl: 'https://conviveconnect.com/estacionamientos?tab=bookings',
        });

        expect(mocks.createPaymentLink).toHaveBeenCalledTimes(1);
        const payload = mocks.createPaymentLink.mock.calls[0][0];
        expect(payload.amount).toBe(4500);
        expect(payload.reference).toBe(parkingChargeReference(CHARGE_ID));
        expect(payload.reference).toBe(`PARKING_${CHARGE_ID}`);
        expect(payload.client.email).toBe('vecino@example.com');
        expect(rpcCalls.map(call => call.fn)).toEqual(['parking_charge_register_checkout']);
        expect(result.checkoutUrl).toBe('https://pay.example/abc');
        expect(result.provider).toBe('haulmer');
    });

    it('es idempotente: si ya hay link, lo devuelve sin pedir otro', async () => {
        const { db, rpcCalls } = fakeDb({ ...haulmerPending, payment_url: 'https://pay.example/ya' });
        const result = await processParkingCharge(db, BOOKING_ID, {
            haulmer: createHaulmerParkingProvider(HAULMER_ON),
        });
        expect(result.checkoutUrl).toBe('https://pay.example/ya');
        expect(mocks.createPaymentLink).not.toHaveBeenCalled();
        expect(rpcCalls).toEqual([]);
    });

    it('si Haulmer falla, el cobro no se pierde: va a gastos comunes', async () => {
        mocks.createPaymentLink.mockRejectedValue(new Error('403 sin permisos de API'));
        const { db, rpcCalls } = fakeDb(haulmerPending);
        const result = await processParkingCharge(db, BOOKING_ID, {
            haulmer: createHaulmerParkingProvider(HAULMER_ON),
        });
        expect(rpcCalls.map(call => call.fn)).toEqual(['parking_charge_fallback_to_unit']);
        expect(result.fallbackReason).toMatch(/403 sin permisos/);
        expect(result.charge?.status).toBe('charged');
    });

    it('sin cobro (migración no aplicada) devuelve null sin romper la reserva', async () => {
        const { db } = fakeDb(null);
        const result = await processParkingCharge(db, BOOKING_ID);
        expect(result).toEqual({ charge: null, provider: null, checkoutUrl: null });
    });

    it('el proveedor de gastos comunes propaga el error de la base', async () => {
        const provider = createCommonExpensesProvider(async () => ({ data: null, error: { message: 'boom' } }));
        await expect(provider.createCharge({
            chargeId: CHARGE_ID, bookingId: BOOKING_ID, communityId: 'c', amount: 1,
            description: '', payer: { name: '', email: null }, returnUrl: '',
        })).rejects.toThrow('boom');
    });
});

describe('regla de cancelación y textos', () => {
    it('sin costo hasta 2 h antes del inicio, por defecto', () => {
        const startsAt = '2026-10-20T15:00:00.000Z';
        expect(freeCancellationDeadline(startsAt).toISOString()).toBe('2026-10-20T13:00:00.000Z');
        expect(isFreeCancellation(startsAt, 2, new Date('2026-10-20T12:59:00.000Z'))).toBe(true);
        expect(isFreeCancellation(startsAt, 2, new Date('2026-10-20T13:00:00.000Z'))).toBe(true);
        expect(isFreeCancellation(startsAt, 2, new Date('2026-10-20T13:01:00.000Z'))).toBe(false);
        expect(isFreeCancellation(startsAt, 24, new Date('2026-10-20T12:00:00.000Z'))).toBe(false);
    });

    it('describe el cobro en lenguaje del residente', () => {
        expect(describeParkingCharge({ status: 'charged', method: 'common_expenses', unitLabel: 'A-202', needsReview: false }))
            .toBe('Cargado a la cuenta de gastos comunes · Unidad A-202');
        expect(describeParkingCharge({ status: 'voided', method: 'common_expenses', needsReview: false })).toBe('Anulado sin costo');
        expect(describeParkingCharge({ status: 'pending', method: 'haulmer', needsReview: false })).toBe('Pendiente de pago vía Haulmer');
    });
});
