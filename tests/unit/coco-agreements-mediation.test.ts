/**
 * Convenios de pago y avance de mediaciones por CoCo. Convenios: sin lógica de
 * dinero propia (agreementService) y con el revisor del comité resuelto sin
 * adivinar. Mediaciones: solo quien la pidió o la administración.
 */

import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const svc = vi.hoisted(() => ({
    createAgreement: vi.fn(async () => ({})),
    cancelAgreement: vi.fn(async () => ({})),
    payInstallment: vi.fn(async () => ({})),
    listAgreements: vi.fn(async () => []),
    activeCommitteeMembers: vi.fn(async () => [] as { id: string; name: string; email: string }[]),
}));
vi.mock('@/lib/finance/agreementService', () => ({
    createAgreement: svc.createAgreement, cancelAgreement: svc.cancelAgreement,
    payInstallment: svc.payInstallment, listAgreements: svc.listAgreements,
}));
vi.mock('@/lib/finance/committeeMembers', () => ({ activeCommitteeMembers: svc.activeCommitteeMembers }));

import { createPaymentAgreement, updateMediationStatus } from '@/lib/coco/agreementTools';
import { TOOL_DEFINITIONS, MUTATING_TOOLS, isToolAllowedForRole } from '@/lib/coco/tools';
import { NEIGHBOR_MODE_BLOCKED_TOOLS } from '@/lib/neighborMode';
import { cocoToolRisk } from '@/lib/agent-center/cocoRisk';

type Row = Record<string, unknown>;
const COMUNIDAD = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ADMIN = 'cccccccc-cccc-4ccc-accc-cccccccccccc';
const VECINA = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const MED = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const M1 = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

function fakeDb(tables: Record<string, Row[]>) {
    const updates: Row[] = [];
    const from = (table: string) => {
        let op = 'select';
        const b: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'limit']) b[m] = () => b;
        b.update = (values: Row) => { op = 'update'; updates.push(values); return b; };
        b.maybeSingle = async () => ({ data: (tables[table] ?? [])[0] ?? null, error: null });
        b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: op === 'select' ? tables[table] ?? [] : null, error: null }).then(ok);
        return b;
    };
    return { db: { from } as unknown as SupabaseClient, updates };
}

describe('cableado', () => {
    const nombres = (TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(t => t.name);
    it('convenios: solo administración y piden confirmación', () => {
        for (const tool of ['list_payment_agreements', 'create_payment_agreement', 'cancel_payment_agreement', 'pay_agreement_installment']) {
            expect(nombres).toContain(tool);
            expect(isToolAllowedForRole(tool, 'admin')).toBe(true);
            expect(isToolAllowedForRole(tool, 'resident')).toBe(false);
        }
        for (const tool of ['create_payment_agreement', 'cancel_payment_agreement', 'pay_agreement_installment', 'update_mediation_status']) {
            expect(MUTATING_TOOLS.has(tool)).toBe(true);
            expect(cocoToolRisk(tool)).toBe('write_high');
        }
    });
    it('mediaciones: residente, bloqueadas en modo vecino', () => {
        expect(isToolAllowedForRole('update_mediation_status', 'resident')).toBe(true);
        expect(NEIGHBOR_MODE_BLOCKED_TOOLS.has('update_mediation_status')).toBe(true);
    });
});

describe('convenios', () => {
    const units = { units: [{ id: 'unit-302', number: '302', tower: 'A' }] };

    it('sin comité, crea sin revisor', async () => {
        svc.activeCommitteeMembers.mockResolvedValueOnce([]);
        const { db } = fakeDb(units);
        const result = await createPaymentAgreement(db, COMUNIDAD, ADMIN, { unit_number: '302', total_amount: 300000, installment_count: 6 }) as Row;
        expect(result.success).toBe(true);
        expect(svc.createAgreement).toHaveBeenLastCalledWith(COMUNIDAD, ADMIN, expect.objectContaining({ unitId: 'unit-302', totalAmount: 300000, installmentCount: 6, reviewerId: undefined }));
    });

    it('con un integrante del comité, lo usa como revisor', async () => {
        svc.activeCommitteeMembers.mockResolvedValueOnce([{ id: M1, name: 'Luis', email: '' }]);
        const { db } = fakeDb(units);
        await createPaymentAgreement(db, COMUNIDAD, ADMIN, { unit_number: '302', total_amount: 300000, installment_count: 6 });
        expect(svc.createAgreement).toHaveBeenLastCalledWith(COMUNIDAD, ADMIN, expect.objectContaining({ reviewerId: M1 }));
    });

    it('con varios, pide elegir y no crea', async () => {
        svc.createAgreement.mockClear();
        svc.activeCommitteeMembers.mockResolvedValueOnce([{ id: M1, name: 'Luis', email: '' }, { id: MED, name: 'Rosa', email: '' }]);
        const { db } = fakeDb(units);
        const result = await createPaymentAgreement(db, COMUNIDAD, ADMIN, { unit_number: '302', total_amount: 300000, installment_count: 6 }) as Row;
        expect(result.comite).toHaveLength(2);
        expect(svc.createAgreement).not.toHaveBeenCalled();
    });
});

describe('mediaciones', () => {
    it('quien la pidió la avanza', async () => {
        const { db, updates } = fakeDb({ neighbor_mediations: [{ id: MED, reporter_id: VECINA, community_id: COMUNIDAD, status: 'drafted' }] });
        const result = await updateMediationStatus(db, { id: VECINA, role: 'resident', communityId: COMUNIDAD }, { mediation_id: MED, status: 'sent' }) as Row;
        expect(result.success).toBe(true);
        expect(updates).toEqual([{ status: 'sent' }]);
    });

    it('otro vecino no', async () => {
        const { db, updates } = fakeDb({ neighbor_mediations: [{ id: MED, reporter_id: VECINA, community_id: COMUNIDAD, status: 'drafted' }] });
        const result = await updateMediationStatus(db, { id: M1, role: 'resident', communityId: COMUNIDAD }, { mediation_id: MED, status: 'agreement' }) as Row;
        expect(result.error).toBeTruthy();
        expect(updates).toHaveLength(0);
    });
});
