/**
 * Derechos de cada unidad (migración 20261015020000) contra Postgres real
 * (PGlite): save_unit_rights valida la suma y deja la revisión con los valores
 * anteriores; sin fuente queda provisoria; con una votación abierta no se
 * cambia nada (ni por la función ni directo); el registro solo lo lee el admin
 * de su comunidad; nadie autenticado escribe share_permille, el registro ni trunca.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const migration = (name: string) => readFileSync(resolve(process.cwd(), 'supabase/migrations', name), 'utf8');

function extractFunction(file: string, signature: string): string {
    const sql = migration(file);
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION ${signature}`);
    if (start < 0) throw new Error(`No encontré ${signature} en ${file}`);
    const bodyStart = sql.indexOf('AS $$', start);
    const end = sql.indexOf('$$;', bodyStart + 5);
    return sql.slice(start, end + 3);
}

// Igual que producción: units con privilegios por defecto (incluye TRUNCATE) y RLS de admin.
const STUBS = `
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
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
CREATE TABLE public.communities (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT);
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id), name TEXT, email TEXT,
  role TEXT NOT NULL DEFAULT 'resident', community_id UUID REFERENCES public.communities(id),
  unit_id TEXT
);
CREATE TABLE public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), number TEXT NOT NULL, floor INTEGER, owner_id UUID REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(), community_id UUID NOT NULL REFERENCES public.communities(id), tower TEXT,
  unit_number TEXT, share_permille NUMERIC(9,4), type TEXT, resident_profile_id UUID REFERENCES public.profiles(id)
);
CREATE TABLE public.finance_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id),
  resident_id uuid NOT NULL REFERENCES public.profiles(id),
  starts_on date NOT NULL DEFAULT CURRENT_DATE, ended_at timestamptz
);
REVOKE ALL ON public.finance_committee_members FROM anon, authenticated;
`;

let db: PGlite;

async function asRole<T>(role: 'authenticated' | 'anon' | 'service_role', userId: string, run: () => Promise<T>): Promise<T> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec(`SET ROLE ${role}`);
    try { return await run(); } finally {
        await db.exec('RESET ROLE');
        await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
}
const asUser = <T>(userId: string, run: () => Promise<T>) => asRole('authenticated', userId, run);
const asServer = <T>(run: () => Promise<T>) => asRole('service_role', '', run);

interface Seed { communityId: string; adminId: string; residentId: string; unitA: string; unitB: string }

async function seed(): Promise<Seed> {
    const id = () => crypto.randomUUID();
    const s = { communityId: id(), adminId: id(), residentId: id(), unitA: id(), unitB: id() };
    await db.query('INSERT INTO public.communities (id) VALUES ($1)', [s.communityId]);
    for (const user of [s.adminId, s.residentId]) await db.query('INSERT INTO auth.users (id) VALUES ($1)', [user]);
    await db.query(`INSERT INTO public.profiles (id, name, role, community_id) VALUES ($1,'Admin','admin',$3),($2,'Vecina','resident',$3)`,
        [s.adminId, s.residentId, s.communityId]);
    await db.query(`INSERT INTO public.units (id, community_id, number, tower) VALUES ($1,$3,'101','A'),($2,$3,'102','A')`,
        [s.unitA, s.unitB, s.communityId]);
    return s;
}

const values = (s: Seed, a: number, b: number) => JSON.stringify([{ unit_id: s.unitA, permille: a }, { unit_id: s.unitB, permille: b }]);

const save = (s: Seed, a: number, b: number, method = 'manual', note = '') => asServer(() => db.query<{ save_unit_rights: Record<string, unknown> }>(
    'SELECT public.save_unit_rights($1, $2::jsonb, $3, $4, $5, $6)', [s.communityId, values(s, a, b), method, note, s.adminId, 'Admin']));

const shares = async (s: Seed) => (await db.query<{ number: string; share_permille: string | null }>(
    'SELECT number, share_permille FROM public.units WHERE community_id = $1 ORDER BY number', [s.communityId])).rows.map(row => row.share_permille === null ? null : Number(row.share_permille));

async function openVote(s: Seed) {
    const assemblyId = crypto.randomUUID();
    await db.query(`INSERT INTO public.assemblies (id, community_id, title, session_type, modality, scheduled_at, status, citation_text, cited_at, started_at)
        VALUES ($1,$2,'Ordinaria 2026','ordinary','in_person', now(),'in_progress','Citación', now() - interval '7 days', now())`, [assemblyId, s.communityId]);
    await db.query(`INSERT INTO public.assembly_agenda_items (assembly_id, community_id, position, matter_code, title, quorum_class, voting_status, opened_at)
        VALUES ($1,$2,1,'ord_rendicion_cuentas','Balance','ordinary','open', now())`, [assemblyId, s.communityId]);
    return assemblyId;
}

beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_community_id()'));
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_role()'));
    await db.exec(extractFunction('20261014220000_committee_weekly_digest.sql', 'public.is_active_committee_member(target_community uuid)'));
    await db.exec(`ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
        CREATE POLICY units_admin_community_only ON public.units USING (community_id = public.current_profile_community_id() AND public.current_profile_role() = 'admin');
        CREATE POLICY units_select_community_only ON public.units FOR SELECT USING (community_id = public.current_profile_community_id());`);
    await db.exec(migration('20261014230000_assemblies_ley_21442.sql'));
    // Sin la habilidad (20261015000000): el trigger de certificado no es parte de esta prueba.
    await db.exec(migration('20261015020000_unit_rights_permille.sql'));
    // Idempotente: se puede volver a aplicar.
    await db.exec(migration('20261015020000_unit_rights_permille.sql'));
}, 60_000);

describe('save_unit_rights', () => {
    it('guarda una carga que suma 1000‰ y deja la revisión con quién, cuándo y los valores anteriores', async () => {
        const s = await seed();
        const first = await save(s, 600, 400);
        const revision = first.rows[0].save_unit_rights;
        expect(await shares(s)).toEqual([600, 400]);
        expect(revision.verified).toBe(false); // sin fuente: provisoria
        expect(revision.saved_by).toBe(s.adminId);
        expect(revision.saved_at).toBeTruthy();
        expect((revision.previous_values as { permille: number | null }[]).map(v => v.permille)).toEqual([null, null]);

        const second = (await save(s, 550.25, 449.75, 'manual', 'Reglamento de copropiedad, art. 5')).rows[0].save_unit_rights;
        expect(second.verified).toBe(true);
        expect(second.source_note).toBe('Reglamento de copropiedad, art. 5');
        expect((second.previous_values as { permille: number }[]).map(v => Number(v.permille))).toEqual([600, 400]);
        expect(await shares(s)).toEqual([550.25, 449.75]);
    });

    it('tolerancia ± 0,5‰: 1000,5 pasa; 1000,6 no se guarda y dice la diferencia', async () => {
        const s = await seed();
        await save(s, 600.5, 400);
        await expect(save(s, 600.6, 400)).rejects.toThrow(/suman 1000\.6000 ‰ \(diferencia 0\.6000 ‰\)/);
        expect(await shares(s)).toEqual([600.5, 400]);
    });

    it('exige todas las unidades de la comunidad y ninguna ajena', async () => {
        const s = await seed();
        const t = await seed();
        await expect(asServer(() => db.query('SELECT public.save_unit_rights($1, $2::jsonb, $3, $4, $5, $6)',
            [s.communityId, JSON.stringify([{ unit_id: s.unitA, permille: 1000 }]), 'manual', '', s.adminId, 'Admin']))).rejects.toThrow(/faltan unidades/);
        await expect(asServer(() => db.query('SELECT public.save_unit_rights($1, $2::jsonb, $3, $4, $5, $6)',
            [s.communityId, JSON.stringify([{ unit_id: s.unitA, permille: 500 }, { unit_id: t.unitA, permille: 500 }]), 'manual', '', s.adminId, 'Admin']))).rejects.toThrow(/no son de esta comunidad/);
        expect(await shares(s)).toEqual([null, null]);
    });

    it('verificar registra la fuente sin cambiar valores; sin fuente no verifica', async () => {
        const s = await seed();
        await save(s, 700, 300, 'expense_prorate');
        await expect(asServer(() => db.query('SELECT public.save_unit_rights($1, NULL, $2, $3, $4, $5)', [s.communityId, 'verify', '  ', s.adminId, 'Admin'])))
            .rejects.toThrow(/registrar la fuente/);
        const verified = (await asServer(() => db.query<{ save_unit_rights: Record<string, unknown> }>('SELECT public.save_unit_rights($1, NULL, $2, $3, $4, $5)',
            [s.communityId, 'verify', 'Escritura de 1998, cláusula 4', s.adminId, 'Admin']))).rows[0].save_unit_rights;
        expect(verified.method).toBe('verify');
        expect(verified.verified).toBe(true);
        expect(await shares(s)).toEqual([700, 300]);
    });

    it('authenticated (aun admin) y anon no pueden ejecutarla', async () => {
        const s = await seed();
        await expect(asUser(s.adminId, () => db.query('SELECT public.save_unit_rights($1, $2::jsonb, $3, $4, $5, $6)',
            [s.communityId, values(s, 500, 500), 'manual', '', s.adminId, 'Admin']))).rejects.toThrow(/permission denied/);
        await expect(asRole('anon', '', () => db.query('SELECT public.save_unit_rights($1, $2::jsonb, $3, $4, $5, $6)',
            [s.communityId, values(s, 500, 500), 'manual', '', s.adminId, 'Admin']))).rejects.toThrow(/permission denied/);
    });
});

describe('bloqueo con votación abierta', () => {
    it('ni la función ni un cambio directo del servidor tocan los derechos; al cerrar la votación, sí', async () => {
        const s = await seed();
        await save(s, 600, 400);
        const assemblyId = await openVote(s);
        await expect(save(s, 500, 500)).rejects.toThrow(/votación abierta en la asamblea "Ordinaria 2026"/);
        await expect(asServer(() => db.query('UPDATE public.units SET share_permille = 1 WHERE id = $1', [s.unitA]))).rejects.toThrow(/votación abierta/);
        await expect(asServer(() => db.query('SELECT public.save_unit_rights($1, NULL, $2, $3, $4, $5)', [s.communityId, 'verify', 'Reglamento', s.adminId, 'Admin'])))
            .rejects.toThrow(/votación abierta/);
        expect(await shares(s)).toEqual([600, 400]);
        // Otros campos de la unidad sí se pueden cambiar.
        await asServer(() => db.query(`UPDATE public.units SET floor = 3 WHERE id = $1`, [s.unitA]));
        // Cerrar la votación (como el servidor: con resultado) libera el bloqueo.
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'closed', outcome = 'approved', result = '{}'::jsonb WHERE assembly_id = $1`, [assemblyId]);
        await save(s, 500, 500);
        expect(await shares(s)).toEqual([500, 500]);
    });
});

describe('permisos y RLS', () => {
    it('authenticated (aun admin) ya no escribe units.share_permille, pero sí las otras columnas; anon no escribe', async () => {
        const s = await seed();
        await expect(asUser(s.adminId, () => db.query('UPDATE public.units SET share_permille = 500 WHERE id = $1', [s.unitA]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query(`INSERT INTO public.units (community_id, number, share_permille) VALUES ($1, '103', 10)`, [s.communityId]))).rejects.toThrow(/permission denied/);
        const updated = await asUser(s.adminId, () => db.query('UPDATE public.units SET floor = 2 WHERE id = $1 RETURNING id', [s.unitA]));
        expect(updated.rows).toHaveLength(1);
        const inserted = await asUser(s.adminId, () => db.query(`INSERT INTO public.units (community_id, number, tower) VALUES ($1, '103', 'A') RETURNING id`, [s.communityId]));
        expect(inserted.rows).toHaveLength(1);
        await expect(asRole('anon', '', () => db.query('UPDATE public.units SET floor = 9 WHERE id = $1', [s.unitA]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.units'))).rejects.toThrow(/permission denied/);
    });

    it('el registro lo lee solo el admin de la comunidad: ni residentes ni otra comunidad', async () => {
        const s = await seed();
        const t = await seed();
        await save(s, 600, 400);
        const admin = await asUser(s.adminId, () => db.query('SELECT id FROM public.unit_rights_revisions WHERE community_id = $1', [s.communityId]));
        expect(admin.rows).toHaveLength(1);
        const resident = await asUser(s.residentId, () => db.query('SELECT id FROM public.unit_rights_revisions WHERE community_id = $1', [s.communityId]));
        expect(resident.rows).toHaveLength(0);
        const foreign = await asUser(t.adminId, () => db.query('SELECT id FROM public.unit_rights_revisions WHERE community_id = $1', [s.communityId]));
        expect(foreign.rows).toHaveLength(0);
        await expect(asRole('anon', '', () => db.query('SELECT id FROM public.unit_rights_revisions'))).rejects.toThrow(/permission denied/);
    });

    it('nadie edita, borra ni trunca el registro (tampoco el servidor); authenticated no inserta', async () => {
        const s = await seed();
        await save(s, 600, 400);
        await expect(asUser(s.adminId, () => db.query(`INSERT INTO public.unit_rights_revisions (community_id, method) VALUES ($1, 'manual')`, [s.communityId]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('UPDATE public.unit_rights_revisions SET source_note = $2 WHERE community_id = $1', [s.communityId, 'x']))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.unit_rights_revisions'))).rejects.toThrow(/permission denied/);
        await expect(asServer(() => db.query('UPDATE public.unit_rights_revisions SET source_note = $2 WHERE community_id = $1', [s.communityId, 'x']))).rejects.toThrow(/permission denied|no se edita/);
        await expect(asServer(() => db.query('DELETE FROM public.unit_rights_revisions WHERE community_id = $1', [s.communityId]))).rejects.toThrow(/permission denied|no se edita/);
        await expect(asServer(() => db.query('TRUNCATE public.unit_rights_revisions'))).rejects.toThrow(/permission denied/);
        // Ni el dueño de la tabla: el trigger lo impide.
        await expect(db.query('DELETE FROM public.unit_rights_revisions WHERE community_id = $1', [s.communityId])).rejects.toThrow(/no se edita/);
    });

    it('un cambio directo del servidor (p. ej. el agente) queda registrado como provisorio con el valor anterior', async () => {
        const s = await seed();
        await save(s, 600, 400, 'manual', 'Reglamento, art. 5');
        await asServer(() => db.query('UPDATE public.units SET share_permille = 650 WHERE id = $1', [s.unitA]));
        const rows = await db.query<{ method: string; verified: boolean; previous_values: { permille: number }[]; new_values: { permille: number }[] }>(
            `SELECT method, verified, previous_values, new_values FROM public.unit_rights_revisions WHERE community_id = $1 ORDER BY saved_at DESC, method LIMIT 1`, [s.communityId]);
        expect(rows.rows[0].method).toBe('direct');
        expect(rows.rows[0].verified).toBe(false);
        expect(Number(rows.rows[0].previous_values[0].permille)).toBe(600);
        expect(Number(rows.rows[0].new_values[0].permille)).toBe(650);
    });
});
