/**
 * Las últimas brechas: borrar publicaciones, convenios, perfil y fotos de
 * maestros, espacios comunes y dueño de unidad. Vigilan los permisos de las
 * rutas: lo propio o la administración de la comunidad.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const media = vi.hoisted(() => ({ deleteWorkPhoto: vi.fn(async () => undefined), listWorkPhotos: vi.fn(async () => []) }));
vi.mock('@/lib/services/providerMedia', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/services/providerMedia')>();
    return { ...real, deleteWorkPhoto: media.deleteWorkPhoto, listWorkPhotos: media.listWorkPhotos };
});
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: vi.fn(async () => undefined), getRequestId: () => null }));

import { createAmenityForAdmin, deleteMarketplaceItem, deleteProviderPhoto, updateCommunityDeal, updateProviderProfile } from '@/lib/coco/finalGapTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTRA = 'bbbbbbbb-bbbb-4bbb-9bbb-bbbbbbbbbbbb';
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const OTRO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const vecina = { id: VECINA, role: 'resident', communityId: COMUNIDAD };
const admin = { id: OTRO, role: 'admin', communityId: COMUNIDAD };

function fakeDb(tables: Record<string, Row[]>) {
    const calls: { table: string; op: string; filters: [string, unknown][]; values?: Row }[] = [];
    const from = (table: string) => {
        const call = { table, op: 'select', filters: [] as [string, unknown][], values: undefined as Row | undefined };
        calls.push(call);
        const b: Record<string, unknown> = {};
        b.eq = (col: string, val: unknown) => { call.filters.push([col, val]); return b; };
        for (const m of ['select', 'limit', 'ilike']) b[m] = () => b;
        b.update = (values: Row) => { call.op = 'update'; call.values = values; return b; };
        b.insert = (values: Row) => { call.op = 'insert'; call.values = values; return b; };
        b.delete = () => { call.op = 'delete'; return b; };
        b.maybeSingle = async () => ({ data: call.op === 'select' ? (tables[table] ?? [])[0] ?? null : null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: call.op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    it('las de la administración no las alcanza un residente', () => {
        for (const tool of ['update_community_deal', 'delete_deal_quote', 'create_amenity', 'set_unit_owner']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
        }
    });
    it('todas las que escriben piden confirmación', () => {
        for (const tool of ['delete_marketplace_item', 'update_community_deal', 'delete_deal_quote', 'update_provider_profile', 'delete_provider_photo', 'create_amenity', 'set_unit_owner']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('permisos', () => {
    it('un residente solo busca sus propias publicaciones para borrar', async () => {
        const { db, calls } = fakeDb({ marketplace_items: [{ id: ID, title: 'Silla', seller_id: VECINA, community_id: COMUNIDAD }] });
        await deleteMarketplaceItem(db, vecina, { title: 'silla' });
        expect(calls[0].filters).toContainEqual(['seller_id', VECINA]);
        expect(calls.some(c => c.op === 'delete')).toBe(true);
    });

    it('la administración modera cualquier publicación de la comunidad', async () => {
        const { db, calls } = fakeDb({ marketplace_items: [{ id: ID, title: 'Silla', seller_id: VECINA, community_id: COMUNIDAD }] });
        await deleteMarketplaceItem(db, admin, { title: 'silla' });
        expect(calls[0].filters).not.toContainEqual(['seller_id', OTRO]);
    });

    it('nadie edita el perfil de un maestro ajeno', async () => {
        const { db, calls } = fakeDb({ service_providers: [{ id: ID, name: 'Gasfiter Juan', user_id: OTRO, community_id: OTRA }] });
        const result = await updateProviderProfile(db, vecina, { provider_id: ID, fields: { bio: 'hola' } }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('el maestro edita lo suyo, pero no se verifica a sí mismo', async () => {
        const { db, calls } = fakeDb({ service_providers: [{ id: ID, name: 'Gasfiter Ana', user_id: VECINA, community_id: COMUNIDAD }] });
        await updateProviderProfile(db, vecina, { fields: { bio: 'Gasfitería general', verified: true } });
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toEqual({ bio: 'Gasfitería general' });
    });

    it('borrar fotos de un maestro ajeno no llega a la lógica de fotos', async () => {
        media.deleteWorkPhoto.mockClear();
        const { db } = fakeDb({ service_providers: [{ id: ID, name: 'Juan', user_id: OTRO, community_id: OTRA }] });
        const result = await deleteProviderPhoto(db, vecina, { provider_id: ID, photo_id: ID }) as Row;
        expect(result.error).toBeTruthy();
        expect(media.deleteWorkPhoto).not.toHaveBeenCalled();
    });

    it('un convenio de otra comunidad no se toca', async () => {
        const { db, calls } = fakeDb({ community_deals: [{ id: ID, title: 'Internet', community_id: OTRA }] });
        const result = await updateCommunityDeal(db, COMUNIDAD, { deal_id: ID, status: 'active' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });
});

describe('espacios comunes', () => {
    it('no duplica un espacio con el mismo nombre', async () => {
        const { db, calls } = fakeDb({ amenities: [{ id: ID }] });
        const result = await createAmenityForAdmin(db, COMUNIDAD, { name: 'Quincho' }) as Row;
        expect(result.error).toMatch(/Ya hay/);
        expect(calls.some(c => c.op === 'insert')).toBe(false);
    });

    it('crea uno nuevo activo en la comunidad', async () => {
        const { db, calls } = fakeDb({ amenities: [] });
        await createAmenityForAdmin(db, COMUNIDAD, { name: 'Sala multiuso', max_capacity: 20 });
        expect(calls.find(c => c.op === 'insert')?.values).toMatchObject({ community_id: COMUNIDAD, name: 'Sala multiuso', max_capacity: 20, is_active: true });
    });
});
