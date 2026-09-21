import { describe, expect, it } from "vitest";
import { homePathForRole, isDashboardPathAllowedForRole, postLoginPath } from "@/lib/roleAccess";

describe("roleAccess", () => {
    it("sends each role to its own home without bouncing through /home", () => {
        expect(homePathForRole("admin")).toBe("/admin");
        expect(homePathForRole("concierge")).toBe("/concierge");
        expect(homePathForRole("resident")).toBe("/home");
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
        expect(postLoginPath("/home", "admin")).toBe("/admin");
    });
});
