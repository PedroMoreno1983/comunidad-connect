/**
 * Estado de cuenta de una unidad: cargos, pagos y saldo que arrastra.
 *
 * Un `status` paid/pending en la cuota del mes no alcanza para administrar de
 * verdad: no dice cuánto se abonó si el pago fue parcial, ni arrastra la deuda
 * de meses anteriores. Acá el saldo se construye como un libro de movimientos
 * ordenado en el tiempo, que es como lo lee un comité y como lo exige un
 * certificado de deuda.
 *
 * Convención de signo: el saldo es lo que la unidad DEBE. Un cargo lo sube, un
 * pago lo baja. Saldo negativo = la unidad pagó de más (saldo a favor).
 */

import type { FinancePaymentTarget } from '@/lib/types';
import { allocateUnitPayments } from './paymentAllocation';

export type LedgerEntryKind = 'gasto_comun' | 'fine' | 'interest' | 'extraordinary' | 'service' | 'other' | 'payment';

export interface LedgerCharge {
    id: string;
    kind: Exclude<LedgerEntryKind, 'payment'>;
    label: string;
    amount: number;
    /** Periodo al que se imputa (AAAA-MM). */
    month: string;
    /** Fecha de vencimiento; se usa para ordenar y para detectar mora. */
    dueDate: string | null;
    createdAt: string;
    settledAmount?: number;
}

export interface LedgerPayment extends FinancePaymentTarget {
    id: string;
    amount: number;
    paidAt: string;
    method: string;
    reference: string | null;
    createdAt: string;
}

export interface LedgerEntry {
    id: string;
    date: string;
    kind: LedgerEntryKind;
    label: string;
    /** Positivo = cargo (sube la deuda). Negativo = pago (la baja). */
    amount: number;
    balance: number;
    month: string | null;
    reference: string | null;
}

export interface AccountStatement {
    entries: LedgerEntry[];
    totalCharged: number;
    totalPaid: number;
    historicalSettled: number;
    /** Lo que la unidad debe hoy. Negativo = saldo a favor. */
    balance: number;
    /** Deuda cuyo vencimiento ya pasó, a la fecha de corte. */
    overdueAmount: number;
    oldestOverdueMonth: string | null;
}

/**
 * Fecha usada para ordenar un movimiento en la cartola. Para un cargo se
 * prefiere el vencimiento (es la fecha que el residente reconoce como "cuándo
 * me tocaba pagar"); si no tiene, se cae a la fecha de creación.
 */
function chargeDate(charge: LedgerCharge): string {
    return charge.dueDate || charge.createdAt.slice(0, 10);
}

export function buildAccountStatement(
    charges: LedgerCharge[],
    payments: LedgerPayment[],
    asOf: string = new Date().toISOString().slice(0, 10),
): AccountStatement {
    const chargeEntries = charges.map(charge => ({
        id: charge.id,
        date: chargeDate(charge),
        kind: charge.kind as LedgerEntryKind,
        label: charge.label,
        amount: Math.round(charge.amount),
        month: charge.month,
        reference: null as string | null,
        // Desempate estable: ante misma fecha, el cargo va antes que el pago,
        // porque no se puede pagar algo que todavía no se cobró.
        sortHint: 0,
    }));

    const chargeById = new Map(charges.map(charge => [charge.id, charge]));
    const paymentEntries = payments.map(payment => {
        const target = chargeById.get(payment.expenseId || payment.chargeId || '');
        return ({
        id: payment.id,
        date: payment.paidAt,
        kind: 'payment' as LedgerEntryKind,
        label: target ? `Pago recibido · ${target.label}` : 'Pago recibido',
        amount: -Math.round(payment.amount),
        month: target?.month ?? null,
        reference: payment.reference,
        sortHint: 1,
        });
    });

    const historicalEntries = charges.filter(charge => (charge.settledAmount || 0) > 0).map(charge => ({
        id: `historical:${charge.id}`, date: chargeDate(charge), kind: 'other' as LedgerEntryKind,
        label: `Ajuste de apertura: ${charge.label} ya pagado (fecha de pago no registrada)`,
        amount: -Math.round(charge.settledAmount || 0), month: charge.month, reference: null, sortHint: 1,
    }));

    const ordered = [...chargeEntries, ...paymentEntries, ...historicalEntries].sort((left, right) => (
        left.date.localeCompare(right.date)
        || left.sortHint - right.sortHint
        || left.id.localeCompare(right.id)
    ));

    let balance = 0;
    const entries: LedgerEntry[] = ordered.map(entry => {
        balance += entry.amount;
        return {
            id: entry.id,
            date: entry.date,
            kind: entry.kind,
            label: entry.label,
            amount: entry.amount,
            balance,
            month: entry.month,
            reference: entry.reference,
        };
    });

    const totalCharged = chargeEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const totalPaid = payments.reduce((sum, payment) => sum + Math.round(payment.amount), 0);
    const historicalSettled = charges.reduce((sum, charge) => sum + Math.round(charge.settledAmount || 0), 0);
    const outstanding = allocateUnitPayments(charges.map(charge => ({
        id: charge.id, kind: charge.kind === 'gasto_comun' ? 'expense' : 'charge',
        amount: charge.amount, date: chargeDate(charge), settledAmount: charge.settledAmount,
    })), payments);
    const overdueCharges = chargeEntries
        .filter(entry => entry.amount > 0 && entry.date <= asOf)
        .sort((left, right) => left.date.localeCompare(right.date));

    let overdueAmount = 0;
    let oldestOverdueMonth: string | null = null;
    for (const charge of overdueCharges) {
        const remaining = outstanding.get(`${charge.kind === 'gasto_comun' ? 'expense' : 'charge'}:${charge.id}`) || 0;
        if (remaining > 0) {
            overdueAmount += remaining;
            if (!oldestOverdueMonth) oldestOverdueMonth = charge.month;
        }
    }

    return {
        entries,
        totalCharged,
        totalPaid,
        historicalSettled,
        balance: totalCharged - totalPaid - historicalSettled,
        overdueAmount,
        oldestOverdueMonth,
    };
}

/**
 * Interés por mora de un saldo vencido.
 *
 * Se calcula sobre el capital adeudado, sin capitalizar: el interés del mes
 * anterior no genera interés nuevo. Es el criterio conservador y el que evita
 * discusiones con el comité; capitalizar requeriría acuerdo expreso.
 */
export function calculateLateInterest(
    overdueAmount: number,
    monthlyRatePercent: number,
    monthsLate: number,
): number {
    if (overdueAmount <= 0 || monthlyRatePercent <= 0 || monthsLate <= 0) return 0;
    return Math.round(overdueAmount * (monthlyRatePercent / 100) * monthsLate);
}

/** Cuántos meses completos pasaron entre dos periodos AAAA-MM. */
export function monthsBetween(fromMonth: string, toMonth: string): number {
    const [fromYear, fromMon] = fromMonth.split('-').map(Number);
    const [toYear, toMon] = toMonth.split('-').map(Number);
    if (!fromYear || !fromMon || !toYear || !toMon) return 0;
    return Math.max(0, (toYear - fromYear) * 12 + (toMon - fromMon));
}
