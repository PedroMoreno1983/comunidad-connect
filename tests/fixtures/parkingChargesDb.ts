/**
 * Base Postgres real (PGlite) con lo mínimo para correr las migraciones de
 * estacionamientos y del libro de cobros tal como están en el repo.
 *
 * No es un mock: los triggers, la máquina de estados, las restricciones UNIQUE,
 * el RLS y las funciones SECURITY DEFINER corren en Postgres. Lo único simulado
 * es lo que en Supabase provee la plataforma (auth.uid(), roles, profiles,
 * units) y los helpers de rol del esquema real.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';

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

const PLATFORM_STUBS = `
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (id UUID PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
-- Privilegios por defecto de Supabase: toda tabla y función nueva queda abierta
-- a los tres roles, y cada migración restringe con REVOKE/RLS. Replicarlo hace
-- que los tests vean los mismos permisos que producción.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Comunidad'
);
CREATE TABLE public.pricing_tiers (id SERIAL PRIMARY KEY, features JSONB);
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  name TEXT,
  role TEXT NOT NULL DEFAULT 'resident',
  community_id UUID REFERENCES public.communities(id),
  -- TEXT a propósito: así está en producción (ver 20260728160000).
  unit_id TEXT,
  department_number TEXT
);
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID NOT NULL REFERENCES public.communities(id),
  number TEXT NOT NULL,
  owner_id UUID REFERENCES public.profiles(id)
);
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID,
  unit_id TEXT,
  month TEXT,
  amount NUMERIC,
  status TEXT
);
CREATE TABLE public.finance_period_closures (community_id UUID NOT NULL, month TEXT NOT NULL);

CREATE FUNCTION public.get_my_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$ SELECT role FROM public.profiles WHERE id = auth.uid() $$;
CREATE FUNCTION public.get_my_community_id() RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$ SELECT community_id FROM public.profiles WHERE id = auth.uid() $$;
`;

export type ParkingDb = Awaited<ReturnType<typeof createParkingDb>>;

export async function createParkingDb() {
    const db = new PGlite({ extensions: { btree_gist } });
    await db.exec(PLATFORM_STUBS);

    // Libro de cargos y pagos de la unidad, en su versión real.
    await db.exec(migration('20260728160000_charges_payments_ledger.sql'));
    await db.exec(migration('20260729140000_restrict_ledger_to_admin.sql'));
    await db.exec(extractFunction('20261011194026_finance_payment_atomic_journal.sql', 'public.assert_finance_period_open()'));
    await db.exec(`
      CREATE TRIGGER unit_charges_open_period BEFORE INSERT OR UPDATE OR DELETE ON public.unit_charges
        FOR EACH ROW EXECUTE FUNCTION public.assert_finance_period_open('month');
    `);

    // Estacionamientos, en el orden del repo.
    for (const file of [
        '20260810120000_parking_marketplace.sql',
        '20260818120000_parking_community_access_rpcs.sql',
        '20260818140000_parking_floor_level.sql',
        '20260826120000_coco_parking_booking.sql',
        '20261013160000_parking_charges_ledger.sql',
    ]) {
        await db.exec(migration(file));
    }

    return db;
}

/** Ejecuta como un usuario autenticado de Supabase (rol authenticated + auth.uid()). */
export async function asUser<T>(db: PGlite, userId: string, run: () => Promise<T>): Promise<T> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec('SET ROLE authenticated');
    try {
        return await run();
    } finally {
        await db.exec('RESET ROLE');
        await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
}

/** Ejecuta como la service role (CoCo, rutas del servidor). */
export async function asServiceRole<T>(db: PGlite, run: () => Promise<T>): Promise<T> {
    await db.exec('SET ROLE service_role');
    try {
        return await run();
    } finally {
        await db.exec('RESET ROLE');
    }
}

let counter = 0;
const uuid = () => crypto.randomUUID();

export interface SeededCommunity {
    communityId: string;
    adminId: string;
    conciergeId: string;
    ownerId: string;
    ownerUnitId: string;
    residentId: string;
    residentUnitId: string;
    spotId: string;
    hourlyRate: number;
}

/**
 * Una comunidad con admin, conserje, un dueño que publica un cupo (todas las
 * horas, todos los días) y un residente con vehículo registrado.
 */
export async function seedCommunity(db: PGlite, options: { hourlyRate?: number; dailyRate?: number | null } = {}): Promise<SeededCommunity> {
    counter += 1;
    const communityId = uuid();
    const [adminId, conciergeId, ownerId, residentId] = [uuid(), uuid(), uuid(), uuid()];
    const ownerUnitId = uuid();
    const residentUnitId = uuid();
    const spotId = uuid();
    const hourlyRate = options.hourlyRate ?? 1500;

    await db.query('INSERT INTO public.communities (id, name) VALUES ($1, $2)', [communityId, `Comunidad ${counter}`]);
    for (const id of [adminId, conciergeId, ownerId, residentId]) {
        await db.query('INSERT INTO auth.users (id) VALUES ($1)', [id]);
    }
    await db.query(
        `INSERT INTO public.profiles (id, name, role, community_id) VALUES
          ($1, 'Admin', 'admin', $5), ($2, 'Conserje', 'concierge', $5),
          ($3, 'Dueña', 'resident', $5), ($4, 'Vecino', 'resident', $5)`,
        [adminId, conciergeId, ownerId, residentId, communityId],
    );
    await db.query(
        `INSERT INTO public.units (id, community_id, number, owner_id) VALUES ($1, $3, '101', $4), ($2, $3, '202', $5)`,
        [ownerUnitId, residentUnitId, communityId, ownerId, residentId],
    );
    await db.query('UPDATE public.profiles SET unit_id = $1 WHERE id = $2', [ownerUnitId, ownerId]);
    await db.query('UPDATE public.profiles SET unit_id = $1 WHERE id = $2', [residentUnitId, residentId]);

    await db.query(
        `INSERT INTO public.parking_spots (id, community_id, owner_id, label, hourly_rate, daily_rate, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'published')`,
        [spotId, communityId, ownerId, `E-${counter}`, hourlyRate, options.dailyRate ?? null],
    );
    for (let weekday = 0; weekday < 7; weekday += 1) {
        await db.query(
            `INSERT INTO public.parking_spot_availability (spot_id, weekday, start_time, end_time)
             VALUES ($1, $2, '00:00', '23:59')`,
            [spotId, weekday],
        );
    }
    await db.query(
        `INSERT INTO public.parking_drivers (user_id, profile_id, full_name, phone, plate)
         VALUES ($1, $1, 'Vecino Conductor', '+56911112222', 'BBCC12')`,
        [residentId],
    );

    return { communityId, adminId, conciergeId, ownerId, ownerUnitId, residentId, residentUnitId, spotId, hourlyRate };
}

/** Mañana a las HH:00 en Santiago, como timestamptz ISO. */
export async function tomorrowAt(db: PGlite, hour: number): Promise<string> {
    const { rows } = await db.query<{ ts: string }>(
        `SELECT to_char(((date_trunc('day', NOW() AT TIME ZONE 'America/Santiago') + make_interval(days => 1, hours => $1))
                AT TIME ZONE 'America/Santiago') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS ts`,
        [hour],
    );
    return rows[0].ts;
}

export interface ChargeRow {
    id: string;
    booking_id: string;
    community_id: string;
    status: string;
    method: string;
    amount: number;
    unit_id: string | null;
    unit_charge_id: string | null;
    payer_profile_id: string | null;
    needs_review: boolean;
    failure_reason: string | null;
}

export async function chargeFor(db: PGlite, bookingId: string): Promise<ChargeRow | undefined> {
    const { rows } = await db.query<ChargeRow>('SELECT * FROM public.parking_charges WHERE booking_id = $1', [bookingId]);
    return rows[0];
}
