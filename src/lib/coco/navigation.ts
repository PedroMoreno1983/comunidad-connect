// Whitelist for CoCo's NAVEGAR:/ruta directive. The model's raw text output
// is regex-extracted with no validation in agent.ts (`NAVEGAR:(\/[a-zA-Z0-9/_-]+)`),
// so anything that eventually calls router.push() on it must check it against
// a known set of in-app routes first -- otherwise a prompt-injection payload
// surfaced through tool-result content (a marketplace listing, a vendor bio)
// could steer an unvalidated NAVEGAR: value straight into router.push().
export const COCO_NAV_MAP: Record<string, string> = {
    "/home": "Inicio",
    "/comunicaciones": "Comunidad",
    "/convivencia": "Convivencia",
    "/directorio": "Directorio",
    "/profile": "Mi Perfil",
    "/amenities": "Espacios Comunes",
    "/marketplace": "Marketplace",
    "/resident/supermercado": "Supermercado",
    "/services": "Servicios",
    "/services/my-requests": "Mis Solicitudes",
    "/resident/cases": "Mis Casos CoCo",
    "/resident/invitations": "Mis Invitaciones",
    "/votaciones": "Votaciones",
    "/resident/finances": "Mis Gastos",
    "/resident/consumo": "Mi Consumo de Agua",
    "/concierge/visitors": "Registro de Visitas",
    "/concierge/packages": "Encomiendas",
    "/staff/training": "Aula Virtual IA",
    "/admin/finanzas": "Finanzas",
    "/admin/units": "Unidades",
    "/admin/consumo": "Control Hídrico",
    "/admin/mantenimiento": "Mantenimiento",
    "/admin/votaciones": "Gestión de Votos",
    "/admin/users": "Usuarios",
    "/admin/onboarding": "Carga Masiva",
    "/admin/training": "Generador de Cursos",
    // Legacy aliases kept for backwards compatibility with existing chat history.
    "/social": "Muro Social",
    "/chat": "Comunidad",
    "/expenses": "Mis Gastos",
    "/feed": "Avisos Oficiales",
};

const COCO_HIDDEN_NAV_ROUTES = new Set(["/showcase", "/marketing/reels"]);

export function getSafeCoCoNavigation(target?: string): string | undefined {
    return target && target in COCO_NAV_MAP && !COCO_HIDDEN_NAV_ROUTES.has(target) ? target : undefined;
}
