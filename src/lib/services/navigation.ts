/**
 * NavigationService: contexto de navegacion del residente.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    ResidentNavigationContext,
} from '../types';

export const NavigationService = {
    async getResidentContext(userId: string): Promise<ResidentNavigationContext> {
        if (!userId) return { hasMarketplaceListings: false, isServiceProvider: false };

        const [listingsResult, providerResult] = await Promise.all([
            supabase
                .from('marketplace_items')
                .select('id', { count: 'exact', head: true })
                .eq('seller_id', userId),
            supabase
                .from('service_providers')
                .select('id', { count: 'exact', head: true })
                .eq('user_id', userId),
        ]);

        if (listingsResult.error) console.warn('[Navigation] listings context unavailable:', listingsResult.error.message);
        if (providerResult.error) console.warn('[Navigation] provider context unavailable:', providerResult.error.message);

        return {
            hasMarketplaceListings: !listingsResult.error && (listingsResult.count || 0) > 0,
            isServiceProvider: !providerResult.error && (providerResult.count || 0) > 0,
        };
    },
};
