type ProviderRow = {
    id: string;
    name: string;
    category: string;
    rating: number | null;
    contact_phone: string;
    bio?: string | null;
    specialties?: string[] | null;
    verified?: boolean | null;
    service_address?: string | null;
    service_latitude?: number | null;
    service_longitude?: number | null;
};

type Coordinates = { address_latitude?: number | null; address_longitude?: number | null } | null;

function normalize(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function distanceKm(latA: number, lonA: number, latB: number, lonB: number) {
    const rad = Math.PI / 180;
    const dLat = (latB - latA) * rad;
    const dLon = (lonB - lonA) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(latA * rad) * Math.cos(latB * rad) * Math.sin(dLon / 2) ** 2;
    return Math.round(6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
}

/** Ordena solo los proveedores registrados; no inventa resultados externos. */
export function rankNearbyProviders(rows: ProviderRow[], query: string, community: Coordinates, limit = 10) {
    const terms = normalize(query).split(/[^a-z0-9]+/).filter(term => term.length >= 4 && !['para', 'cerca', 'reparacion', 'servicio', 'servicios'].includes(term));
    const communityLat = Number(community?.address_latitude);
    const communityLon = Number(community?.address_longitude);
    const communityLocated = community?.address_latitude != null && community?.address_longitude != null
        && Number.isFinite(communityLat) && Number.isFinite(communityLon);
    const matches = rows.filter(row => {
        if (!terms.length) return true;
        const haystack = normalize([row.name, row.category, row.bio || '', ...(row.specialties || [])].join(' '));
        return terms.some(term => haystack.includes(term));
    });
    return matches.map(row => {
        const latitude = Number(row.service_latitude);
        const longitude = Number(row.service_longitude);
        const located = communityLocated && row.service_latitude != null && row.service_longitude != null
            && Number.isFinite(latitude) && Number.isFinite(longitude);
        return {
            id: row.id, name: row.name, category: row.category, rating: row.rating,
            contact_phone: row.contact_phone, verified: Boolean(row.verified),
            service_address: row.service_address || null,
            distance_km_approx: located ? distanceKm(communityLat, communityLon, latitude, longitude) : null,
        };
    }).sort((a, b) => {
        if (a.distance_km_approx != null && b.distance_km_approx != null) return a.distance_km_approx - b.distance_km_approx;
        if (a.distance_km_approx != null) return -1;
        if (b.distance_km_approx != null) return 1;
        return Number(b.rating || 0) - Number(a.rating || 0);
    }).slice(0, limit);
}
