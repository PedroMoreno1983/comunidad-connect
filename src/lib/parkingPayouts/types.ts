/**
 * Tipos de la liquidación al dueño de los arriendos de estacionamiento
 * (migración 20261015060000_parking_owner_payouts.sql). Viven aquí y no en
 * `src/lib/types.ts`, que ya no se puede publicar por la API de GitHub.
 */

/** A dónde va lo recaudado por el arriendo (CHECK de parking_payouts.destination). */
export type ParkingPayoutDestination = 'bank_transfer' | 'common_expenses_credit' | 'reserve_fund_donation';

/** Por qué una liquidación tiene ese destino. */
export type ParkingPayoutDestinationSource = 'owner_choice' | 'default_bank' | 'default_credit';

/** Estados de una liquidación (CHECK de parking_payouts.status). */
export type ParkingPayoutStatus =
    | 'pending'
    | 'on_hold'
    | 'paid'
    | 'credited'
    | 'donated'
    | 'retained'
    | 'cancelled';

export type ParkingBankAccountType = 'corriente' | 'vista' | 'ahorro';

/** Preferencia del dueño. `destination: null` = destino automático. */
export interface ParkingOwnerPayoutSettings {
    destination: ParkingPayoutDestination | null;
    creditUnitId: string | null;
    bankName: string | null;
    bankAccountType: ParkingBankAccountType | null;
    bankAccountNumber: string | null;
    holderRut: string | null;
    holderName: string | null;
    updatedAt?: string;
}

export type ParkingOwnerPayoutSettingsInput = Omit<ParkingOwnerPayoutSettings, 'updatedAt'>;

export interface ParkingPayoutBankSnapshot {
    bankName: string | null;
    accountType: ParkingBankAccountType | null;
    accountNumber: string | null;
    holderRut: string | null;
    holderName: string | null;
}

export interface ParkingPayout {
    id: string;
    communityId: string;
    chargeId: string;
    bookingId: string;
    ownerId: string;
    ownerName?: string;
    spotLabel?: string;
    grossAmount: number;
    commissionAmount: number;
    commissionPercent: number | null;
    commissionSource: 'booking' | 'community_rate';
    netAmount: number;
    destination: ParkingPayoutDestination;
    destinationSource: ParkingPayoutDestinationSource;
    bankSnapshot: ParkingPayoutBankSnapshot | null;
    creditUnitId: string | null;
    status: ParkingPayoutStatus;
    needsReview: boolean;
    reviewReason?: string;
    paidOn?: string;
    paymentReference?: string;
    paymentNote?: string;
    settledAt?: string;
    cancelledAt?: string;
    createdAt: string;
}

/** Totales del dueño (o de la comunidad) a partir de sus liquidaciones. */
export interface ParkingPayoutTotals {
    gross: number;
    commission: number;
    net: number;
    /** Neto ya entregado: transferido, abonado o donado. */
    delivered: number;
    /** Neto por entregar: pendiente o suspendido. */
    pending: number;
    transferred: number;
    credited: number;
    donated: number;
    reviewCount: number;
}

/** Unidad a la que el dueño puede pedir que se abone. */
export interface ParkingOwnerUnitOption {
    id: string;
    label: string;
}
