import { supabase } from '../supabase';
import { CommercialLeadRequest, CommercialLeadResponse, ResidentNavigationContext } from '../types';
import type { ApiKeyScope, CommunityApiKey, OversightLink, ProductCapabilities } from '../types';
import { financeWrite, readApi } from './_shared';

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

export const CommercialService = {
    async submitLead(payload: CommercialLeadRequest): Promise<CommercialLeadResponse> {
        const response = await fetch('/api/email/outreach', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => null) as CommercialLeadResponse | null;

        if (!response.ok || !data?.ok) {
            throw new Error(data?.error || 'No se pudo registrar la solicitud. Intenta nuevamente.');
        }

        return data;
    },
};

export const ApiKeysService = {
    list() {
        return readApi<{ keys: CommunityApiKey[] }>('/api/admin/api-keys', 'No se pudieron cargar las claves.');
    },

    create(input: { name: string; scopes: ApiKeyScope[] }) {
        return readApi<{ apiKey: CommunityApiKey; secret: string }>('/api/admin/api-keys', 'No se pudo crear la clave.', financeWrite(input));
    },

    revoke(id: string) {
        return readApi<{ revoked: boolean }>('/api/admin/api-keys', 'No se pudo revocar la clave.', financeWrite({ action: 'revoke', id }));
    },
};

/** Accesos de solo lectura para fiscalizadores y comité de vigilancia. */
export const OversightLinksService = {
    list() {
        return readApi<{ links: OversightLink[] }>('/api/admin/oversight-links', 'No se pudieron cargar los accesos.');
    },

    create(input: { label: string; days: number }) {
        return readApi<{ link: OversightLink; token: string }>('/api/admin/oversight-links', 'No se pudo crear el acceso.', financeWrite(input));
    },

    revoke(id: string) {
        return readApi<{ revoked: boolean }>('/api/admin/oversight-links', 'No se pudo revocar el acceso.', financeWrite({ action: 'revoke', id }));
    },
};

/** Facturación electrónica (OpenFactura). */
