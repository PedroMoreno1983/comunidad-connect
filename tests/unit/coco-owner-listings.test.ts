/**
 * El residente administra lo que publicó. Lo que estos tests vigilan: nadie se
 * autoaprueba, solo se toca lo propio, y retirar no borra reservas: borrar un
 * estacionamiento borra en cascada su historial.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { removeMyListing, setMyListingStatus, updateMyListing } from '@/lib/coco/ownerListingTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: Row };
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const OTRO = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const LISTING = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

function fakeDb(tables: Record<string, Row[]>) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        calls.push(call);
        const b: Record<string, unknown> = {};
        b.eq = (col: string, val: unknown) => { call.filters.push(['eq', col, val]); return b; };
        for (const op of ['select', 'limit']) b[op] = () => b;
        b.update = (values: Row) => { call.op = 'update'; call.values = values; return b; };
        b.delete = () => { call.op = 'delete'; return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: call.op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

const spot = (over: Row = {}) => ({ id: LISTING, label: 'E-23', status: 'published', approved_at: '2026-11-01', owner_id: VECINA, ...over });

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    it.each(['list_my_listings', 'update_my_listing', 'set_my_listing_status', 'remove_my_listing'])('%s: residente y bloqueada en modo vecino', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has(tool)).toBe(true);
    });
    it('las que escriben piden confirmación', () => {
        for (const tool of ['update_my_listing', 'set_my_listing_status', 'remove_my_listing']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
});

describe('estado', () => {
    it('pausa lo publicado, solo lo propio', async () => {
        const { db, calls } = fakeDb({ parking_spots: [spot()] });
        const result = await setMyListingStatus(db, VECINA, { kind: 'parking', listing_id: LISTING, action: 'pause' }) as Row;
        expect(result.success).toBe(true);
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toEqual({ status: 'paused' });
        expect(update?.filters).toContainEqual(['eq', 'owner_id', VECINA]);
    });

    it('no se autoaprueba: retomar exige aprobación previa', async () => {
        const { db, calls } = fakeDb({ parking_spots: [spot({ status: 'paused', approved_at: null })] });
        const result = await setMyListingStatus(db, VECINA, { kind: 'parking', listing_id: LISTING, action: 'resume' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });

    it('lo rechazado vuelve a revisión, no a publicado', async () => {
        const { db, calls } = fakeDb({ storage_units: [spot({ status: 'rejected', approved_at: null })] });
        await setMyListingStatus(db, VECINA, { kind: 'storage', listing_id: LISTING, action: 'resubmit' });
        expect(calls.find(c => c.op === 'update')?.values).toEqual({ status: 'pending_approval' });
    });

    it('no toca publicaciones ajenas', async () => {
        const { db, calls } = fakeDb({ parking_spots: [spot({ owner_id: OTRO })] });
        const result = await setMyListingStatus(db, VECINA, { kind: 'parking', listing_id: LISTING, action: 'pause' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'update')).toBe(false);
    });
});

describe('editar y retirar', () => {
    it('edita precio sin tocar el estado', async () => {
        const { db, calls } = fakeDb({ storage_units: [spot()] });
        await updateMyListing(db, VECINA, { kind: 'storage', listing_id: LISTING, monthly_rate: 45000, status: 'published' });
        expect(calls.find(c => c.op === 'update')?.values).toEqual({ monthly_rate: 45000 });
    });

    it('no retira un estacionamiento con reservas: borraría su historial', async () => {
        const { db, calls } = fakeDb({ parking_spots: [spot()], parking_bookings: [{ id: 'b1' }] });
        const result = await removeMyListing(db, VECINA, { kind: 'parking', listing_id: LISTING }) as Row;
        expect(result.error).toMatch(/pausarla/);
        expect(calls.some(c => c.op === 'delete')).toBe(false);
    });

    it('retira uno sin historial', async () => {
        const { db, calls } = fakeDb({ parking_spots: [spot()], parking_bookings: [] });
        const result = await removeMyListing(db, VECINA, { kind: 'parking', listing_id: LISTING }) as Row;
        expect(result.success).toBe(true);
        expect(calls.find(c => c.op === 'delete')?.filters).toContainEqual(['eq', 'owner_id', VECINA]);
    });
});
