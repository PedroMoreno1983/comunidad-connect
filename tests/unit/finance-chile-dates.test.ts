import { describe, expect, it } from "vitest";
import {
    currentMonthInChile,
    formatFinanceDate,
    nextMonthFifthInChile,
    todayInChile,
} from "@/lib/finance/chileDates";

describe("Chilean finance calendar dates", () => {
    it("keeps September until midnight in Chile even after UTC enters October", () => {
        const lateSeptember = new Date("2026-10-01T01:56:00Z");
        expect(todayInChile(lateSeptember)).toBe("2026-09-30");
        expect(currentMonthInChile(lateSeptember)).toBe("2026-09");
        expect(nextMonthFifthInChile(lateSeptember)).toBe("2026-10-05");
    });

    it("shows a date-only due date without shifting it to the previous day", () => {
        expect(formatFinanceDate("2026-10-06")).toMatch(/^06.*oct/i);
        expect(formatFinanceDate("2026-10-06T00:00:00.000Z")).toMatch(/^06.*oct/i);
    });
});
