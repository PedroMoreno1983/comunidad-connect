/**
 * Red Convive de maestros. Un proveedor es de una comunidad (community_id = la
 * comunidad, lo registra su administración) o de la red (community_id NULL, lo
 * cura Convive y lo ven todas las comunidades).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Filtro PostgREST para `.or()`: los proveedores de la comunidad y los de la red. */
export function communityProvidersFilter(communityId: string) {
    // El id va dentro de un filtro en texto: solo se acepta un UUID.
    if (!UUID.test(communityId)) throw new Error('Comunidad no válida.');
    return `community_id.eq.${communityId},community_id.is.null`;
}

export function isNetworkProvider(provider: { community_id?: unknown } | null | undefined) {
    return Boolean(provider) && (provider?.community_id === null || provider?.community_id === undefined);
}
