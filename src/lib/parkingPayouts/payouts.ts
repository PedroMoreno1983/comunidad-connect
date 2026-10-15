/**
 * Reglas puras de la liquidación al dueño de un arriendo de estacionamiento.
 *
 * El cálculo y las reglas de destino viven en la base (parking_payout_split y
 * parking_payout_open, migración 20261015060000). Este módulo es su espejo para
 * la interfaz y los tests: si cambias una regla aquí, cámbiala allá.
 */

import type {
    ParkingBankAccountType,
    ParkingOwnerPayoutSettings,
    ParkingOwnerPayoutSettingsInput,
    ParkingPayout,
    ParkingPayoutDestination,
    ParkingPayoutDestinationSource,
    ParkingPayoutStatus,
    ParkingPayoutTotals,
} from './types';

export const PARKING_PAYOUT_DESTINATIONS: ParkingPayoutDestination[] = [
    'bank_transfer',
    'common_expenses_credit',
    'reserve_fund_donation',
];

export const PARKING_PAYOUT_DESTINATION_LABELS: Record<ParkingPayoutDestination, string> = {
    bank_transfer: 'Transferencia a mi cuenta bancaria',
    common_expenses_credit: 'Abono a mis gastos comunes',
    reserve_fund_donation: 'Donación al fondo de reserva',
};

export const PARKING_PAYOUT_DESTINATION_SHORT: Record<ParkingPayoutDestination, string> = {
    bank_transfer: 'Transferencia',
    common_expenses_credit: 'Abono a gastos comunes',
    reserve_fund_donation: 'Fondo de reserva',
};

export const PARKING_PAYOUT_DESTINATION_HELP: Record<ParkingPayoutDestination, string> = {
    bank_transfer: 'La administración te transfiere lo recaudado y lo registra aquí con la fecha.',
    common_expenses_credit: 'Se abona a la cuenta de tu unidad y rebaja lo que te toque pagar.',
    reserve_fund_donation: 'Lo recaudado se suma al fondo de reserva de la comunidad.',
};

export const PARKING_PAYOUT_STATUS_LABELS: Record<ParkingPayoutStatus, string> = {
    pending: 'Por liquidar',
    on_hold: 'En pausa',
    paid: 'Transferida',
    credited: 'Abonada a gastos comunes',
    donated: 'Donada al fondo de reserva',
    retained: 'Comisión completa de la comunidad',
    cancelled: 'Anulada',
};

export const PARKING_PAYOUT_STATUS_TONES: Record<ParkingPayoutStatus, 'neutral' | 'sage' | 'amber' | 'rose' | 'copper'> = {
    pending: 'amber',
    on_hold: 'amber',
    paid: 'sage',
    credited: 'sage',
    donated: 'sage',
    retained: 'neutral',
    cancelled: 'neutral',
};

export const PARKING_BANK_ACCOUNT_TYPE_LABELS: Record<ParkingBankAccountType, string> = {
    corriente: 'Cuenta corriente',
    vista: 'Cuenta vista / CuentaRUT',
    ahorro: 'Cuenta de ahorro',
};

/** Bancos más comunes en Chile, para el selector (se acepta otro nombre). */
export const CHILEAN_BANKS = [
    'Banco de Chile',
    'BancoEstado',
    'Banco Santander',
    'Banco BCI',
    'Scotiabank',
    'Banco Itaú',
    'Banco Security',
    'Banco BICE',
    'Banco Falabella',
    'Banco Ripley',
    'Banco Consorcio',
    'Banco Internacional',
    'Coopeuch',
    'Tenpo',
    'Mercado Pago',
    'Mach',
] as const;

export const PARKING_PAYOUT_CREDIT_REFERENCE_PREFIX = 'parking_payout:';

/**
 * Un pago de unidad que en realidad es el abono de una liquidación. No es
 * dinero que entra al banco: la cartola lo cuenta como abono, pero recaudación
 * y flujo de caja no.
 */
export function isParkingPayoutCredit(reference: string | null | undefined): boolean {
    return String(reference || '').startsWith(PARKING_PAYOUT_CREDIT_REFERENCE_PREFIX);
}

/** Tasa en centésimas de punto (12,35 % → 1235), acotada a 0–100 %. */
function percentToBasisPoints(percent: number): number {
    const value = Number.isFinite(percent) ? percent : 0;
    const bounded = Math.min(100, Math.max(0, value));
    return Math.round(bounded * 100);
}

/**
 * Comisión de la comunidad y neto del dueño, en pesos enteros.
 *
 * Redondeo explícito: la comisión se redondea al peso más cercano con la mitad
 * hacia arriba ($2.500 al 1 % = $25; $50 al 1 % = $0,5 → $1), calculada con
 * enteros para no arrastrar errores de punto flotante. El neto es bruto menos
 * comisión, así que bruto = comisión + neto siempre, exacto.
 */
export function splitParkingPayout(grossAmount: number, commissionPercent: number): {
    gross: number;
    commission: number;
    net: number;
} {
    if (!Number.isSafeInteger(grossAmount) || grossAmount < 0) {
        throw new Error('El monto bruto debe ser un entero de pesos mayor o igual a cero.');
    }
    const basisPoints = percentToBasisPoints(commissionPercent);
    const commission = Math.floor((grossAmount * basisPoints + 5000) / 10000);
    return { gross: grossAmount, commission, net: grossAmount - commission };
}

/** Valida la comisión que fija la administración: 0 a 100, hasta 2 decimales. */
export function validateCommissionPercent(value: number): string | null {
    if (!Number.isFinite(value)) return 'Ingresa un porcentaje.';
    if (value < 0 || value > 100) return 'La comisión va de 0 % a 100 %.';
    if (Math.abs(Math.round(value * 100) - value * 100) > 1e-6) return 'Usa como máximo 2 decimales.';
    return null;
}

/** Deja el RUT como 12345678-5 (sin puntos, DV en mayúscula). */
export function normalizeRut(value: string | null | undefined): string | null {
    const clean = String(value || '').replace(/[^0-9kK]/g, '').toUpperCase();
    if (!clean) return null;
    if (clean.length < 2) return clean;
    return `${clean.slice(0, -1)}-${clean.slice(-1)}`;
}

/** RUT chileno válido (módulo 11), con cuerpo de 7 u 8 dígitos. */
export function isValidRut(value: string | null | undefined): boolean {
    const rut = normalizeRut(value);
    if (!rut || !/^[0-9]{7,8}-[0-9K]$/.test(rut)) return false;
    const [body, dv] = rut.split('-');
    let sum = 0;
    let multiplier = 2;
    for (let i = body.length - 1; i >= 0; i -= 1) {
        sum += Number(body[i]) * multiplier;
        multiplier = multiplier === 7 ? 2 : multiplier + 1;
    }
    const rest = 11 - (sum % 11);
    const expected = rest === 11 ? '0' : rest === 10 ? 'K' : String(rest);
    return expected === dv;
}

export function isBankDataComplete(settings: Partial<ParkingOwnerPayoutSettings> | null | undefined): boolean {
    if (!settings) return false;
    return Boolean(
        settings.bankName?.trim()
        && settings.bankAccountType
        && settings.bankAccountNumber?.trim()
        && settings.holderRut?.trim()
        && settings.holderName?.trim(),
    );
}

/**
 * Destino que se usará en la próxima liquidación: la elección del dueño; si no
 * eligió, transferencia con datos bancarios completos y, si no, abono a gastos
 * comunes. Espejo de parking_payout_open.
 */
export function effectivePayoutDestination(settings: ParkingOwnerPayoutSettings | null | undefined): {
    destination: ParkingPayoutDestination;
    source: ParkingPayoutDestinationSource;
} {
    if (settings?.destination) return { destination: settings.destination, source: 'owner_choice' };
    if (isBankDataComplete(settings)) return { destination: 'bank_transfer', source: 'default_bank' };
    return { destination: 'common_expenses_credit', source: 'default_credit' };
}

/** Errores de la preferencia antes de mandarla a la base (que valida lo mismo). */
export function validatePayoutSettingsInput(input: ParkingOwnerPayoutSettingsInput): string[] {
    const errors: string[] = [];
    if (input.destination && !PARKING_PAYOUT_DESTINATIONS.includes(input.destination)) {
        errors.push('Elige un destino válido.');
    }
    const number = (input.bankAccountNumber || '').replace(/[\s.]/g, '');
    if (number && !/^[0-9][0-9-]{3,24}$/.test(number)) {
        errors.push('El número de cuenta solo lleva dígitos (y guiones).');
    }
    if (input.holderRut && !isValidRut(input.holderRut)) {
        errors.push('El RUT del titular no es válido.');
    }
    if (input.holderName && input.holderName.trim().length < 3) {
        errors.push('Escribe el nombre del titular.');
    }
    if (input.destination === 'bank_transfer' && !isBankDataComplete(input)) {
        errors.push('Para recibir transferencias completa banco, tipo y número de cuenta, RUT y titular.');
    }
    return errors;
}

const DELIVERED: ParkingPayoutStatus[] = ['paid', 'credited', 'donated'];

export function summarizeParkingPayouts(payouts: Pick<ParkingPayout, 'grossAmount' | 'commissionAmount' | 'netAmount' | 'status' | 'needsReview'>[]): ParkingPayoutTotals {
    const totals: ParkingPayoutTotals = {
        gross: 0, commission: 0, net: 0, delivered: 0, pending: 0,
        transferred: 0, credited: 0, donated: 0, reviewCount: 0,
    };
    for (const payout of payouts) {
        if (payout.needsReview) totals.reviewCount += 1;
        if (payout.status === 'cancelled') continue;
        totals.gross += payout.grossAmount;
        totals.commission += payout.commissionAmount;
        totals.net += payout.netAmount;
        if (DELIVERED.includes(payout.status)) totals.delivered += payout.netAmount;
        if (payout.status === 'pending' || payout.status === 'on_hold') totals.pending += payout.netAmount;
        if (payout.status === 'paid') totals.transferred += payout.netAmount;
        if (payout.status === 'credited') totals.credited += payout.netAmount;
        if (payout.status === 'donated') totals.donated += payout.netAmount;
    }
    return totals;
}

/** Explicación en una línea del estado de una liquidación, para el dueño. */
export function describeParkingPayout(payout: Pick<ParkingPayout, 'status' | 'destination' | 'paidOn' | 'needsReview'>): string {
    switch (payout.status) {
        case 'pending':
            if (payout.destination === 'bank_transfer') return 'La administración hará la transferencia.';
            return payout.needsReview
                ? 'La administración está revisando cómo completarla.'
                : 'Se completa en cuanto quede registrada.';
        case 'on_hold':
            return 'En pausa mientras se aclara el pago del arriendo.';
        case 'paid':
            return payout.paidOn ? `Transferida el ${formatDateEsCl(payout.paidOn)}.` : 'Transferida.';
        case 'credited':
            return 'Ya rebaja tu cuenta de gastos comunes.';
        case 'donated':
            return 'Sumada al fondo de reserva. ¡Gracias!';
        case 'retained':
            return 'La comisión de la comunidad cubre el total de este arriendo.';
        case 'cancelled':
            return 'El arriendo se anuló, así que no hay nada que liquidar.';
        default:
            return '';
    }
}

/** AAAA-MM-DD → DD-MM-AAAA, sin pasar por zonas horarias. */
export function formatDateEsCl(isoDate: string): string {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
    return match ? `${match[3]}-${match[2]}-${match[1]}` : isoDate;
}

/** Hoy en Chile como AAAA-MM-DD (para la fecha por defecto de una transferencia). */
export function todayInChile(now: Date = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(now);
}

/** Últimos 4 dígitos de una cuenta, para mostrarla sin exponerla entera. */
export function maskAccountNumber(value: string | null | undefined): string {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '—';
    return `•••• ${digits.slice(-4)}`;
}
