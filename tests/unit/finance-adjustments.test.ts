import { describe, expect, it } from 'vitest';
import { isCommitteeDiscount, signedChargeAmount, COMMITTEE_DISCOUNT_NOTE } from '@/lib/finance/adjustments';

describe('descuento de comité Ley 21.442', () => {
    it('reconoce el cargo por nota o por el texto del label', () => {
        expect(isCommitteeDiscount({ notes: COMMITTEE_DISCOUNT_NOTE, label: 'Otro' })).toBe(true);
        expect(isCommitteeDiscount({ label: 'Descuento de comité (Ley 21.442)' })).toBe(true);
        expect(isCommitteeDiscount({ label: 'Descuento de comite marzo' })).toBe(true);
        expect(isCommitteeDiscount({ label: 'Multa por ruidos' })).toBe(false);
    });

    it('firma el monto como abono, sin inventar un kind nuevo', () => {
        expect(signedChargeAmount({ amount: 40_000, notes: COMMITTEE_DISCOUNT_NOTE })).toBe(-40_000);
        expect(signedChargeAmount({ amount: 10_000, label: 'Multa' })).toBe(10_000);
    });
});
