import type { NeighborModeGate } from '@/lib/types';

/**
 * Modo vecino: lo que se puede usar en una comunidad "sin administrar" (la
 * crearon residentes, ninguna administración la tomó todavía) y lo que espera
 * a la administración. Diseño: docs/comercial/entrada-por-residente.md.
 */

/** Pantallas de la administración: en modo vecino muestran para qué sirven y cómo invitarla. */
const GATED: { prefix: string; gate: NeighborModeGate }[] = [
    { prefix: '/expenses', gate: { title: 'Gastos comunes', description: 'Con tu administración en Convive, ves tu cuenta, pagas y descargas tus comprobantes desde aquí.' } },
    { prefix: '/resident/finances', gate: { title: 'Gastos comunes', description: 'Con tu administración en Convive, ves tu cuenta, pagas y descargas tus comprobantes desde aquí.' } },
    { prefix: '/resident/consumo', gate: { title: 'Consumo de agua', description: 'La administración registra las lecturas de agua y cada vecino ve su consumo.' } },
    { prefix: '/resident/packages', gate: { title: 'Encomiendas', description: 'Conserjería registra tus encomiendas y te avisa apenas llegan.' } },
    { prefix: '/resident/invitations', gate: { title: 'Invitaciones', description: 'Invitas visitas con un código que conserjería valida en la entrada.' } },
    { prefix: '/resident/cases', gate: { title: 'Casos', description: 'CoCo registra tus reclamos y solicitudes y la administración los gestiona.' } },
    { prefix: '/amenities', gate: { title: 'Espacios comunes', description: 'Reservas el quincho, la sala multiuso o la piscina sin papeles ni grupos de WhatsApp.' } },
    { prefix: '/votaciones', gate: { title: 'Votaciones y asambleas', description: 'Votaciones y asambleas en línea, con quórum y acta, según la Ley 21.442.' } },
    { prefix: '/estacionamientos', gate: { title: 'Estacionamientos y bodegas', description: 'Arriendas tu estacionamiento o bodega a vecinos y se cobra en los gastos comunes. Necesita al edificio: el acceso y el cobro pasan por la administración.' } },
    { prefix: '/feed', gate: { title: 'Comunicaciones', description: 'Los avisos oficiales de tu administración llegan aquí y por WhatsApp.' } },
    { prefix: '/convivencia', gate: { title: 'Convivencia', description: 'Reportas ruidos o problemas de convivencia y la administración los gestiona.' } },
];

export function neighborModeGateFor(pathname: string | null | undefined): NeighborModeGate | null {
    if (!pathname) return null;
    return GATED.find(item => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`) || pathname.startsWith(`${item.prefix}?`))?.gate ?? null;
}

/**
 * Herramientas de CoCo que dependen de la administración: no se ofrecen en una
 * comunidad sin administrar (no hay gastos, reservas, conserjería ni avisos).
 */
export const NEIGHBOR_MODE_BLOCKED_TOOLS = new Set([
    'get_payment_status', 'get_water_consumption',
    'create_claim', 'get_claim_status', 'list_my_claims',
    'check_availability', 'create_reservation',
    'list_active_polls', 'vote_in_poll',
    'register_visitor', 'get_pending_packages',
    'get_my_parking', 'search_parking', 'book_parking',
    'get_my_storage', 'search_storage', 'rent_storage',
]);

/** Lo que CoCo sabe de una comunidad sin administrar. */
export const NEIGHBOR_MODE_PROMPT = [
    '**Modo vecino:** esta comunidad la crearon sus residentes; su administración todavía no usa Convive.',
    'Funciona: CoCo, supermercado (listas, comparador, compra comunitaria), marketplace entre vecinos, Red Convive de maestros y reseñas, consultas legales y recordatorios.',
    'No existen todavía: gastos comunes, pagos, reservas, votaciones, encomiendas, visitas, estacionamientos, bodegas ni avisos oficiales. Si los piden, explica que se activan cuando la administración se suma y sugiere invitarla desde la app ("Invitar a mi administración").',
    'Los vecinos aún no están validados por una administración: no afirmes que alguien vive en el edificio ni en qué departamento.',
].join(' ');

/** Mensaje para invitar a la administración (correo o WhatsApp). */
export function adminInviteMessage(buildingName: string, siteUrl: string) {
    return `Hola, soy vecino de ${buildingName}. Varios vecinos ya usamos Convive Connect para coordinarnos. `
        + `Con la administración en Convive se suman gastos comunes, reservas, avisos y votaciones en un solo lugar. `
        + `Pueden conocerlo y registrarse aquí: ${siteUrl}/admin-onboarding`;
}
