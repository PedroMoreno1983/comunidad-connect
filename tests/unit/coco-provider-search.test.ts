import { describe, expect, it } from 'vitest';
import { rankNearbyProviders } from '@/lib/coco/providerSearch';

const provider = (id: string, lat: number | null, lon: number | null) => ({
    id, name: `Ascensores ${id}`, category: 'general', rating: 4,
    contact_phone: '+56911111111', specialties: ['mantención de ascensores'],
    service_latitude: lat, service_longitude: lon,
});

describe('proveedores cercanos de CoCo', () => {
    it('ordena por distancia real calculable y deja sin distancia los no ubicados', () => {
        const result = rankNearbyProviders([
            provider('lejano', -33.5, -70.7), provider('sin-zona', null, null), provider('cercano', -33.41, -70.61),
        ], 'reparación de ascensores', { address_latitude: -33.4, address_longitude: -70.6 });
        expect(result.map(item => item.id)).toEqual(['cercano', 'lejano', 'sin-zona']);
        expect(result[0].distance_km_approx).toBeGreaterThan(0);
        expect(result[2].distance_km_approx).toBeNull();
    });

    it('no atribuye cercanía si la comunidad carece de coordenadas', () => {
        const result = rankNearbyProviders([provider('a', -33.41, -70.61)], 'ascensor', null);
        expect(result[0].distance_km_approx).toBeNull();
    });

    it('no inventa especialistas si no hay coincidencias en el directorio', () => {
        expect(rankNearbyProviders([provider('a', -33.41, -70.61)], 'gasfitería', null)).toEqual([]);
    });
});
