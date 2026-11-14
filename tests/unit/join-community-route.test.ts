/**
 * Elegir edificio después de entrar con Google (/api/auth/join-community):
 * nadie toma un departamento ajeno, una solicitud perdedora no toma unidades,
 * sin consentimientos guardados no se completa, y no quedan edificios huérfanos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

vi.mock('server-only', () => ({}));
const USER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const MANAGED = '33333333-3333-4333-8333-333333333333';
const state: { db: FakeDb } = { db: createFakeDb() };
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(state.db),
    supabaseAdmin: new Proxy({}, { get: (_target, key) => (fakeClient(state.db) as unknown as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER, email: 'ana@gmail.com' } } }) } }),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));
vi.mock('@/lib/onboarding/neighborBuildings', () => ({ noteResidentThreshold: async () => undefined }));
vi.setConfig({ testTimeout: 60_000 });

const consent = { acceptTerms: true, acceptPrivacy: true, whatsappOptIn: false };

function request(body: Record<string, unknown>) {
    return new NextRequest('https://conviveconnect.com/api/auth/join-community', { method: 'POST', body: JSON.stringify(body) });
}

beforeEach(() => {
    state.db = createFakeDb({
        profiles: [{ id: USER, community_id: null, role: 'resident' }],
        communities: [{ id: MANAGED, name: 'Los Aromos', managed: true, resident_code: 'RES-AROMOS', concierge_code: 'CON-AROMOS', admin_code: 'ADM-AROMOS' }],
        units: [{ id: 'u-504', community_id: MANAGED, number: '504', owner_id: OTHER, resident_profile_id: OTHER }],
        privacy_consent_events: [],
        ai_budgets: [],
    });
});

describe('unirse a un edificio después de Google', () => {
    it('no se liga a un departamento que ya es de otra persona', async () => {
        const { POST } = await import('@/app/api/auth/join-community/route');
        const response = await POST(request({ mode: 'code', accessCode: 'RES-AROMOS', departmentNumber: '504', ...consent }));
        expect(response.status).toBe(409);
        expect((await response.json()).code).toBe('UNIT_TAKEN');
        expect(state.db.tables.profiles[0]).toMatchObject({ community_id: null });
        expect(state.db.tables.units[0]).toMatchObject({ owner_id: OTHER });
    });

    it('con un departamento libre entra validado y con su unidad', async () => {
        const { POST } = await import('@/app/api/auth/join-community/route');
        const response = await POST(request({ mode: 'code', accessCode: 'RES-AROMOS', departmentNumber: '701', ...consent }));
        expect(response.status).toBe(200);
        const profile = state.db.tables.profiles[0];
        expect(profile).toMatchObject({ community_id: MANAGED, residence_verified: true });
        expect(state.db.tables.units.find(unit => unit.id === profile.unit_id)).toMatchObject({ owner_id: USER, resident_profile_id: USER });
        expect(state.db.tables.privacy_consent_events).toHaveLength(2);
    });

    it('si otra solicitud ya le asignó edificio, esta no toma ninguna unidad', async () => {
        const { POST } = await import('@/app/api/auth/join-community/route');
        // La primera lectura ve el perfil sin edificio; justo antes de asignar, otra solicitud ganó.
        const originalFrom = fakeClient(state.db).from;
        let profileReads = 0;
        const raced = new Proxy(fakeClient(state.db), {
            get(target, key) {
                if (key !== 'from') return (target as unknown as Record<string | symbol, unknown>)[key];
                return (table: string) => {
                    if (table === 'profiles' && ++profileReads === 2) state.db.tables.profiles[0].community_id = 'otra';
                    return originalFrom(table);
                };
            },
        });
        const admin = await import('@/lib/supabase/supabaseAdmin');
        vi.spyOn(admin, 'getSupabaseAdmin').mockReturnValue(raced as never);
        const response = await POST(request({ mode: 'code', accessCode: 'RES-AROMOS', departmentNumber: '701', ...consent }));
        expect(response.status).toBe(409);
        expect(state.db.tables.units.filter(unit => unit.owner_id === USER)).toHaveLength(0);
        vi.restoreAllMocks();
    });

    it('sin departamento no crea un edificio huérfano', async () => {
        const { POST } = await import('@/app/api/auth/join-community/route');
        const address = { label: 'Av. Providencia 1234, Providencia', placeId: 'mapbox.9', latitude: -33.4263, longitude: -70.617, source: 'mapbox' };
        const response = await POST(request({ mode: 'address', address, buildingName: 'Edificio Nuevo', departmentNumber: '', ...consent }));
        expect(response.status).toBe(400);
        expect(state.db.tables.communities).toHaveLength(1);
    });
});
