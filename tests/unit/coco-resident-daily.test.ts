/**
 * Herramientas de uso diario del residente: mensajes del Marketplace, nombre,
 * listas del súper, vehículo y convenio de pago. Vigilan el cableado y, sobre
 * todo, que solo se toque lo propio: nadie escribe en una conversación ajena,
 * le escribe a su propio artículo, ni borra listas de otro.
 */

import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    deleteMyShoppingList,
    messageMarketplaceSeller,
    registerMyVehicle,
    replyMarketplaceConversation,
    updateMyName,
} from '@/lib/coco/residentDailyTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
type Call = { table: string; op: string; filters: [string, string, unknown][]; values?: Row | Row[] };

const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VECINA = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const VENDEDOR = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OTRO = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const ITEM = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CONV = '11111111-2222-4333-8444-555555555555';

/** Cliente falso: filas por tabla; registra filtros, inserts, updates, deletes y upserts. */
function fakeDb(tables: Record<string, Row[]>, opts: { insertResult?: Row } = {}) {
    const calls: Call[] = [];
    const from = (table: string) => {
        const call: Call = { table, op: 'select', filters: [] };
        calls.push(call);
        const b: Record<string, unknown> = {};
        const chain = (op: string) => (col: string, val: unknown) => { call.filters.push([op, col, val]); return b; };
        for (const op of ['eq', 'in', 'ilike', 'or']) b[op] = chain(op);
        for (const op of ['select', 'order', 'limit']) b[op] = () => b;
        for (const op of ['insert', 'update', 'upsert']) b[op] = (values: Row | Row[]) => { call.op = op; call.values = values; return b; };
        b.delete = () => { call.op = 'delete'; return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.single = async () => ({ data: opts.insertResult ?? (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: call.op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, calls };
}

const NUEVAS = ['list_my_marketplace_conversations', 'message_marketplace_seller', 'reply_marketplace_conversation', 'update_my_name', 'delete_shopping_list', 'register_my_vehicle', 'request_payment_agreement'];

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);

    it.each(NUEVAS)('%s existe y la alcanza un residente', (tool) => {
        expect(nombres).toContain(tool);
        expect(isToolAllowedForRole(tool, 'resident')).toBe(true);
    });

    it('las que escriben piden confirmación; leer conversaciones no', () => {
        for (const tool of NUEVAS.filter(t => t !== 'list_my_marketplace_conversations')) {
            expect(MUTATING_TOOLS.has(tool), tool).toBe(true);
            expect(cocoToolRisk(tool), tool).toBe('write_high');
        }
        expect(MUTATING_TOOLS.has('list_my_marketplace_conversations')).toBe(false);
    });

    it('vehículo y convenio dependen de la administración; el marketplace no', () => {
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has('register_my_vehicle')).toBe(true);
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has('request_payment_agreement')).toBe(true);
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has('message_marketplace_seller')).toBe(false);
    });

    it('la administración no compra ni vende en el marketplace', () => {
        expect(isToolAllowedForRole('message_marketplace_seller', 'admin')).toBe(false);
    });
});

describe('mensajes del marketplace', () => {
    it('abre la conversación y escribe como el residente', async () => {
        const { db, calls } = fakeDb({
            marketplace_items: [{ id: ITEM, title: 'Bicicleta', seller_id: VENDEDOR, community_id: COMUNIDAD, status: 'available' }],
            marketplace_conversations: [],
        }, { insertResult: { id: CONV } });
        const result = await messageMarketplaceSeller(db, COMUNIDAD, VECINA, { item_title: 'bici', message: '¿Tiene cambios?' }) as Row;
        expect(result.success).toBe(true);
        const conv = calls.find(c => c.table === 'marketplace_conversations' && c.op === 'insert');
        expect(conv?.values).toMatchObject({ buyer_id: VECINA, seller_id: VENDEDOR, community_id: COMUNIDAD });
        const msg = calls.find(c => c.table === 'marketplace_conversation_messages' && c.op === 'insert');
        expect(msg?.values).toMatchObject({ sender_id: VECINA, content: '¿Tiene cambios?' });
    });

    it('no le escribe a un artículo propio', async () => {
        const { db, calls } = fakeDb({ marketplace_items: [{ id: ITEM, title: 'Silla', seller_id: VECINA, community_id: COMUNIDAD }] });
        const result = await messageMarketplaceSeller(db, COMUNIDAD, VECINA, { item_title: 'silla', message: 'hola' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'insert')).toBe(false);
    });

    it('no responde en una conversación ajena', async () => {
        const { db, calls } = fakeDb({ marketplace_conversations: [{ id: CONV, community_id: COMUNIDAD, buyer_id: OTRO, seller_id: VENDEDOR }] });
        const result = await replyMarketplaceConversation(db, COMUNIDAD, VECINA, { conversation_id: CONV, message: 'hola' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls.some(c => c.op === 'insert')).toBe(false);
    });

    it('sin mensaje no envía nada', async () => {
        const { db, calls } = fakeDb({});
        const result = await replyMarketplaceConversation(db, COMUNIDAD, VECINA, { conversation_id: CONV, message: '  ' }) as Row;
        expect(result.error).toBeTruthy();
        expect(calls).toHaveLength(0);
    });
});

describe('perfil, listas y vehículo', () => {
    it('el nombre se cambia solo en el propio perfil, sin tocar el departamento', async () => {
        const { db, calls } = fakeDb({});
        await updateMyName(db, VECINA, { full_name: 'Ana Pérez', department_number: '999' });
        const update = calls.find(c => c.op === 'update');
        expect(update?.values).toEqual({ name: 'Ana Pérez' });
        expect(update?.filters).toContainEqual(['eq', 'id', VECINA]);
    });

    it('borra solo listas propias', async () => {
        const { db, calls } = fakeDb({ supermarket_saved_lists: [{ id: ITEM, title: 'Semana' }] });
        const result = await deleteMyShoppingList(db, VECINA, { title: 'semana' }) as Row;
        expect(result.success).toBe(true);
        const del = calls.find(c => c.op === 'delete');
        expect(del?.filters).toContainEqual(['eq', 'user_id', VECINA]);
    });

    it('registra el vehículo a nombre del residente y normaliza la patente', async () => {
        const { db, calls } = fakeDb({ profiles: [{ id: VECINA, name: 'Ana' }] });
        const result = await registerMyVehicle(db, VECINA, { plate: 'ab-cd 12', phone: '+56 9 1234 5678', user_id: OTRO }) as Row;
        expect(result.success).toBe(true);
        const up = calls.find(c => c.op === 'upsert');
        expect(up?.values).toMatchObject({ user_id: VECINA, plate: 'ABCD12', full_name: 'Ana' });
    });

    it('rechaza una patente inválida', async () => {
        const { db, calls } = fakeDb({});
        const result = await registerMyVehicle(db, VECINA, { plate: '12', phone: '+56912345678' }) as Row;
        expect(result.error).toMatch(/patente/);
        expect(calls).toHaveLength(0);
    });
});
