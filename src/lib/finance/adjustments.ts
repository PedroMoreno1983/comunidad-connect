/**
 * Ajustes sobre el gasto común que no son un cargo nuevo: hoy, el descuento
 * de comité de la Ley 21.442.
 *
 * No hay columna ni tipo de cargo para créditos (unit_charges.amount > 0 y
 * kind no admite 'discount'). Se modela con un cargo `other` etiquetado, y el
 * libro lo trata como abono: baja lo que la unidad debe, no lo sube.
 */

export const COMMITTEE_DISCOUNT_NOTE = 'ley_21442_committee_discount';
export const COMMITTEE_DISCOUNT_LABEL = 'Descuento de comité (Ley 21.442)';

export function isCommitteeDiscount(charge: { label?: string | null; notes?: string | null }): boolean {
    if (charge.notes === COMMITTEE_DISCOUNT_NOTE) return true;
    return /descuento de comit[eé]/i.test(String(charge.label || ''));
}

/** Monto con signo de libro: positivo sube la deuda, negativo la baja. */
export function signedChargeAmount(charge: {
    amount: number;
    label?: string | null;
    notes?: string | null;
}): number {
    const amount = Math.round(Math.abs(Number(charge.amount) || 0));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return isCommitteeDiscount(charge) ? -amount : amount;
}
