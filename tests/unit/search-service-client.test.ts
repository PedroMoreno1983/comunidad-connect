import { describe, expect, it, vi } from 'vitest';
import { SearchService } from '@/lib/search';
import type { SearchClient } from '@/lib/search';

/**
 * Las RPC de búsqueda acotan el tenant con `get_my_community_id()`, que
 * necesita `auth.uid()`. El servicio importaba el cliente de navegador (anon,
 * sin sesión), así que en el servidor no había usuario y toda búsqueda
 * devolvía cero resultados. Estas pruebas fijan que el cliente se inyecta.
 */
function clientSpy(rows: Record<string, unknown>[] = []) {
    const rpc = vi.fn(async () => ({ data: rows, error: null }));
    return { client: { rpc } as unknown as SearchClient, rpc };
}

describe('SearchService client injection', () => {
    it('runs the marketplace search through the caller client', async () => {
        const { client, rpc } = clientSpy([
            { id: 'item-1', title: 'Bicicleta', rank: 0.8 },
        ]);

        const results = await SearchService.searchMarketplace(client, 'bicicleta');

        expect(rpc).toHaveBeenCalledWith('search_marketplace_lexical', { query: 'bicicleta' });
        expect(results).toHaveLength(1);
        expect(results[0].id).toBe('item-1');
    });

    it('runs the profile search through the caller client', async () => {
        const { client, rpc } = clientSpy([
            { id: 'profile-1', name: 'Ana', rank: 0.5 },
        ]);

        await SearchService.searchProfiles(client, 'ana');

        expect(rpc).toHaveBeenCalledWith('search_profiles_lexical', { query: 'ana' });
    });

    it('never falls back to another client when the caller one fails', async () => {
        const rpc = vi.fn(async () => ({ data: null, error: new Error('sin sesión') }));
        const client = { rpc } as unknown as SearchClient;

        const results = await SearchService.searchMarketplace(client, 'bicicleta');

        expect(results).toEqual([]);
        expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('searches both scopes with the same caller client', async () => {
        const { client, rpc } = clientSpy();

        await SearchService.searchAll(client, 'gimnasio');

        const called = rpc.mock.calls.map(call => (call as unknown as [string])[0]);
        expect(called).toContain('search_marketplace_lexical');
        expect(called).toContain('search_profiles_lexical');
    });
});
