/**
 * Flujos 2 y 3 — Cobranza del Agente Operador (fase 1) y convenios de pago,
 * de punta a punta sobre Postgres real (PGlite) con todas las migraciones.
 *
 *  - Cobranza: una unidad atrasada entra en la escalera (recordatorio,
 *    segundo aviso a 15 días, propuesta de convenio a 30); pagar la saca. Los
 *    avisos van sin montos, sin lenguaje de deudor y con una salida.
 *  - Convenio: preview (solo lee) → propose (herramienta del Agent Center) →
 *    vigente al abrirlo (sin comité) o al aprobarlo el comité → la primera
 *    cuota vence ese día y las siguientes el día 5 con ≥15 días → pagar la
 *    primera cuota habilita a la unidad en el certificado de hábiles.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { createMoneyDb } from '../fixtures/moneyDb';
import { createPgliteSupabase } from '../fixtures/supabasePglite';
import {
    addDaysIso, asUser, chileMonth, chileToday, DEBTOR_PATTERN, expectLedgerInvariant, MONEY_PATTERN,
    seedMoneyCommunity, type MoneyCommunity,
} from '../fixtures/moneyFlows';

const admin = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/supabase/supabaseAdmin', () => ({
    getSupabaseAdmin: () => admin.client,
    supabaseAdmin: new Proxy({}, { get: (_target, property) => (admin.client as Record<string | symbol, unknown>)[property] }),
}));
// La redacción con IA de asambleas no participa: se usa el texto determinista.
vi.mock('@/lib/assemblies/aiWriter', () => ({ writeAssemblyProse: async () => null }));

import { createUnitExpense } from '@/lib/finance/billingService';
import { recordPayment } from '@/lib/finance/collectionService';
import { decideAgreementReview, listAgreements, payInstallment } from '@/lib/finance/agreementService';
import { AGREEMENT_MIN_DAYS_TO_SECOND_INSTALLMENT, AGREEMENT_MONTHLY_DUE_DAY } from '@/lib/finance/operationalFlows';
import { readCollectionExpenses, resolveCollectionRecipients, storeCollectionNotifications, verifyCollectionNotifications } from '@/lib/agent-center/collection';
import { executeAgentTool } from '@/lib/agent-center/agentTools';
import { issueEligibilityCertificate } from '@/lib/assemblies/service';
import { evaluateEligibility } from '@/lib/assemblies/eligibilityService';

let db: PGlite;

beforeAll(async () => {
    ({ db } = await createMoneyDb());
    admin.client = createPgliteSupabase(db);
});

const today = () => chileToday();

/** Cobro puntual de una unidad por el mismo camino que usa el Agent Center. */
async function chargeUnit(c: MoneyCommunity, unitIndex: number, daysAgo: number, amount = 80_000, monthOffset = -1) {
    const unit = c.units[unitIndex];
    const { expense } = await createUnitExpense(c.communityId, c.adminId, {
        unitId: unit.id, month: chileMonth(monthOffset), amount, dueDate: addDaysIso(today(), -daysAgo),
    });
    return expense;
}

const adminProfile = (c: MoneyCommunity) => ({ id: c.adminId, role: 'admin' as const, community_id: c.communityId });

function expectCommunityTone(texts: string[]) {
    for (const text of texts) {
        expect(text, text).not.toMatch(MONEY_PATTERN);
        expect(text, text).not.toMatch(DEBTOR_PATTERN);
    }
}

describe('cobranza: escalera del Agente Operador', () => {
    it('cada unidad atrasada entra en su etapa, con avisos sin montos ni lenguaje de deudor; pagar la saca', async () => {
        const c = await seedMoneyCommunity(db, { shares: [250, 250, 250, 250] });
        await chargeUnit(c, 0, 3);    // recordatorio
        await chargeUnit(c, 1, 20);   // segundo aviso
        const old = await chargeUnit(c, 2, 40); // propuesta de convenio
        const paid = await chargeUnit(c, 3, 40);
        await recordPayment(c.communityId, c.adminId, {
            unitId: c.units[3].id, amount: paid.amount, paidAt: today(), method: 'transfer', expenseId: paid.id,
        });

        const debts = await readCollectionExpenses(c.communityId);
        expect(new Set(debts.map(row => row.unit_id))).toEqual(new Set([c.units[0].id, c.units[1].id, c.units[2].id]));

        const plan = await resolveCollectionRecipients(c.communityId, debts, today());
        const byUser = new Map(plan.notifications.map(item => [item.user_id, item]));
        expect(byUser.get(c.units[0].ownerId)?.title).toBe('Tu aporte a la comunidad');
        expect(byUser.get(c.units[1].ownerId)?.title).toBe('¿Te podemos ayudar con tu cuenta?');
        expect(byUser.get(c.units[2].ownerId)?.title).toBe('Busquemos juntos una solución');
        expect(byUser.has(c.units[3].ownerId)).toBe(false);
        expect(plan.agreementCandidates?.map(item => item.unitId)).toEqual([c.units[2].id]);

        // Tono: sin montos, sin lenguaje de deudor ni amenazas, y siempre una salida.
        expectCommunityTone(plan.notifications.flatMap(item => [item.title, item.body]));
        for (const item of plan.notifications) expect(item.body).toMatch(/escríbenos|convenio|estado de cuenta/i);
        expect(byUser.get(c.units[2].ownerId)!.body).toMatch(/convenio en cuotas/);
        // Al admin sí se le sugiere ofrecer convenio (texto interno, sin montos).
        expect(plan.adminNotifications?.map(item => item.user_id)).toEqual([c.adminId]);
        expect(plan.adminNotifications![0].body).not.toMatch(MONEY_PATTERN);

        // Se guardan solo en la app y reintentar no duplica.
        const ids = await storeCollectionNotifications(plan);
        await storeCollectionNotifications(plan);
        expect(await verifyCollectionNotifications(c.communityId, ids)).toBe(ids.length);
        const { rows: stored } = await db.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.notifications WHERE community_id = $1 AND category = 'finance_collection'`, [c.communityId]);
        expect(stored[0].n).toBe(ids.length);
        // Cada residente lee su aviso, no el de los vecinos (RLS).
        const own = await asUser(db, c.units[2].ownerId, tx => tx.query<{ user_id: string }>(
            `SELECT user_id FROM public.notifications WHERE category = 'finance_collection'`));
        expect(new Set(own.rows.map(row => row.user_id))).toEqual(new Set([c.units[2].ownerId]));

        // Pagar saca a la unidad de la escalera.
        await recordPayment(c.communityId, c.adminId, {
            unitId: c.units[2].id, amount: old.amount, paidAt: today(), method: 'transfer', expenseId: old.id,
        });
        const after = await resolveCollectionRecipients(c.communityId, await readCollectionExpenses(c.communityId), today());
        expect(after.notifications.map(item => item.user_id).sort()).toEqual([c.units[0].ownerId, c.units[1].ownerId].sort());
        expect(after.agreementCandidates).toEqual([]);
        await expectLedgerInvariant(db, c.communityId);
    });

    it('una multa pendiente también es deuda y un abono parcial no saca a la unidad', async () => {
        const c = await seedMoneyCommunity(db, { shares: [500, 500] });
        const expense = await chargeUnit(c, 0, 16);
        await recordPayment(c.communityId, c.adminId, {
            unitId: c.units[0].id, amount: expense.amount - 1, paidAt: today(), method: 'cash', expenseId: expense.id,
        });
        const plan = await resolveCollectionRecipients(c.communityId, await readCollectionExpenses(c.communityId), today());
        expect(plan.notifications.map(item => [item.user_id, item.title])).toEqual([[c.units[0].ownerId, '¿Te podemos ayudar con tu cuenta?']]);
        await expectLedgerInvariant(db, c.communityId);
    });
});

/** Asamblea en curso, con un punto sin abrir (lo mínimo para emitir el certificado). */
async function assemblyInProgress(c: MoneyCommunity) {
    const id = crypto.randomUUID();
    await db.query(`INSERT INTO public.assemblies (id, community_id, title, session_type, modality, scheduled_at, status, citation_text, cited_at, started_at)
        VALUES ($1, $2, 'Asamblea ordinaria', 'ordinary', 'in_person', now(), 'in_progress', 'Citación', now() - interval '7 days', now())`, [id, c.communityId]);
    await db.query(`INSERT INTO public.assembly_agenda_items (assembly_id, community_id, position, matter_code, title, quorum_class)
        VALUES ($1, $2, 1, 'ord_rendicion_cuentas', 'Cuenta de la administración', 'ordinary')`, [id, c.communityId]);
    return id;
}

async function certificate(c: MoneyCommunity, assemblyId: string) {
    await issueEligibilityCertificate({ id: c.adminId, role: 'admin', communityId: c.communityId, unitId: null }, assemblyId);
    const { rows: [cert] } = await db.query<{ id: string; eligible_units: number; total_units: number }>(
        `SELECT id, eligible_units, total_units FROM public.assembly_eligibility_certificates WHERE assembly_id = $1 AND status = 'current'`, [assemblyId]);
    const { rows: units } = await db.query<{ unit_id: string; eligible: boolean; basis: string }>(
        'SELECT unit_id::text, eligible, basis FROM public.assembly_eligibility_units WHERE certificate_id = $1', [cert.id]);
    return { cert, units: new Map(units.map(row => [row.unit_id, row])) };
}

function expectAgreementDates(dates: string[], signedOn: string) {
    expect(dates[0]).toBe(signedOn);
    const second = dates[1];
    expect(Number(second.slice(8, 10))).toBe(AGREEMENT_MONTHLY_DUE_DAY);
    const gap = (Date.parse(`${second}T00:00:00Z`) - Date.parse(`${signedOn}T00:00:00Z`)) / 86_400_000;
    expect(gap).toBeGreaterThanOrEqual(AGREEMENT_MIN_DAYS_TO_SECOND_INSTALLMENT);
    // Es el PRIMER día 5 que cumple los 15 días: el anterior no alcanzaba.
    expect(gap - 31).toBeLessThan(AGREEMENT_MIN_DAYS_TO_SECOND_INSTALLMENT);
    for (let index = 2; index < dates.length; index += 1) {
        expect(Number(dates[index].slice(8, 10))).toBe(AGREEMENT_MONTHLY_DUE_DAY);
        const previous = new Date(`${dates[index - 1]}T12:00:00Z`);
        previous.setUTCMonth(previous.getUTCMonth() + 1);
        expect(dates[index]).toBe(previous.toISOString().slice(0, 10));
    }
}

describe('convenio de pago: preview → propose → firma → primera cuota → hábil', () => {
    it('sin comité: queda firmado al abrirlo y pagar la primera cuota habilita para votar', async () => {
        const c = await seedMoneyCommunity(db, { shares: [400, 300, 300] });
        const debt = await chargeUnit(c, 0, 45, 120_000);
        const unit = c.units[0];
        const assemblyId = await assemblyInProgress(c);

        // Antes del convenio la unidad no es hábil; el resto sí.
        let cert = await certificate(c, assemblyId);
        expect(cert.units.get(unit.id)).toMatchObject({ eligible: false });
        expect(cert.cert).toMatchObject({ total_units: 3, eligible_units: 2 });

        // preview solo lee.
        const preview = await executeAgentTool('preview_payment_agreement', { unitId: unit.id }, adminProfile(c));
        const proposal = preview.data as { totalAmount: number; installmentCount: number; startDate: string };
        expect(proposal.totalAmount).toBe(debt.amount);
        expect(proposal.startDate).toBe(today());
        const { rows: none } = await db.query('SELECT 1 FROM public.payment_agreements WHERE community_id = $1', [c.communityId]);
        expect(none).toHaveLength(0);
        // Proponer es solo de administración.
        await expect(executeAgentTool('propose_payment_agreement', { unitId: unit.id },
            { id: unit.ownerId, role: 'resident', community_id: c.communityId })).rejects.toThrow(/rol/);

        const proposed = await executeAgentTool('propose_payment_agreement', { unitId: unit.id }, adminProfile(c));
        const agreementId = (proposed.data as { agreementId: string; status: string }).agreementId;
        expect((proposed.data as { status: string }).status).toBe('active');
        // Un segundo convenio abierto para la misma unidad no corresponde.
        await expect(executeAgentTool('propose_payment_agreement', { unitId: unit.id }, adminProfile(c))).rejects.toThrow(/ya tiene un convenio/);

        const [agreement] = await listAgreements(c.communityId);
        expect(agreement).toMatchObject({ id: agreementId, status: 'active', totalAmount: debt.amount, installmentCount: proposal.installmentCount });
        expect(agreement.installments.reduce((sum, item) => sum + item.amount, 0)).toBe(debt.amount);
        expectAgreementDates(agreement.installments.map(item => item.dueDate), today());

        // Aviso al propietario: en positivo, sin montos ni lenguaje de deudor.
        const { rows: notices } = await db.query<{ title: string; body: string }>(
            `SELECT title, body FROM public.notifications WHERE user_id = $1 AND category = 'finance_agreement'`, [unit.ownerId]);
        expect(notices).toHaveLength(1);
        expect(notices[0].body).toMatch(/quedas habilitado para votar/);
        expectCommunityTone([notices[0].title, notices[0].body]);

        // Firmado pero sin pagar la primera cuota: todavía no es hábil.
        cert = await certificate(c, assemblyId);
        expect(cert.units.get(unit.id)).toMatchObject({ eligible: false });

        // Con convenio vigente, la cobranza no insiste.
        const plan = await resolveCollectionRecipients(c.communityId, await readCollectionExpenses(c.communityId), today());
        expect(plan.notifications.some(item => item.user_id === unit.ownerId)).toBe(false);
        expect(plan.skippedWithAgreement).toBe(1);

        // Paga la primera cuota en el acto → hábil en el certificado reemitido.
        const first = agreement.installments[0];
        await payInstallment(c.communityId, c.adminId, { installmentId: first.id, paidAt: today(), method: 'transfer', reference: 'CONV-1' });
        await expect(payInstallment(c.communityId, c.adminId, { installmentId: first.id, paidAt: today(), method: 'transfer', reference: 'CONV-1b' }))
            .rejects.toMatchObject({ code: 'already_paid' });
        cert = await certificate(c, assemblyId);
        expect(cert.units.get(unit.id)).toMatchObject({ eligible: true });
        expect(cert.cert).toMatchObject({ total_units: 3, eligible_units: 3 });
        const { rows: superseded } = await db.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.assembly_eligibility_certificates WHERE assembly_id = $1 AND status = 'superseded'`, [assemblyId]);
        expect(superseded[0].n).toBe(2);

        // La cuota pagada es un pago de la unidad con su asiento; no un segundo ingreso.
        const { rows: payments } = await db.query<{ amount: number }>(
            'SELECT amount::int FROM public.unit_payments WHERE unit_id = $1', [unit.id]);
        expect(payments).toEqual([{ amount: first.amount }]);
        const { rows: agreementJournal } = await db.query(
            `SELECT 1 FROM public.journal_entries WHERE community_id = $1 AND source = 'agreement'`, [c.communityId]);
        expect(agreementJournal).toHaveLength(0);

        // El detalle por unidad del certificado es solo de administración (RLS).
        const asOwner = await asUser(db, c.units[1].ownerId, tx => tx.query(
            'SELECT 1 FROM public.assembly_eligibility_units WHERE assembly_id = $1', [assemblyId]));
        expect(asOwner.rows).toHaveLength(0);
        const asAdmin = await asUser(db, c.adminId, tx => tx.query(
            'SELECT 1 FROM public.assembly_eligibility_units WHERE assembly_id = $1', [assemblyId]));
        expect(asAdmin.rows.length).toBeGreaterThan(0);
        await expectLedgerInvariant(db, c.communityId);
    });

    it('con comité: queda pendiente (no habilita) y se firma el día en que el comité lo aprueba', async () => {
        const c = await seedMoneyCommunity(db, { shares: [500, 500], committee: true });
        const unit = c.units[0];
        await chargeUnit(c, 0, 35, 90_000);
        // La administración lo propone hace 20 días (el comité ya estaba vigente); el comité recién lo aprueba hoy.
        await db.query(`UPDATE public.finance_committee_members SET starts_on = CURRENT_DATE - 60 WHERE community_id = $1`, [c.communityId]);
        const proposedOn = addDaysIso(today(), -20);
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(`${proposedOn}T15:00:00Z`));
        let agreementId: string;
        try {
            const proposed = await executeAgentTool('propose_payment_agreement', { unitId: unit.id, installmentCount: 3 }, adminProfile(c));
            agreementId = (proposed.data as { agreementId: string }).agreementId;
            expect((proposed.data as { status: string }).status).toBe('pending_committee');
        } finally {
            vi.useRealTimers();
        }
        // Fechas provisorias: desde el día de la propuesta.
        expect((await listAgreements(c.communityId))[0].installments[0].dueDate).toBe(proposedOn);

        const cutoff = today();
        const units = c.units.map(item => ({ unitId: item.id, ownerId: item.ownerId, weight: 500 }));
        let eligibility = await evaluateEligibility(c.communityId, units, cutoff);
        expect(eligibility.units.find(item => item.unitId === unit.id)?.eligible).toBe(false);

        // Solo un integrante vigente del comité decide.
        await expect(decideAgreementReview(c.communityId, unit.ownerId, agreementId, 'approved', '')).rejects.toMatchObject({ code: 'not_committee_member' });
        await decideAgreementReview(c.communityId, c.committeeId!, agreementId, 'approved', 'Conversado con la vecina');
        const [agreement] = await listAgreements(c.communityId);
        expect(agreement.status).toBe('active');
        // Se firma el día de la aprobación: las fechas se recalculan desde hoy (no quedan vencidas desde el inicio).
        expectAgreementDates(agreement.installments.map(item => item.dueDate), today());

        await payInstallment(c.communityId, c.adminId, { installmentId: agreement.installments[0].id, paidAt: today(), method: 'cash' });
        eligibility = await evaluateEligibility(c.communityId, units, cutoff);
        expect(eligibility.units.find(item => item.unitId === unit.id)?.eligible).toBe(true);
        await expectLedgerInvariant(db, c.communityId);
    });

    it('quien tiene dos unidades solo es hábil si está al día en ambas (DS 7 art. 14)', async () => {
        const c = await seedMoneyCommunity(db, { shares: [500, 500] });
        const second = crypto.randomUUID();
        await db.query(`INSERT INTO public.units (id, community_id, number, floor, owner_id, share_permille) VALUES ($1, $2, '201', 2, $3, NULL)`,
            [second, c.communityId, c.units[0].ownerId]);
        await createUnitExpense(c.communityId, c.adminId, { unitId: second, month: chileMonth(-1), amount: 10_000, dueDate: addDaysIso(today(), -10) });
        const units = [...c.units.map(item => ({ unitId: item.id, ownerId: item.ownerId, weight: 1 })), { unitId: second, ownerId: c.units[0].ownerId, weight: 1 }];
        const result = await evaluateEligibility(c.communityId, units, today());
        expect(result.units.find(item => item.unitId === c.units[0].id)?.eligible).toBe(false);
        expect(result.units.find(item => item.unitId === c.units[1].id)?.eligible).toBe(true);
    });
});
