/**
 * Red Convive (superadmin): mover un maestro entre la red y una comunidad no
 * puede dejar solicitudes abiertas de otras comunidades varadas, y cada cambio
 * queda en la bitácora global.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

vi.mock('server-only', () => ({}));
const state: { db: FakeDb } = { db: createFakeDb() };
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(state.db),
    supabaseAdmin: new Proxy({}, { get: (_target, key) => (fakeClient(state.db) as unknown as Record<string | symbol, unknown>)[key] }),
}));
vi.setConfig({ testTimeout: 60_000 });

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const PROVIDER = '33333333-3333-4333-8333-333333333333';
const ACTOR = { id: '44444444-4444-4444-8444-444444444444', email: 'convive@example.com' };

describe('mover un maestro de la red', () => {
    beforeEach(() => {
        state.db = createFakeDb({
            communities: [{ id: A, name: 'Edificio A' }, { id: B, name: 'Edificio B' }],
            service_providers: [{ id: PROVIDER, name: 'Juan Red', user_id: null, community_id: null }],
            service_requests: [
                { id: 'r1', provider_id: PROVIDER, community_id: A, status: 'accepted' },
                { id: 'r2', provider_id: PROVIDER, community_id: B, status: 'completed' },
            ],
            service_provider_links: [{ id: 'l1', provider_id: PROVIDER, revoked_at: null }],
            platform_operation_events: [],
        });
    });

    it('no lo devuelve a otra comunidad si tiene solicitudes abiertas de afuera', async () => {
        const { moveProvider } = await import('@/lib/services/providerNetworkAdmin');
        await expect(moveProvider(PROVIDER, B, ACTOR)).rejects.toMatchObject({ status: 409 });
        expect(state.db.tables.service_providers[0].community_id).toBeNull();
        expect(state.db.tables.platform_operation_events).toHaveLength(0);
    });

    it('sí lo devuelve a la comunidad de sus solicitudes abiertas, revoca enlaces y audita', async () => {
        const { moveProvider } = await import('@/lib/services/providerNetworkAdmin');
        await moveProvider(PROVIDER, A, ACTOR);
        expect(state.db.tables.service_providers[0].community_id).toBe(A);
        expect(state.db.tables.service_provider_links[0].revoked_at).toBeTruthy();
        expect(state.db.tables.platform_operation_events[0]).toMatchObject({
            actor_id: ACTOR.id, action: 'provider_network.moved_to_community', entity_id: PROVIDER,
        });
    });

    it('verificar en la red también queda en la bitácora global', async () => {
        const { setNetworkProviderVerified } = await import('@/lib/services/providerNetworkAdmin');
        await setNetworkProviderVerified(PROVIDER, true, ACTOR);
        expect(state.db.tables.service_providers[0].verified).toBe(true);
        expect(state.db.tables.platform_operation_events[0]).toMatchObject({ action: 'provider_network.verified' });
    });
});
