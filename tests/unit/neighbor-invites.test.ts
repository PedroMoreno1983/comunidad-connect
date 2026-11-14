/**
 * Invitaciones entre vecinos por WhatsApp: un enlace por persona, que ya trae
 * el edificio; quien entra queda por validar y, en un edificio administrado,
 * sin unidad.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeDb, fakeClient, type FakeDb } from '../fixtures/fakeSupabase';

vi.mock('server-only', () => ({}));
const INVITER = '11111111-1111-4111-8111-111111111111';
const GUEST = '22222222-2222-4222-8222-222222222222';
const MANAGED = '33333333-3333-4333-8333-333333333333';
const state: { db: FakeDb } = { db: createFakeDb() };
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => fakeClient(state.db),
    supabaseAdmin: new Proxy({}, { get: (_target, key) => (fakeClient(state.db) as unknown as Record<string | symbol, unknown>)[key] }),
}));
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: GUEST, email: 'vecina@gmail.com' } } }) } }),
}));
vi.mock('@/lib/security/rateLimit', () => ({ enforceDistributedRateLimit: async () => null }));
vi.mock('@/lib/onboarding/neighborBuildings', () => ({ noteResidentThreshold: async () => undefined }));
vi.setConfig({ testTimeout: 60_000 });

beforeEach(() => {
    state.db = createFakeDb({
        communities: [{ id: MANAGED, name: 'Los Aromos', managed: true, resident_code: 'RES-AROMOS' }],
        profiles: [
            { id: INVITER, name: 'María José Soto', role: 'resident', community_id: MANAGED, communities: { name: 'Los Aromos' } },
            { id: GUEST, community_id: null, role: 'resident' },
        ],
        neighbor_invites: [],
        units: [],
        privacy_consent_events: [],
    });
});

describe('el enlace del residente', () => {
    it('es uno por persona y edificio, con código legible y el mensaje listo', async () => {
        const { getOrCreateInvite, INVITE_CODE } = await import('@/lib/onboarding/neighborInvites');
        const first = await getOrCreateInvite(INVITER);
        const second = await getOrCreateInvite(INVITER);
        expect(first?.code).toMatch(INVITE_CODE);
        expect(second?.code).toBe(first?.code);
        expect(state.db.tables.neighbor_invites).toHaveLength(1);
        expect(first?.url).toMatch(/\/unirse\/[A-Z2-9]{8}$/);
        expect(first?.whatsappUrl).toMatch(/^https:\/\/wa\.me\/\?text=/);
        expect(first?.message).toContain('Los Aromos');
    });

    it('la vista previa muestra solo edificio y nombre de pila; deja de servir si quien invitó se fue', async () => {
        const { getOrCreateInvite, previewInvite } = await import('@/lib/onboarding/neighborInvites');
        const invite = await getOrCreateInvite(INVITER);
        expect(await previewInvite(invite!.code.toLowerCase())).toEqual({ code: invite!.code, buildingName: 'Los Aromos', inviterFirstName: 'María' });
        state.db.tables.profiles[0].community_id = null;
        expect(await previewInvite(invite!.code)).toBeNull();
        expect(await previewInvite('../etc')).toBeNull();
    });
});

describe('entrar por la invitación (después de Google)', () => {
    it('en un edificio administrado queda por validar, sin unidad y con quién lo invitó', async () => {
        const { getOrCreateInvite } = await import('@/lib/onboarding/neighborInvites');
        const invite = await getOrCreateInvite(INVITER);
        const { POST } = await import('@/app/api/auth/join-community/route');
        const response = await POST(new NextRequest('https://conviveconnect.com/api/auth/join-community', {
            method: 'POST',
            body: JSON.stringify({ mode: 'invite', inviteCode: invite!.code, departmentNumber: '504', acceptTerms: true, acceptPrivacy: true, whatsappOptIn: false }),
        }));
        expect(response.status).toBe(200);
        expect(state.db.tables.profiles.find(row => row.id === GUEST)).toMatchObject({
            community_id: MANAGED, residence_verified: false, unit_id: null, invited_by: INVITER, department_number: '504',
        });
        expect(state.db.tables.units).toHaveLength(0);
        expect(state.db.tables.neighbor_invites[0]).toMatchObject({ uses: 1 });
    });

    it('una invitación inválida no asigna edificio', async () => {
        const { POST } = await import('@/app/api/auth/join-community/route');
        const response = await POST(new NextRequest('https://conviveconnect.com/api/auth/join-community', {
            method: 'POST',
            body: JSON.stringify({ mode: 'invite', inviteCode: 'ZZZZZZZZ', departmentNumber: '504', acceptTerms: true, acceptPrivacy: true }),
        }));
        expect(response.status).toBe(400);
        expect(state.db.tables.profiles.find(row => row.id === GUEST)).toMatchObject({ community_id: null });
    });
});
