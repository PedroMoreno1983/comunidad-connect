import { describe, expect, it } from "vitest";
import { homePathForRole, isDashboardPathAllowedForRole, isPersonalDashboardPath, postLoginPath } from "@/lib/roleAccess";

describe("roleAccess", () => {
    it.each([
        ["/agent-center", [true, false, false]],
        ["/staff/training", [true, false, true]],
        ["/convivencia", [false, true, false]],
        ["/resident/supermercado", [false, true, false]],
    ] as const)("enforces the profile matrix for %s", (pathname, expected) => {
        ["admin", "resident", "concierge"].forEach((role, index) => {
            expect(isDashboardPathAllowedForRole(pathname, role)).toBe(expected[index]);
        });
    });
    it("sends each role to its own home without bouncing through /home", () => {
        expect(homePathForRole("admin")).toBe("/chat");
        expect(homePathForRole("concierge")).toBe("/concierge");
        expect(homePathForRole("resident")).toBe("/home");
    });

    it("limits accounts without a community to home, personal tools and profile", () => {
        for (const path of ["/home", "/resident/servicios", "/resident/supermercado", "/resident/supermercado/comparador", "/profile", "/privacy-center"]) {
            expect(isPersonalDashboardPath(path)).toBe(true);
        }
        for (const path of ["/expenses", "/resident/consumo", "/resident/services-other", "/admin", "/agent-center", "/chat"]) {
            expect(isPersonalDashboardPath(path)).toBe(false);
        }
    });

    it("blocks concierge from resident finance routes", () => {
        expect(isDashboardPathAllowedForRole("/expenses", "concierge")).toBe(false);
        expect(isDashboardPathAllowedForRole("/admin/finanzas", "concierge")).toBe(false);
        expect(isDashboardPathAllowedForRole("/concierge", "concierge")).toBe(true);
    });

    // Un next= de otro rol es un destino inválido (típico al cambiar de cuenta),
    // no un intento fallido: se va al home del rol sin marcar acceso denegado.
    it("replaces a forbidden next= with the clean role home", () => {
        expect(postLoginPath("/admin/finanzas", "resident")).toBe("/home");
        expect(postLoginPath("/expenses", "concierge")).toBe("/concierge");
        expect(postLoginPath("/expenses", "resident")).toBe("/expenses");
        expect(postLoginPath("/home", "admin")).toBe("/chat");
    });
});
