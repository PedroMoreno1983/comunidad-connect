import type { ParkingChargeProcessResult, PaymentProvider } from '@/lib/types';
import { getPublicUrl } from '@/lib/config';
import { mapParkingChargeRow, PARKING_CHARGE_COLUMNS } from '@/lib/parking';
import {
    createCommonExpensesProvider,
    createHaulmerParkingProvider,
    type ServiceRpc,
} from './paymentProvider';

/** Lo mínimo del cliente Supabase (service role) que usa este módulo. */
export interface ParkingChargesDb {
    from: (table: string) => {
        select: (columns: string) => {
            eq: (column: string, value: string) => {
                maybeSingle: () => PromiseLike<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
            };
        };
    };
    rpc: ServiceRpc;
}

async function readCharge(db: ParkingChargesDb, bookingId: string): Promise<Record<string, unknown> | null> {
    const { data, error } = await db.from('parking_charges').select(PARKING_CHARGE_COLUMNS).eq('booking_id', bookingId).maybeSingle();
    if (error) throw new Error(error.message || 'No se pudo leer el cobro.');
    return data;
}

async function readPayer(db: ParkingChargesDb, driverId: string) {
    const { data: driver } = await db.from('parking_drivers').select('full_name,phone,user_id').eq('id', driverId).maybeSingle();
    let email: string | null = null;
    if (driver?.user_id) {
        const { data: profile } = await db.from('profiles').select('email').eq('id', String(driver.user_id)).maybeSingle();
        email = profile?.email ? String(profile.email) : null;
    }
    return {
        name: String(driver?.full_name || 'Conductor'),
        phone: driver?.phone ? String(driver.phone) : null,
        email,
    };
}

export interface ProcessParkingChargeOptions {
    /** Proveedores inyectables para tests; por defecto, Haulmer y gastos comunes reales. */
    haulmer?: PaymentProvider;
    commonExpenses?: PaymentProvider;
    returnUrl?: string;
}

/**
 * Deja resuelto el cobro de una reserva recién creada.
 *
 * La base ya abrió el cobro (y, con el método por defecto, ya lo cargó a gastos
 * comunes) en el mismo INSERT de la reserva. Aquí solo queda trabajo cuando la
 * comunidad eligió Haulmer: generar el link de pago o, si Haulmer no está
 * habilitado o falla, caer a gastos comunes. Es idempotente: llamarlo dos veces
 * no crea dos links ni dos cargos.
 *
 * El monto sale siempre del libro (parking_charges.amount); esta función no
 * recibe montos.
 */
export async function processParkingCharge(
    db: ParkingChargesDb,
    bookingId: string,
    options: ProcessParkingChargeOptions = {},
): Promise<ParkingChargeProcessResult> {
    const row = await readCharge(db, bookingId);
    if (!row) return { charge: null, provider: null, checkoutUrl: null };

    const charge = mapParkingChargeRow(row);
    if (charge.status !== 'pending' || charge.method !== 'haulmer') {
        return { charge, provider: charge.method, checkoutUrl: null };
    }
    if (charge.checkoutUrl) {
        return { charge, provider: 'haulmer', checkoutUrl: charge.checkoutUrl };
    }

    const haulmer = options.haulmer ?? createHaulmerParkingProvider();
    const commonExpenses = options.commonExpenses ?? createCommonExpensesProvider(db.rpc);

    let fallbackReason = haulmer.unavailableReason();
    if (!fallbackReason) {
        try {
            const payer = await readPayer(db, String(row.driver_id));
            const outcome = await haulmer.createCharge({
                chargeId: charge.id,
                bookingId: charge.bookingId,
                communityId: charge.communityId,
                amount: charge.amount,
                description: 'Arriendo de estacionamiento',
                payer,
                returnUrl: options.returnUrl ?? getPublicUrl('/estacionamientos?tab=bookings'),
            });
            if (outcome.kind === 'checkout') {
                const { error } = await db.rpc('parking_charge_register_checkout', {
                    p_charge_id: charge.id,
                    p_provider_reference: outcome.providerReference,
                    p_payment_url: outcome.checkoutUrl,
                });
                if (error) throw new Error(error.message || 'No se pudo registrar el link de pago.');
                const updated = await readCharge(db, bookingId);
                return {
                    charge: updated ? mapParkingChargeRow(updated) : charge,
                    provider: 'haulmer',
                    checkoutUrl: outcome.checkoutUrl,
                };
            }
        } catch (error) {
            fallbackReason = `Haulmer no pudo generar el cobro: ${error instanceof Error ? error.message : String(error)}`;
        }
    }

    const reason = fallbackReason ?? 'Haulmer no disponible';
    await commonExpenses.createCharge({
        chargeId: charge.id,
        bookingId: charge.bookingId,
        communityId: charge.communityId,
        amount: charge.amount,
        description: 'Arriendo de estacionamiento',
        payer: { name: '', email: null },
        returnUrl: '',
        note: reason,
    });
    const updated = await readCharge(db, bookingId);
    const finalCharge = updated ? mapParkingChargeRow(updated) : charge;
    return { charge: finalCharge, provider: finalCharge.method, checkoutUrl: null, fallbackReason: reason };
}
