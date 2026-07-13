import { describe, expect, it } from "vitest";
import { calculateHaulmerServiceFee, getHaulmerTariffRange, CHILE_VAT_RATE } from "@/lib/payments/haulmerFees";

describe("getHaulmerTariffRange", () => {
    it("selects range_1 for typical condo-fee volumes", () => {
        expect(getHaulmerTariffRange(300_000).id).toBe("range_1");
    });

    it("selects range_2 right at its lower boundary", () => {
        expect(getHaulmerTariffRange(500_000_001).id).toBe("range_2");
    });

    it("selects the top open-ended range for very large volumes", () => {
        expect(getHaulmerTariffRange(10_000_000_000).id).toBe("range_4");
    });

    it("falls back to range_1 for negative or missing volume", () => {
        expect(getHaulmerTariffRange(-500).id).toBe("range_1");
        expect(getHaulmerTariffRange().id).toBe("range_1");
    });
});

describe("calculateHaulmerServiceFee", () => {
    it("returns an all-zero breakdown for a zero amount instead of dividing/charging anything", () => {
        const result = calculateHaulmerServiceFee(0);
        expect(result.baseAmount).toBe(0);
        expect(result.netFee).toBe(0);
        expect(result.vat).toBe(0);
        expect(result.totalFee).toBe(0);
        expect(result.totalWithFee).toBe(0);
    });

    it("computes the mixed-mode fee with VAT for a typical condo fee amount", () => {
        // range_1 mixed: 0.75% + $60 fixed fee, then 19% VAT on the net fee.
        const amount = 50_000;
        const result = calculateHaulmerServiceFee(amount);
        const expectedNetFee = Math.round(amount * 0.0075 + 60);
        const expectedVat = Math.round(expectedNetFee * CHILE_VAT_RATE);

        expect(result.feeMode).toBe("mixed");
        expect(result.netFee).toBe(expectedNetFee);
        expect(result.vat).toBe(expectedVat);
        expect(result.totalFee).toBe(expectedNetFee + expectedVat);
        expect(result.totalWithFee).toBe(amount + expectedNetFee + expectedVat);
    });

    it("computes the base_percent fee mode without the mixed fixed fee", () => {
        const amount = 100_000;
        const result = calculateHaulmerServiceFee(amount, { feeMode: "base_percent" });
        const expectedNetFee = Math.round(amount * 0.0141);

        expect(result.netFee).toBe(expectedNetFee);
    });

    it("omits VAT when includeVat is explicitly false", () => {
        const result = calculateHaulmerServiceFee(50_000, { includeVat: false });
        expect(result.vatRate).toBe(0);
        expect(result.vat).toBe(0);
        expect(result.totalFee).toBe(result.netFee);
    });

    it("never charges the resident less than the original amount", () => {
        const result = calculateHaulmerServiceFee(75_000);
        expect(result.totalWithFee).toBeGreaterThan(result.baseAmount);
    });

    it("rejects negative amounts by clamping to zero rather than paying the payer", () => {
        const result = calculateHaulmerServiceFee(-10_000);
        expect(result.baseAmount).toBe(0);
        expect(result.totalWithFee).toBe(0);
    });
});
