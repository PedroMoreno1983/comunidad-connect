import { describe, expect, it } from "vitest";
import { periodCollectionStats, resolveBillingPeriod } from "@/lib/finance/periodCollection";

describe("periodCollection", () => {
    const rows = [
        { month: "2026-05", amount: 148600, status: "pending" },
        { month: "2026-07", amount: 75000, status: "pending" },
        { month: "2026-07", amount: 75000, status: "paid" },
        { month: "2026-06", amount: 946200 - 148600 - 150000, status: "paid" },
    ];

    it("uses the latest month with issued charges, not the historical total", () => {
        expect(resolveBillingPeriod(rows.map(row => row.month))).toBe("2026-07");
        const stats = periodCollectionStats(rows, "2026-07");
        expect(stats.totalBilled).toBe(150000);
        expect(stats.totalCollected).toBe(75000);
        expect(stats.collectionRate).toBe(50);
    });

    it("matches the finanzas recorte when the latest period has no payments", () => {
        const latestOnly = [
            { month: "2026-07", amount: 75000, status: "pending" },
            { month: "2026-05", amount: 871200, status: "paid" },
        ];
        const period = resolveBillingPeriod(latestOnly.map(row => row.month));
        const stats = periodCollectionStats(latestOnly, period);
        expect(period).toBe("2026-07");
        expect(stats.totalBilled).toBe(75000);
        expect(stats.totalCollected).toBe(0);
        expect(stats.collectionRate).toBe(0);
    });
});
