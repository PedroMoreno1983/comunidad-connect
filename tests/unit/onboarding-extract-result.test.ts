import { describe, expect, it } from "vitest";
import { interpretRosterExtractResponse } from "@/lib/onboarding/extractResult";

describe("interpretRosterExtractResponse", () => {
    it("treats HTTP errors as a visible failure", () => {
        const result = interpretRosterExtractResponse(
            { error: "Formato no soportado (.pdf, .doc, .docx, .xls, .xlsx, .txt, .csv)." },
            false,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toMatch(/Formato no soportado/);
        }
    });

    it("does not treat 200 + empty data + status=failed as success", () => {
        const result = interpretRosterExtractResponse(
            { status: "failed", data: [], batchId: "batch-1", documents: [{ status: "failed", error: "El documento esta vacio o no se puede procesar." }] },
            true,
        );
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.message).toMatch(/vacio|vacío|procesar/i);
        }
    });

    it("accepts a roster with matching columns", () => {
        const result = interpretRosterExtractResponse(
            {
                status: "review",
                data: [{ id: "1", name: "Andrea", unit_id: "1204", email: "a@example.com", phone: "" }],
            },
            true,
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.rows).toHaveLength(1);
            expect(result.rows[0].unit_id).toBe("1204");
        }
    });

    it("carries the unit rights as % text and converts the legacy ‰ field", () => {
        const result = interpretRosterExtractResponse(
            {
                status: "review",
                data: [
                    { id: "1", name: "Ana", unit_id: "101", email: "", phone: "", derechos_porcentaje: "0,532" },
                    { id: "2", name: "Luis", unit_id: "102", email: "", phone: "", derechos_permil: "12,5" },
                    { id: "3", name: "Eva", unit_id: "103", email: "", phone: "" },
                ],
            },
            true,
        );
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.rows.map(row => row.derechos_porcentaje)).toEqual(["0,532", "1,25", ""]);
    });
});
