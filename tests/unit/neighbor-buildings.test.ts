/**
 * Entrada por residente, fases 3 y 4: contador de vecinos, edificios por
 * conquistar, entrega a la administración y validación de vecinos.
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
const ADMIN = '33333333-3333-4333-8333-333333333333';
const NEIGHBOR = '44444444-4444-4444-8444-444444444444';
const ACTOR = { id: '55555555-5555-4555-8555-555555555555', email: 'convive@example.com' };

function residents(communityId: string, count: number, verified = false) {
    return Array.from({ length: count }, (_, index) => ({
        id: `${communityId.slice(0, 8)}-r${index}`, community_id: communityId, role: 'resident', residence_verified: verified,
        name: `Vecino ${index}`, email: `v${index}@x.cl`, department_number: `${100 + index}`, created_at: '2026-11-13T10:00:00Z',
    }));
}

beforeEach(() => {
    state.db = createFakeDb({
        communities: [
            { id: A, name: 'Los Aromos', managed: false, address: 'Av. 1', created_at: '2026-11-01T00:00:00Z', admin_code: 'ADM-AROMOS' },
            { id: B, name: 'El Roble', managed: false, address: 'Av. 2', created_at: '2026-11-02T00:00:00Z', admin_code: 'ADM-ROBLE' },
        ],
        profiles: [...residents(A, 12), ...residents(B, 3)],
        ai_budgets: [{ community_id: A, plan: 'demo' }],
        units: [],
        platform_operation_events: [],
        operation_events: [],
    });
});

describe('contador y prospectos', () => {
    it('los vecinos ven cuántos son; desde 10 la invitación se destaca', async () => {
        const { neighborModeSummary } = await import('@/lib/onboarding/neighborBuildings');
        expect(await neighborModeSummary(A)).toEqual({ buildingName: 'Los Aromos', residents: 12, highlightInvite: true });
        expect(await neighborModeSummary(B)).toMatchObject({ residents: 3, highlightInvite: false });
    });

    it('superadmin ve primero los edificios con más vecinos, marcados desde 5', async () => {
        const { listUnmanagedBuildings } = await import('@/lib/onboarding/neighborBuildings');
        const list = await listUnmanagedBuildings();
        expect(list.map(row => [row.name, row.residents, row.readyForSales])).toEqual([['Los Aromos', 12, true], ['El Roble', 3, false]]);
    });

    it('al llegar a 5 vecinos queda registrado para el equipo comercial', async () => {
        state.db.tables.profiles.push(...residents(B, 2).map((row, index) => ({ ...row, id: `extra-${index}` })));
        const { noteResidentThreshold } = await import('@/lib/onboarding/neighborBuildings');
        await noteResidentThreshold(B, 'El Roble');
        expect(state.db.tables.platform_operation_events[0]).toMatchObject({ action: 'neighbor_mode.residents_threshold_5', entity_id: B });
        // Una sola vez, aunque se vuelva a revisar o se pase del umbral de golpe.
        await noteResidentThreshold(B, 'El Roble');
        expect(state.db.tables.platform_operation_events).toHaveLength(1);
    });
});

describe('entregar el edificio a su administración', () => {
    it('lo deja administrado, devuelve el código de administración y quita el presupuesto demo', async () => {
        const { activateBuilding } = await import('@/lib/onboarding/neighborBuildings');
        expect(await activateBuilding(A, ACTOR)).toEqual({ name: 'Los Aromos', adminCode: 'ADM-AROMOS', residents: 12, warnings: [] });
        expect(state.db.tables.communities[0]).toMatchObject({ managed: true });
        expect(state.db.tables.ai_budgets).toHaveLength(0);
        expect(state.db.tables.platform_operation_events[0]).toMatchObject({ action: 'neighbor_mode.building_activated', actor_id: ACTOR.id });
        await expect(activateBuilding(A, ACTOR)).rejects.toMatchObject({ status: 409 });
    });
});

describe('la administración valida a sus vecinos', () => {
    it('solo en un edificio administrado; validar o quitar', async () => {
        state.db.tables.profiles.push({ id: NEIGHBOR, community_id: A, role: 'resident', residence_verified: false, name: 'Ana', email: 'a@x.cl', created_at: '2026-11-13T10:00:00Z' });
        const { activateBuilding, decidePendingResident, listPendingResidents } = await import('@/lib/onboarding/neighborBuildings');
        await expect(decidePendingResident(A, ADMIN, NEIGHBOR, true)).rejects.toMatchObject({ status: 409 });
        await activateBuilding(A, ACTOR);
        expect((await listPendingResidents(A)).length).toBe(13);

        await decidePendingResident(A, ADMIN, NEIGHBOR, true);
        expect(state.db.tables.profiles.find(row => row.id === NEIGHBOR)).toMatchObject({ residence_verified: true, community_id: A });
        // Ya validado: no se vuelve a decidir.
        await expect(decidePendingResident(A, ADMIN, NEIGHBOR, false)).rejects.toMatchObject({ status: 409 });
    });

    it('quitar a quien no vive ahí le saca la comunidad', async () => {
        const removed = '66666666-6666-4666-8666-666666666666';
        state.db.tables.profiles.push({ id: removed, community_id: A, role: 'resident', residence_verified: false, name: 'X', email: 'x@x.cl', created_at: '2026-11-13T10:00:00Z' });
        state.db.tables.communities[0].managed = true;
        const { decidePendingResident } = await import('@/lib/onboarding/neighborBuildings');
        await decidePendingResident(A, ADMIN, removed, false);
        expect(state.db.tables.profiles.find(row => row.id === removed)).toMatchObject({ community_id: null, unit_id: null });
        expect(state.db.tables.operation_events[0]).toMatchObject({ action: 'resident.removed_unverified' });
    });
});

describe('unidades y vecinos sin validar', () => {
    it('al entregar el edificio, quien dijo ser del 504 deja de estar ligado a la 504', async () => {
        const fake = '77777777-7777-4777-8777-777777777777';
        state.db.tables.profiles.push({ id: fake, community_id: A, role: 'resident', residence_verified: false, unit_id: 'u-504', name: 'Falso', email: 'f@x.cl', department_number: '504', created_at: '2026-11-13T10:00:00Z' });
        state.db.tables.units.push({ id: 'u-504', community_id: A, number: '504', owner_id: fake, resident_profile_id: fake });
        const { activateBuilding } = await import('@/lib/onboarding/neighborBuildings');
        await activateBuilding(A, ACTOR);
        expect(state.db.tables.units[0]).toMatchObject({ owner_id: null, resident_profile_id: null });
        expect(state.db.tables.profiles.find(row => row.id === fake)).toMatchObject({ unit_id: null });
    });

    it('validar lo liga a su unidad; quitar suelta la que tenía', async () => {
        const real = '88888888-8888-4888-8888-888888888888';
        const fake = '99999999-9999-4999-8999-999999999999';
        state.db.tables.communities[0].managed = true;
        state.db.tables.units.push({ id: 'u-301', community_id: A, number: '301', owner_id: fake, resident_profile_id: null });
        state.db.tables.profiles.push(
            { id: real, community_id: A, role: 'resident', residence_verified: false, unit_id: null, name: 'Real', email: 'r@x.cl', department_number: '301', created_at: '2026-11-13T10:00:00Z' },
            { id: fake, community_id: A, role: 'resident', residence_verified: false, unit_id: 'u-301', name: 'Falso', email: 'f@x.cl', department_number: '301', created_at: '2026-11-13T10:00:00Z' },
        );
        const { decidePendingResident } = await import('@/lib/onboarding/neighborBuildings');
        await decidePendingResident(A, ADMIN, fake, false);
        expect(state.db.tables.units[0]).toMatchObject({ owner_id: null });
        await decidePendingResident(A, ADMIN, real, true);
        expect(state.db.tables.profiles.find(row => row.id === real)).toMatchObject({ residence_verified: true, unit_id: 'u-301' });
        expect(state.db.tables.units[0]).toMatchObject({ owner_id: real, resident_profile_id: real });
    });
});
