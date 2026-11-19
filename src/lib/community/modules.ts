/**
 * Módulos que una comunidad puede apagar (communities.disabled_modules).
 * Pensados para edificios: en un condominio de casas como Bahía Las Palmas
 * (Rapel), cada casa tiene su estacionamiento y su bodega, y el agua no se
 * reparte por medidor. Apagar un módulo lo saca del menú y de CoCo.
 */
export const COMMUNITY_MODULES = {
    parking: {
        label: 'Estacionamientos y bodegas',
        paths: ['/estacionamientos'],
        tools: [
            'register_my_vehicle', 'get_my_parking', 'search_parking', 'book_parking', 'cancel_parking_booking',
            'extend_parking_booking', 'rate_parking_booking', 'set_my_spot_availability', 'publish_my_parking_spot',
            'list_parking_access_requests', 'review_parking_access',
            'get_my_storage', 'search_storage', 'rent_storage', 'cancel_storage_rental', 'publish_my_storage_unit',
            'list_my_listings', 'update_my_listing', 'set_my_listing_status', 'remove_my_listing',
            'list_pending_listings', 'review_listing',
        ],
    },
    water: {
        label: 'Control hídrico',
        paths: ['/resident/consumo', '/admin/consumo'],
        tools: ['get_water_consumption', 'record_water_reading'],
    },
} as const;

export type CommunityModule = keyof typeof COMMUNITY_MODULES;

export function isCommunityModule(value: unknown): value is CommunityModule {
    return typeof value === 'string' && value in COMMUNITY_MODULES;
}

/** Módulos apagados, a partir de la columna (ignora valores desconocidos). */
export function disabledModulesOf(value: unknown): CommunityModule[] {
    return Array.isArray(value) ? value.filter(isCommunityModule) : [];
}

/** Herramientas de CoCo que no se ofrecen porque su módulo está apagado. */
export function toolsBlockedByModules(disabled: readonly CommunityModule[]): Set<string> {
    return new Set(disabled.flatMap(module => [...COMMUNITY_MODULES[module].tools]));
}

/** El módulo apagado al que pertenece una ruta, si hay uno. */
export function disabledModuleForPath(pathname: string, disabled: readonly CommunityModule[]): CommunityModule | null {
    return disabled.find(module => COMMUNITY_MODULES[module].paths.some(path => pathname === path || pathname.startsWith(`${path}/`) || pathname.startsWith(`${path}?`))) ?? null;
}

/**
 * Módulos opcionales que una comunidad enciende (communities.extra_modules).
 * lake: embarcaciones y avisos de temporada para comunidades junto a un lago.
 */
export const EXTRA_MODULES = {
    lake: { label: 'Vida junto al lago' },
} as const;

export type ExtraModule = keyof typeof EXTRA_MODULES;

export function extraModulesOf(value: unknown): ExtraModule[] {
    return Array.isArray(value) ? value.filter((item): item is ExtraModule => typeof item === 'string' && item in EXTRA_MODULES) : [];
}

/**
 * Plantillas de avisos de temporada para CoCo en una comunidad junto al lago.
 * Van como contexto: CoCo las adapta y las programa con schedule_community_notice.
 */
export const LAKE_SEASON_NOTICES = [
    'Crecida del lago: "El lago está subiendo. Revisen amarras en el muelle y suban kayaks y botes chicos de la playa hasta nuevo aviso."',
    'Corte de camino: "El camino de acceso estará cortado [día] entre [hora] y [hora] por [motivo]. Planifiquen sus salidas."',
    'Temporada alta: "Comienza la temporada alta: reserven muelle, rampa y quincho con anticipación y respeten los horarios de ruido."',
    'Restricción de quemas: "Rige la prohibición de quemas y fuego al aire libre. El quincho solo con parrilla a gas o carbón controlado."',
];
