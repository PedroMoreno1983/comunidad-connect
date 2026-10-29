import type {
    ParkingChargeProviderInput,
    ParkingChargeProviderOutcome,
    ParkingChargeStatus,
    PaymentProvider,
} from '@/lib/types';
import { HaulmerService } from '@/lib/services/haulmer';
import { isHaulmerConfigured } from './providerEnv';

type Environment = Record<string, string | undefined>;

/** Llamada a una RPC de Supabase con la service role (inyectada para poder probarla). */
export type ServiceRpc = (
    fn: string,
    args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;

/**
 * Interruptor de Haulmer para arriendos de estacionamiento.
 *
 * Activo cuando están cargadas las credenciales de Haulmer (HAULMER_ACCOUNT_ID y
 * HAULMER_SECRET_KEY), salvo que se apague explícitamente con
 * PARKING_HAULMER_ENABLED=false.
 */
export function parkingHaulmerUnavailableReason(environment: Environment = process.env): string | null {
    if (environment.PARKING_HAULMER_ENABLED?.trim().toLowerCase() === 'false') {
        return 'PARKING_HAULMER_ENABLED está desactivado en el servidor';
    }
    if (!isHaulmerConfigured(environment)) {
        return 'Faltan HAULMER_ACCOUNT_ID o HAULMER_SECRET_KEY';
    }
    return null;
}

/** Referencia que viaja a Haulmer y vuelve en el webhook (ver /api/webhooks/haulmer). */
export function parkingChargeReference(chargeId: string): string {
    return `PARKING_${chargeId}`;
}

/**
 * Método por defecto y respaldo: el cobro entra como cargo en la cuenta de
 * gastos comunes de la unidad. Lo hace la base (parking_charge_fallback_to_unit),
 * que es idempotente: llamarla dos veces no carga dos veces.
 */
export function createCommonExpensesProvider(rpc: ServiceRpc): PaymentProvider {
    return {
        id: 'common_expenses',
        unavailableReason: () => null,
        async createCharge(input: ParkingChargeProviderInput): Promise<ParkingChargeProviderOutcome> {
            const { data, error } = await rpc('parking_charge_fallback_to_unit', {
                p_charge_id: input.chargeId,
                p_reason: input.note || 'Cobro a gastos comunes',
            });
            if (error) throw new Error(error.message || 'No se pudo cargar el cobro a gastos comunes.');
            return { kind: 'posted_to_unit', status: String(data) as ParkingChargeStatus };
        },
        async refund() {
            // Revertir un cargo pendiente lo hace la base al anular (unit_charges ->
            // 'cancelled'). Devolver plata ya pagada es una transferencia que hace
            // la administración y registra con admin_mark_parking_charge_refunded.
            return { refunded: false, reason: 'El reembolso de un cargo ya pagado lo registra la administración.' };
        },
    };
}

/**
 * Adaptador de Haulmer/Tuu.
 *
 * Cobrar usa la integración de Payment Intent que ya existe en el repo
 * (HaulmerService.createPaymentLink, docs: https://developers.tuu.cl/docs/payment-intent),
 * con la referencia PARKING_<id> que el webhook reconoce.
 *
 * TODO(haulmer): reembolsos. La documentación pública de Payment Intent no
 * describe un endpoint de reembolso y la cuenta todavía no tiene permisos de
 * API, así que no se implementa a ciegas. Cuando Haulmer habilite la API y
 * entregue la especificación, implementar refund() aquí. Mientras tanto el
 * reembolso es manual y se registra con admin_mark_parking_charge_refunded.
 */
export function createHaulmerParkingProvider(environment: Environment = process.env): PaymentProvider {
    return {
        id: 'haulmer',
        unavailableReason: () => parkingHaulmerUnavailableReason(environment),
        async createCharge(input: ParkingChargeProviderInput): Promise<ParkingChargeProviderOutcome> {
            const reason = parkingHaulmerUnavailableReason(environment);
            if (reason) throw new Error(reason);
            if (!input.payer.email) throw new Error('El conductor no tiene correo para el pago en línea');

            const link = await HaulmerService.createPaymentLink({
                amount: input.amount,
                description: input.description,
                reference: parkingChargeReference(input.chargeId),
                client: {
                    name: input.payer.name,
                    email: input.payer.email,
                    phone: input.payer.phone || undefined,
                },
                returnUrl: input.returnUrl,
            });
            return { kind: 'checkout', checkoutUrl: link.url, providerReference: link.token || link.reference };
        },
        async refund() {
            return { refunded: false, reason: 'Reembolsos por API de Haulmer pendientes de habilitación (TODO).' };
        },
    };
}
