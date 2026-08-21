/**
 * ProductCapabilitiesService: disponibilidad de integraciones del producto.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import type { ProductCapabilities } from '../types';

export const ProductCapabilitiesService = {
    async getCapabilities(): Promise<ProductCapabilities> {
        const response = await fetch('/api/product-capabilities', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) throw new Error('No se pudo verificar la disponibilidad de integraciones.');
        return response.json() as Promise<ProductCapabilities>;
    },
};
