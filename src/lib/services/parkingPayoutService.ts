import { supabase } from '@/lib/supabase';
import type {
    ParkingBankAccountType,
    ParkingOwnerPayoutSettings,
    ParkingOwnerPayoutSettingsInput,
    ParkingOwnerUnitOption,
    ParkingPayout,
    ParkingPayoutBankSnapshot,
    ParkingPayoutDestination,
    ParkingPayoutDestinationSource,
    ParkingPayoutStatus,
} from '@/lib/parkingPayouts/types';

/**
 * Cliente de la liquidación al dueño de los arriendos de estacionamiento.
 * Módulo aparte de `src/lib/api.ts` (ese archivo supera el tamaño publicable);
 * mismo patrón de Service. Lee con RLS (el dueño ve lo suyo, la administración
 * lo de su comunidad) y escribe solo por RPCs que validan rol y comunidad.
 */

type Row = Record<string, unknown>;

const PAYOUT_COLUMNS =
    'id,community_id,charge_id,booking_id,owner_id,gross_amount,commission_percent,commission_source,' +
    'commission_amount,net_amount,destination,destination_source,bank_snapshot,credit_unit_id,status,' +
    'needs_review,review_reason,paid_on,payment_reference,payment_note,settled_at,cancelled_at,created_at';

const SETTINGS_COLUMNS =
    'destination,credit_unit_id,bank_name,bank_account_type,bank_account_number,holder_rut,holder_name,updated_at';

const text = (value: unknown) => (value === null || value === undefined || value === '' ? undefined : String(value));
const nullable = (value: unknown) => text(value) ?? null;
const one = (value: unknown) => (Array.isArray(value) ? value[0] : value) as Row | undefined;

function mapSettings(row: Row | null | undefined): ParkingOwnerPayoutSettings | null {
    if (!row) return null;
    return {
        destination: (nullable(row.destination) as ParkingPayoutDestination | null),
        creditUnitId: nullable(row.credit_unit_id),
        bankName: nullable(row.bank_name),
        bankAccountType: (nullable(row.bank_account_type) as ParkingBankAccountType | null),
        bankAccountNumber: nullable(row.bank_account_number),
        holderRut: nullable(row.holder_rut),
        holderName: nullable(row.holder_name),
        updatedAt: text(row.updated_at),
    };
}

function mapSnapshot(value: unknown): ParkingPayoutBankSnapshot | null {
    if (!value || typeof value !== 'object') return null;
    const row = value as Row;
    return {
        bankName: nullable(row.bank_name),
        accountType: (nullable(row.account_type) as ParkingBankAccountType | null),
        accountNumber: nullable(row.account_number),
        holderRut: nullable(row.holder_rut),
        holderName: nullable(row.holder_name),
    };
}

export function mapParkingPayoutRow(row: Row): ParkingPayout {
    const spot = one(row.parking_spots);
    const owner = one(row.profiles);
    return {
        id: String(row.id),
        communityId: String(row.community_id),
        chargeId: String(row.charge_id),
        bookingId: String(row.booking_id),
        ownerId: String(row.owner_id),
        ownerName: text(owner?.name),
        spotLabel: text(spot?.label),
        grossAmount: Math.round(Number(row.gross_amount) || 0),
        commissionAmount: Math.round(Number(row.commission_amount) || 0),
        commissionPercent: row.commission_percent === null || row.commission_percent === undefined
            ? null : Number(row.commission_percent),
        commissionSource: row.commission_source === 'community_rate' ? 'community_rate' : 'booking',
        netAmount: Math.round(Number(row.net_amount) || 0),
        destination: String(row.destination) as ParkingPayoutDestination,
        destinationSource: String(row.destination_source) as ParkingPayoutDestinationSource,
        bankSnapshot: mapSnapshot(row.bank_snapshot),
        creditUnitId: nullable(row.credit_unit_id),
        status: String(row.status) as ParkingPayoutStatus,
        needsReview: Boolean(row.needs_review),
        reviewReason: text(row.review_reason),
        paidOn: text(row.paid_on),
        paymentReference: text(row.payment_reference),
        paymentNote: text(row.payment_note),
        settledAt: text(row.settled_at),
        cancelledAt: text(row.cancelled_at),
        createdAt: String(row.created_at ?? ''),
    };
}

async function myUserId(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    if (!data?.user) throw new Error('Debes iniciar sesión.');
    return data.user.id;
}

async function rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw new Error(error.message || 'No se pudo completar la acción.');
    return data as T;
}

/**
 * El abono lo hace la base; el estado de los cobros de la unidad abonada lo
 * recalcula el servidor. Si falla, el saldo de la cartola ya es correcto y el
 * estado se recalcula en el próximo pago de esa comunidad.
 */
async function reconcileCreditedUnits(): Promise<void> {
    try {
        await fetch('/api/parking/payouts/reconcile', { method: 'POST', cache: 'no-store' });
    } catch {
        // Sin red: no bloquea la acción que ya se registró.
    }
}

export const ParkingPayoutService = {
    /* — Dueño — */

    async getMySettings(): Promise<ParkingOwnerPayoutSettings | null> {
        const userId = await myUserId();
        const { data, error } = await supabase
            .from('parking_owner_payout_settings')
            .select(SETTINGS_COLUMNS)
            .eq('profile_id', userId)
            .maybeSingle();
        if (error) throw error;
        return mapSettings(data as Row | null);
    },

    async saveMySettings(input: ParkingOwnerPayoutSettingsInput): Promise<ParkingOwnerPayoutSettings | null> {
        const row = await rpc<Row>('parking_set_my_payout_settings', {
            p_destination: input.destination,
            p_bank_name: input.bankName,
            p_bank_account_type: input.bankAccountType,
            p_bank_account_number: input.bankAccountNumber,
            p_holder_rut: input.holderRut,
            p_holder_name: input.holderName,
            p_credit_unit_id: input.creditUnitId,
        });
        return mapSettings(row);
    },

    async getMyPayouts(): Promise<ParkingPayout[]> {
        const userId = await myUserId();
        const { data, error } = await supabase
            .from('parking_payouts')
            .select(`${PAYOUT_COLUMNS},parking_spots(label)`)
            .eq('owner_id', userId)
            .order('created_at', { ascending: false })
            .limit(200);
        if (error) throw error;
        return ((data || []) as Row[]).map(mapParkingPayoutRow);
    },

    /** Unidades a nombre del dueño, para elegir dónde abonar. */
    async getMyUnits(): Promise<ParkingOwnerUnitOption[]> {
        const userId = await myUserId();
        const { data, error } = await supabase
            .from('units')
            .select('id,number,tower')
            .eq('owner_id', userId)
            .order('number');
        if (error) return [];
        return ((data || []) as Row[]).map(row => ({
            id: String(row.id),
            label: [row.tower, row.number].filter(Boolean).join('-') || String(row.number ?? ''),
        }));
    },

    /* — Administración — */

    /** Todas las liquidaciones de la comunidad, por páginas (los totales y la cola no se cortan). */
    async getCommunityPayouts(communityId: string): Promise<ParkingPayout[]> {
        const pageSize = 500;
        const rows: Row[] = [];
        for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
                .from('parking_payouts')
                .select(`${PAYOUT_COLUMNS},parking_spots(label),profiles!parking_payouts_owner_id_fkey(name)`)
                .eq('community_id', communityId)
                .order('created_at', { ascending: false })
                .order('id', { ascending: true })
                .range(from, from + pageSize - 1);
            if (error) throw error;
            rows.push(...((data || []) as Row[]));
            if ((data?.length ?? 0) < pageSize) break;
        }
        return rows.map(mapParkingPayoutRow);
    },

    async adminMarkPaid(payoutId: string, paidOn: string, reference: string, note: string): Promise<void> {
        await rpc('admin_mark_parking_payout_paid', {
            p_payout_id: payoutId, p_paid_on: paidOn, p_reference: reference || null, p_note: note || null,
        });
    },

    async adminRetry(payoutId: string): Promise<ParkingPayoutStatus> {
        const status = await rpc<ParkingPayoutStatus>('admin_retry_parking_payout', { p_payout_id: payoutId });
        if (status === 'credited') await reconcileCreditedUnits();
        return status;
    },

    async adminCancel(payoutId: string, note: string): Promise<void> {
        await rpc('admin_cancel_parking_payout', { p_payout_id: payoutId, p_note: note });
    },

    async adminResolveReview(payoutId: string, note: string): Promise<void> {
        await rpc('admin_resolve_parking_payout_review', { p_payout_id: payoutId, p_note: note });
    },

    async adminSync(): Promise<number> {
        const created = await rpc<number>('admin_sync_parking_payouts', {});
        await reconcileCreditedUnits();
        return created;
    },

    async adminSetCommissionPercent(percent: number): Promise<number> {
        return Number(await rpc<number>('admin_set_parking_commission_percent', { p_percent: percent }));
    },
};
