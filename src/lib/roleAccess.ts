/**
 * Destinos y permisos por rol. Lo usa el proxy (sin doble salto a /home)
 * y el login para no reutilizar un `next` que el rol nuevo no puede ver.
 */

export type AppRole = "admin" | "resident" | "concierge";

export function normalizeAppRole(role: string | null | undefined): AppRole {
    if (role === "admin" || role === "concierge") return role;
    return "resident";
}

export function homePathForRole(role: string | null | undefined): string {
    const normalized = normalizeAppRole(role);
    if (normalized === "admin") return "/admin";
    if (normalized === "concierge") return "/concierge";
    return "/home";
}

export function isDashboardPathAllowedForRole(pathname: string, role: string | null | undefined): boolean {
    const normalized = normalizeAppRole(role);

    if (pathname.startsWith("/comunicaciones") && normalized === "resident") return false;
    if (pathname.startsWith("/feed") && normalized !== "resident") return false;

    if (pathname.startsWith("/agent-center")) return normalized === "admin";
    if (pathname.startsWith("/convivencia")) return normalized === "resident";
    if (pathname.startsWith("/resident/supermercado")) return normalized === "resident";
    if (
        pathname.startsWith("/marketplace")
        || pathname.startsWith("/services")
        || pathname.startsWith("/votaciones")
        || pathname.startsWith("/expenses")
    ) {
        return normalized === "admin" || normalized === "resident";
    }
    if (pathname.startsWith("/comunicaciones")) return normalized === "admin" || normalized === "concierge";
    if (pathname.startsWith("/staff")) return normalized === "admin" || normalized === "concierge";
    if (pathname.startsWith("/admin")) return normalized === "admin";
    if (pathname.startsWith("/concierge")) return normalized === "concierge" || normalized === "admin";
    if (pathname.startsWith("/resident")) return normalized === "resident" || normalized === "admin";
    return true;
}

export function postLoginPath(requestedNext: string | null | undefined, role: string | null | undefined): string {
    const home = homePathForRole(role);
    if (!requestedNext || requestedNext === "/home" || requestedNext === "/login") return home;
    if (!requestedNext.startsWith("/") || requestedNext.startsWith("//")) return home;
    const pathname = requestedNext.split("?")[0] || requestedNext;
    if (isDashboardPathAllowedForRole(pathname, role)) return requestedNext;
    return `${home}?acceso=denegado`;
}

export const ACCESS_DENIED_QUERY = "acceso";
export const ACCESS_DENIED_VALUE = "denegado";
