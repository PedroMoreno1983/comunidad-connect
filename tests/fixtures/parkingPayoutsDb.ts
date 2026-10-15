/**
 * Base Postgres real (PGlite) para la liquidación a dueños de estacionamientos:
 * la del libro de cobros (parkingChargesDb) más los libros de destino reales
 * (pagos de unidad con su asiento contable y fondo de reserva) y la migración
 * 20261015060000 tal como está en el repo.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createParkingDb } from './parkingChargesDb';

const migration = (name: string) =>
    readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');

/** Extrae una función de una migración, para usar la versión real y no una copia. */
function extractFunction(file: string, signature: string): string {
    const sql = migration(file);
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
    if (start < 0) throw new Error(`No encontré ${signature} en ${file}`);
    const bodyStart = sql.indexOf('AS $$', start);
    const end = sql.indexOf('$$;', bodyStart + 5);
    return sql.slice(start, end + 3);
}

// Libro de 4 cuentas (20260923220442 + 20261011194026), solo las tablas.
const JOURNAL_TABLES = `
CREATE TABLE public.billing_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE public.ledger_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('asset', 'liability', 'equity', 'income', 'expense')),
  UNIQUE (community_id, code)
);
CREATE TABLE public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  memo text NOT NULL,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'agreement', 'payroll', 'payment', 'payment_reversal')),
  source_record_id uuid,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.journal_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.ledger_accounts(id),
  debit integer NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit integer NOT NULL DEFAULT 0 CHECK (credit >= 0),
  CHECK (debit = 0 OR credit = 0),
  CHECK (debit > 0 OR credit > 0)
);
`;

export async function createParkingPayoutsDb() {
    const db = await createParkingDb();
    await db.exec(JOURNAL_TABLES);
    await db.exec(migration('20260728180000_reserve_fund.sql'));
    await db.exec(`
      CREATE TRIGGER unit_payments_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.unit_payments
        FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('paid_at');
      CREATE TRIGGER reserve_fund_movements_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.reserve_fund_movements
        FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
    `);
    // Versión vigente en producción del asiento del pago, con sus triggers; la
    // migración nueva la reemplaza.
    await db.exec(extractFunction('20261011194026_finance_payment_atomic_journal.sql', 'public.finance_journal_unit_payment()'));
    await db.exec(`
      CREATE TRIGGER finance_journal_unit_payment_insert AFTER INSERT ON public.unit_payments
        FOR EACH ROW EXECUTE FUNCTION public.finance_journal_unit_payment();
      CREATE TRIGGER finance_journal_unit_payment_delete AFTER DELETE ON public.unit_payments
        FOR EACH ROW EXECUTE FUNCTION public.finance_journal_unit_payment();
      CREATE TRIGGER finance_journal_unit_payment_update BEFORE UPDATE ON public.unit_payments
        FOR EACH ROW EXECUTE FUNCTION public.finance_journal_unit_payment();
    `);
    await db.exec(migration('20261015060000_parking_owner_payouts.sql'));
    return db;
}
