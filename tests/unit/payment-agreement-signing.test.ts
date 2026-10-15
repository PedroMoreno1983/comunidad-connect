/**
 * Convenios de pago: la primera cuota vence al firmar (Ley 21.442 art. 6; DS 7
 * art. 9). Sin comité, el convenio se firma al abrirlo; con comité, el día en
 * que el comité lo aprueba, y ahí se recalculan las fechas.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;
interface Call { table: string; op: string; payload?: unknown; filters: [string, unknown][] }

const db = vi.hoisted(() => ({
    calls: [] as Call[],
    committee: [] as { id: string; name: string; email: string }[],
    pendingAgreement: null as Row | null,
    approvedAgreement: null as Row | null,
}));

function query(table: string) {
    const call: Call = { table, op: 'select', filters: [] };
    db.calls.push(call);
    const result = (): { data: unknown; error: null } => {
        if (table === 'payment_agreements' && call.op === 'select' && call.filters.some(([k, v]) => k === 'status' && v === 'pending_committee')) {
            return { data: db.pendingAgreement, error: null };
        }
        if (table === 'payment_agreements' && call.op === 'update') return { data: db.approvedAgreement, error: null };
        if (table === 'payment_agreements' && call.op === 'insert') return { data: { id: 'agreement-1' }, error: null };
        if (table === 'units') return { data: { id: 'unit-1', owner_id: 'owner-1', number: '101', tower: 'A' }, error: null };
        return { data: null, error: null };
    };
    const chain = {
        select: () => chain,
        insert: (payload: unknown) => { call.op = 'insert'; call.payload = payload; return chain; },
        update: (payload: unknown) => { call.op = 'update'; call.payload = payload; return chain; },
        delete: () => { call.op = 'delete'; return chain; },
        eq: (key: string, value: unknown) => { call.filters.push([key, value]); return chain; },
        in: (key: string, value: unknown) => { call.filters.push([key, value]); return chain; },
        order: () => chain,
        maybeSingle: async () => result(),
        single: async () => result(),
        then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
}

vi.mock('@/lib/supabase/supabaseAdmin', () => ({ getSupabaseAdmin: () => ({ from: (table: string) => query(table) }) }));
vi.mock('@/lib/finance/committeeMembers', () => ({
    activeCommitteeMembers: async () => db.committee,
    requireActiveCommitteeMember: async () => undefined,
}));
vi.mock('@/lib/finance/collectionService', () => ({ PAYMENT_METHODS: new Set(['transfer']), reconcileUnitStatuses: async () => undefined }));
vi.mock('@/lib/operations/audit', () => ({ recordOperationEvent: async () => ({ ok: true }) }));
vi.mock('@/lib/agent-center/chileDate', () => ({ chileTodayISO: () => '2026-10-25' }));

import { createAgreement, decideAgreementReview } from '@/lib/finance/agreementService';
import { AGREEMENT_SIGNING_COPY } from '@/lib/finance/agreementCopy';

const installmentInsert = () => db.calls.find(call => call.table === 'payment_agreement_installments' && call.op === 'insert');
const installmentUpdates = () => db.calls.filter(call => call.table === 'payment_agreement_installments' && call.op === 'update');
const notifications = () => db.calls.filter(call => call.table === 'notifications' && call.op === 'insert').map(call => call.payload as Row);

describe('convenio sin comité: se firma al abrirlo', () => {
    beforeEach(() => { db.calls = []; db.committee = []; });

    it('la primera cuota vence hoy y la segunda el primer día 5 a 15 días o más', async () => {
        await createAgreement('c1', 'admin-1', { unitId: 'unit-1', title: 'Convenio', totalAmount: 90_000, installmentCount: 3 }).catch(() => undefined);
        const rows = installmentInsert()?.payload as { due_date: string; sequence_number: number }[];
        expect(rows.map(row => row.due_date)).toEqual(['2026-10-25', '2026-12-05', '2027-01-05']);
        const insert = db.calls.find(call => call.table === 'payment_agreements' && call.op === 'insert')?.payload as Row;
        expect(insert.status).toBe('active');
        const [notice] = notifications();
        expect(String(notice.body)).toContain(AGREEMENT_SIGNING_COPY);
        expect(String(notice.body)).not.toMatch(/\$\s?\d/);
    });
});

describe('convenio con comité: se firma el día en que el comité lo aprueba', () => {
    beforeEach(() => {
        db.calls = [];
        db.pendingAgreement = {
            id: 'agreement-1',
            payment_agreement_installments: [
                { id: 'i2', sequence_number: 2, status: 'pending' },
                { id: 'i1', sequence_number: 1, status: 'pending' },
                { id: 'i3', sequence_number: 3, status: 'pending' },
            ],
        };
        db.approvedAgreement = { id: 'agreement-1', unit_id: 'unit-1', title: 'Convenio', created_by: 'admin-1' };
    });

    it('al aprobar, recalcula las fechas desde el día de la aprobación antes de activarlo', async () => {
        await decideAgreementReview('c1', 'member-1', 'agreement-1', 'approved', '');
        const updates = installmentUpdates().map(call => ({ id: call.filters.find(([k]) => k === 'id')?.[1], due: (call.payload as Row).due_date }));
        expect(updates).toEqual([
            { id: 'i1', due: '2026-10-25' },
            { id: 'i2', due: '2026-12-05' },
            { id: 'i3', due: '2027-01-05' },
        ]);
        // Solo cuotas pendientes, y antes de pasar el convenio a `active`.
        expect(installmentUpdates().every(call => call.filters.some(([k, v]) => k === 'status' && v === 'pending'))).toBe(true);
        const activateIndex = db.calls.findIndex(call => call.table === 'payment_agreements' && call.op === 'update');
        const lastRedate = db.calls.lastIndexOf(installmentUpdates().slice(-1)[0]);
        expect(lastRedate).toBeLessThan(activateIndex);
        const ownerNotice = notifications().find(row => row.user_id === 'owner-1');
        expect(String(ownerNotice?.body)).toContain(AGREEMENT_SIGNING_COPY);
    });

    it('si el convenio ya no está pendiente, no toca las fechas ni lo aprueba', async () => {
        db.pendingAgreement = null;
        await expect(decideAgreementReview('c1', 'member-1', 'agreement-1', 'approved', '')).rejects.toThrow('no está pendiente');
        expect(installmentUpdates()).toHaveLength(0);
        expect(db.calls.some(call => call.table === 'payment_agreements' && call.op === 'update')).toBe(false);
    });

    it('al rechazar, no recalcula fechas', async () => {
        await decideAgreementReview('c1', 'member-1', 'agreement-1', 'rejected', 'Falta conversarlo');
        expect(installmentUpdates()).toHaveLength(0);
    });
});
