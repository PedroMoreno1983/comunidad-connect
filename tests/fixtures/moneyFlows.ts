/**
 * Datos y comprobaciones compartidas por los tests de punta a punta de dinero
 * (tests/e2e-money). Solo el armado (comunidad, personas, unidades) se inserta
 * a mano; todo el flujo que se prueba pasa por los servicios y RPC de la app.
 */

import type { PGlite } from '@electric-sql/pglite';
import { expect } from 'vitest';

const uuid = () => crypto.randomUUID();
let counter = 0;

export interface SeedUnit {
    id: string;
    number: string;
    ownerId: string;
    sharePermille: number | null;
}

export interface MoneyCommunity {
    communityId: string;
    adminId: string;
    committeeId: string | null;
    units: SeedUnit[];
    /** Residente sin unidad propia (arrendatario, conductor…). */
    outsiderId: string;
}

export async function createUser(db: PGlite, communityId: string, role: 'admin' | 'resident' | 'concierge', name: string): Promise<string> {
    const id = uuid();
    const email = `${role}.${id.slice(0, 8)}@example.test`;
    // El alta por invitación (trigger on_auth_user_created) no es parte de estos
    // flujos: el usuario de Auth se crea sin disparar triggers y el perfil, aparte.
    await db.transaction(async tx => {
        await tx.exec(`SET LOCAL session_replication_role = replica`);
        await tx.query(`INSERT INTO auth.users (id, email, raw_user_meta_data) VALUES ($1, $2, $3)`,
            [id, email, JSON.stringify({ full_name: name, community_id: communityId, role })]);
    });
    await db.query(`
        INSERT INTO public.profiles (id, email, full_name, name, role, community_id)
        VALUES ($1, $2, $3, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, name = EXCLUDED.name,
          role = EXCLUDED.role, community_id = EXCLUDED.community_id`,
    [id, email, name, role, communityId]);
    return id;
}

/**
 * Una comunidad con administración, unidades con su dueño y (opcional) un
 * integrante vigente del comité.
 */
export async function seedMoneyCommunity(db: PGlite, options: {
    shares?: Array<number | null>;
    committee?: boolean;
    reserveRatePercent?: number;
} = {}): Promise<MoneyCommunity> {
    counter += 1;
    const communityId = uuid();
    await db.query(`INSERT INTO public.communities (id, name, resident_code, concierge_code) VALUES ($1, $2, $3, $4)`,
        [communityId, `Comunidad QA ${counter}`, `RES${counter}${Date.now() % 100000}`, `CON${counter}${Date.now() % 100000}`]);
    if (options.reserveRatePercent) {
        await db.query('UPDATE public.communities SET reserve_fund_rate = $1 WHERE id = $2', [options.reserveRatePercent, communityId]);
    }
    const adminId = await createUser(db, communityId, 'admin', 'Administración QA');
    const shares = options.shares ?? [500, 300, 200];
    const units: SeedUnit[] = [];
    for (const [index, share] of shares.entries()) {
        const ownerId = await createUser(db, communityId, 'resident', `Vecina ${index + 1}`);
        const id = uuid();
        const number = String(101 + index);
        await db.query(`INSERT INTO public.units (id, community_id, number, floor, owner_id, share_permille)
                        VALUES ($1, $2, $3, 1, $4, $5)`, [id, communityId, number, ownerId, share]);
        await db.query('UPDATE public.profiles SET unit_id = $1 WHERE id = $2', [id, ownerId]);
        units.push({ id, number, ownerId, sharePermille: share });
    }
    let committeeId: string | null = null;
    if (options.committee) {
        committeeId = await createUser(db, communityId, 'resident', 'Integrante del comité');
        await db.query(`INSERT INTO public.finance_committee_members (community_id, resident_id, starts_on, appointed_by)
                        VALUES ($1, $2, CURRENT_DATE - 1, $3)`, [communityId, committeeId, adminId]);
    }
    const outsiderId = await createUser(db, communityId, 'resident', 'Vecino sin unidad');
    return { communityId, adminId, committeeId, units, outsiderId };
}

/** Ejecuta SQL como un usuario autenticado de Supabase (RLS activo). */
export async function asUser<T>(db: PGlite, userId: string, run: (tx: Pick<PGlite, 'query'>) => Promise<T>): Promise<T> {
    return db.transaction(async tx => {
        await tx.exec('SET LOCAL ROLE authenticated');
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', 'authenticated', true)`, [userId]);
        return run(tx);
    });
}

/** Mes AAAA-MM relativo al actual de Chile. */
export function chileMonth(offset = 0, now = new Date()): string {
    const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit' })
        .format(now).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
}

export function chileToday(now = new Date()): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function addDaysIso(isoDate: string, days: number): string {
    const date = new Date(`${isoDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

interface AccountBalance { code: string; debit: number; credit: number }

export async function ledgerBalances(db: PGlite, communityId: string): Promise<Map<string, AccountBalance>> {
    const { rows } = await db.query<AccountBalance>(`
        SELECT a.code, coalesce(sum(l.debit), 0)::int AS debit, coalesce(sum(l.credit), 0)::int AS credit
        FROM public.ledger_accounts a LEFT JOIN public.journal_lines l ON l.account_id = a.id
        WHERE a.community_id = $1 GROUP BY a.code`, [communityId]);
    return new Map(rows.map(row => [row.code, row]));
}

/**
 * Invariante contable global de una comunidad:
 *  1. cada asiento cuadra (debe = haber) y por lo tanto el libro entero;
 *  2. cada pago tiene un único asiento de pago (y uno de reversa si se borró);
 *  3. el banco (1100) es exactamente el dinero que entró (pagos que no son
 *     abonos de liquidación) menos las transferencias a dueños marcadas como
 *     pagadas: ni el abono a GC ni la donación pasan por el banco;
 *  4. ningún asiento usa una cuenta de otra comunidad.
 */
export async function expectLedgerInvariant(db: PGlite, communityId: string) {
    const { rows: unbalanced } = await db.query(`
        SELECT e.id, sum(l.debit) AS debit, sum(l.credit) AS credit
        FROM public.journal_entries e JOIN public.journal_lines l ON l.entry_id = e.id
        WHERE e.community_id = $1 GROUP BY e.id HAVING sum(l.debit) <> sum(l.credit)`, [communityId]);
    expect(unbalanced, 'asientos que no cuadran').toEqual([]);

    const { rows: [totals] } = await db.query<{ debit: number; credit: number }>(`
        SELECT coalesce(sum(l.debit), 0)::int AS debit, coalesce(sum(l.credit), 0)::int AS credit
        FROM public.journal_entries e JOIN public.journal_lines l ON l.entry_id = e.id WHERE e.community_id = $1`, [communityId]);
    expect(totals.debit).toBe(totals.credit);

    const { rows: foreign } = await db.query(`
        SELECT l.id FROM public.journal_entries e JOIN public.journal_lines l ON l.entry_id = e.id
        JOIN public.ledger_accounts a ON a.id = l.account_id WHERE e.community_id = $1 AND a.community_id <> e.community_id`, [communityId]);
    expect(foreign, 'líneas con cuentas de otra comunidad').toEqual([]);

    const { rows: duplicated } = await db.query(`
        SELECT source_record_id, source, count(*) FROM public.journal_entries
        WHERE community_id = $1 AND source IN ('payment', 'payment_reversal')
        GROUP BY source_record_id, source HAVING count(*) > 1`, [communityId]);
    expect(duplicated, 'pagos contabilizados dos veces').toEqual([]);

    const { rows: missing } = await db.query(`
        SELECT p.id FROM public.unit_payments p
        WHERE p.community_id = $1 AND NOT EXISTS (
          SELECT 1 FROM public.journal_entries e WHERE e.community_id = p.community_id AND e.source = 'payment' AND e.source_record_id = p.id)`,
    [communityId]);
    expect(missing, 'pagos sin asiento').toEqual([]);

    const { rows: [cash] } = await db.query<{ inflow: number; transferred: number }>(`
        SELECT
          (SELECT coalesce(sum(amount), 0)::int FROM public.unit_payments
            WHERE community_id = $1 AND coalesce(reference, '') NOT LIKE 'parking_payout:%') AS inflow,
          (SELECT coalesce(sum(net_amount), 0)::int FROM public.parking_payouts
            WHERE community_id = $1 AND status = 'paid') AS transferred`, [communityId]);
    const balances = await ledgerBalances(db, communityId);
    const bank = balances.get('1100');
    const bankBalance = bank ? bank.debit - bank.credit : 0;
    expect(bankBalance, 'banco = pagos en dinero − transferencias a dueños').toBe(cash.inflow - cash.transferred);
    return { bankBalance, balances };
}

/** Textos para residentes: nunca montos ni lenguaje de deudor o amenazas. */
export const MONEY_PATTERN = /\$\s?\d|\d{1,3}(\.\d{3})+|\bCLP\b|pesos/i;
export const DEBTOR_PATTERN = /\bdeudor|\bmoros[oa]s?\b|morosidad|\bcorte de (luz|agua|servicio)|demanda|cobranza judicial|embarg|sanci[oó]n/i;
