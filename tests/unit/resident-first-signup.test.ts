/**
 * Entrada por residente (docs/comercial/entrada-por-residente.md): encontrar
 * el edificio por dirección o crear su comunidad sin administrar, el modo
 * vecino y las guardas de la base.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createFakeDb, fakeClient } from '../fixtures/fakeSupabase';
import { asServiceRole, asUser, createParkingDb, seedCommunity } from '../fixtures/parkingChargesDb';

vi.mock('server-only', () => ({}));
vi.setConfig({ testTimeout: 60_000, hookTimeout: 120_000 });

import {
    UNMANAGED_AI_BUDGET, createUnmanagedCommunity, distanceMeters, findBuildingForAddress, parseBuildingAddress,
} from '@/lib/onboarding/residentBuilding';
import { NEIGHBOR_MODE_BLOCKED_TOOLS, neighborModeGateFor } from '@/lib/neighborMode';

const address = { label: 'Av. Providencia 1234, Providencia', placeId: 'mapbox.123', latitude: -33.4263, longitude: -70.6170, source: 'mapbox' as const };

describe('dirección del edificio', () => {
    it('valida la sugerencia del geocodificador y rechaza coordenadas fuera de Chile', () => {
        expect(parseBuildingAddress(address)).toEqual(address);
        expect(parseBuildingAddress({ ...address, latitude: 40.4 })).toBeNull();
        expect(parseBuildingAddress({ ...address, source: 'google' })).toBeNull();
        expect(parseBuildingAddress({ ...address, label: 'x' })).toBeNull();
    });

    it('mide distancias en metros', () => {
        expect(Math.round(distanceMeters(-33.4263, -70.6170, -33.4266, -70.6170))).toBe(33);
    });
});

describe('buscar o crear el edificio', () => {
    it('encuentra por place_id y, si no, por cercanía; una administrada manda', async () => {
        const db = createFakeDb({ communities: [
            { id: 'c-near', name: 'Vecinos', managed: false, resident_code: 'RES-A', address_place_id: 'nominatim.9', address_latitude: -33.42645, address_longitude: -70.61702 },
            { id: 'c-far', name: 'Lejos', managed: true, resident_code: 'RES-B', address_place_id: 'x', address_latitude: -33.43, address_longitude: -70.62 },
        ] });
        const admin = fakeClient(db) as unknown as SupabaseClient;
        expect(await findBuildingForAddress(admin, address)).toMatchObject({ id: 'c-near', managed: false });
        db.tables.communities.push({ id: 'c-admin', name: 'Administrado', managed: true, resident_code: 'RES-C', address_place_id: 'otro', address_latitude: -33.4263, address_longitude: -70.6171 });
        expect(await findBuildingForAddress(admin, address)).toMatchObject({ id: 'c-admin', managed: true });
        expect(await findBuildingForAddress(admin, { ...address, placeId: 'x', latitude: -33.5, longitude: -70.7 })).toMatchObject({ id: 'c-far' });
    });

    it('crea la comunidad sin administrar con presupuesto de IA bajo', async () => {
        const db = createFakeDb({ communities: [], ai_budgets: [] });
        const admin = fakeClient(db) as unknown as SupabaseClient;
        const created = await createUnmanagedCommunity(admin, 'Edificio Los Aromos', address);
        expect(created.managed).toBe(false);
        expect(db.tables.communities[0]).toMatchObject({ name: 'Edificio Los Aromos', managed: false, address_place_id: 'mapbox.123' });
        expect(db.tables.ai_budgets[0]).toMatchObject({ community_id: created.id, plan: 'demo', resident_daily_token_limit: UNMANAGED_AI_BUDGET.resident_daily_token_limit });
    });
});

describe('modo vecino', () => {
    it('las pantallas de la administración muestran la invitación; las de vecinos no', () => {
        for (const path of ['/expenses', '/amenities', '/votaciones/asambleas', '/estacionamientos', '/resident/packages', '/feed']) {
            expect(neighborModeGateFor(path), path).not.toBeNull();
        }
        for (const path of ['/home', '/chat', '/marketplace', '/resident/supermercado', '/services', '/directorio']) {
            expect(neighborModeGateFor(path), path).toBeNull();
        }
    });

    it('CoCo no ofrece gastos, reservas, votaciones ni estacionamientos', () => {
        for (const tool of ['get_payment_status', 'create_reservation', 'vote_in_poll', 'book_parking', 'register_visitor']) {
            expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
        }
        for (const tool of ['compare_shopping_list', 'publish_marketplace_item', 'request_service', 'rate_provider']) {
            expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(false);
        }
    });
});

describe('guardas de la base (Postgres real)', () => {
    let db: PGlite;
    beforeAll(async () => {
        db = await createParkingDb();
        await db.exec(`
          ALTER TABLE public.communities ADD COLUMN IF NOT EXISTS address_place_id TEXT;
          GRANT SELECT, UPDATE ON public.communities, public.profiles TO authenticated;
          CREATE POLICY "read_profiles" ON public.profiles FOR SELECT USING (true);
          CREATE POLICY "read_communities" ON public.communities FOR SELECT USING (true);
          CREATE POLICY "own_profile_update" ON public.profiles FOR UPDATE USING (id = auth.uid());
          CREATE POLICY "admin_profile_update" ON public.profiles FOR UPDATE USING (community_id = public.get_my_community_id() AND public.get_my_role() = 'admin');
          CREATE POLICY "admin_community_update" ON public.communities FOR UPDATE USING (id = public.get_my_community_id() AND public.get_my_role() = 'admin');
        `);
        await db.exec(`ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY; ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;`).catch(() => undefined);
        await db.exec(readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114140000_unmanaged_communities.sql'), 'utf8'));
    });

    it('nadie fuera del servidor marca una comunidad como administrada', async () => {
        const community = await seedCommunity(db);
        await asUser(db, community.adminId, async () => {
            await expect(db.query('UPDATE public.communities SET managed = false WHERE id = $1', [community.communityId])).rejects.toThrow(/Convive/);
        });
        await asServiceRole(db, () => db.query('UPDATE public.communities SET managed = false WHERE id = $1', [community.communityId]));
    });

    it('un vecino no se autovalida; la administración de un edificio administrado sí lo valida', async () => {
        const community = await seedCommunity(db);
        await asServiceRole(db, () => db.query('UPDATE public.profiles SET residence_verified = false WHERE id = $1', [community.residentId]));
        await asUser(db, community.residentId, async () => {
            await expect(db.query('UPDATE public.profiles SET residence_verified = true WHERE id = $1', [community.residentId])).rejects.toThrow(/administración/);
        });
        await asUser(db, community.adminId, () => db.query('UPDATE public.profiles SET residence_verified = true WHERE id = $1', [community.residentId]));
        const { rows } = await db.query<{ residence_verified: boolean }>('SELECT residence_verified FROM public.profiles WHERE id = $1', [community.residentId]);
        expect(rows[0].residence_verified).toBe(true);
    });
});
