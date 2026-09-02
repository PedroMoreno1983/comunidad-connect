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

    it("replaces a forbidden next= with the role home and a denied flag", () => {
        expect(postLoginPath("/admin/finanzas", "resident")).toBe("/home?acceso=denegado");
        expect(postLoginPath("/expenses", "concierge")).toBe("/concierge?acceso=denegado");
        expect(postLoginPath("/expenses", "resident")).toBe("/expenses");
        expect(postLoginPath("/home", "admin")).toBe("/admin");
    });
});
