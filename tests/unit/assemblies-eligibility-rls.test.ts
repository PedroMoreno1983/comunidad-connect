/**
 * Copropietarios hábiles (migración 20261015000000) contra Postgres real
 * (PGlite): el detalle por unidad del certificado solo lo lee el admin; los
 * totales, la comunidad; sin certificado no se abre una votación; el voto de una
 * unidad no habilitada no se registra; nadie autenticado escribe ni trunca.
 * También deja probado el REVOKE de TRUNCATE en committee_digests.
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
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), community_id UUID NOT NULL REFERENCES public.communities(id),
  number TEXT NOT NULL, tower TEXT, owner_id UUID REFERENCES public.profiles(id),
  resident_profile_id UUID REFERENCES public.profiles(id), share_permille NUMERIC(9,4)
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

async function asUser<T>(userId: string, run: () => Promise<T>): Promise<T> {
    await db.query(`SELECT set_config('request.jwt.claim.sub', $1, false)`, [userId]);
    await db.exec('SET ROLE authenticated');
    try { return await run(); } finally {
        await db.exec('RESET ROLE');
        await db.query(`SELECT set_config('request.jwt.claim.sub', '', false)`);
    }
}


interface Seed { communityId: string; adminId: string; ownerId: string; otherId: string; committeeId: string; unitA: string; unitB: string; assemblyId: string; itemId: string }

async function seed(): Promise<Seed> {
    const id = () => crypto.randomUUID();
    const s = { communityId: id(), adminId: id(), ownerId: id(), otherId: id(), committeeId: id(), unitA: id(), unitB: id(), assemblyId: id(), itemId: id() };
    await db.query('INSERT INTO public.communities (id) VALUES ($1)', [s.communityId]);
    for (const user of [s.adminId, s.ownerId, s.otherId, s.committeeId]) await db.query('INSERT INTO auth.users (id) VALUES ($1)', [user]);
    await db.query(`INSERT INTO public.profiles (id, role, community_id) VALUES ($1,'admin',$5),($2,'resident',$5),($3,'resident',$5),($4,'resident',$5)`,
        [s.adminId, s.ownerId, s.otherId, s.committeeId, s.communityId]);
    await db.query(`INSERT INTO public.units (id, community_id, number, owner_id, share_permille) VALUES ($1,$3,'101',$4,600),($2,$3,'102',$5,400)`,
        [s.unitA, s.unitB, s.communityId, s.ownerId, s.otherId]);
    await db.query('INSERT INTO public.finance_committee_members (community_id, resident_id, starts_on) VALUES ($1, $2, CURRENT_DATE - 1)', [s.communityId, s.committeeId]);
    await db.query(`INSERT INTO public.assemblies (id, community_id, title, session_type, modality, scheduled_at, status, citation_text, cited_at, started_at)
        VALUES ($1,$2,'Anual','ordinary','in_person', now(),'in_progress','Citación', now() - interval '7 days', now())`, [s.assemblyId, s.communityId]);
    await db.query(`INSERT INTO public.assembly_agenda_items (id, assembly_id, community_id, position, matter_code, title, quorum_class)
        VALUES ($1,$2,$3,1,'ord_rendicion_cuentas','Balance','ordinary')`, [s.itemId, s.assemblyId, s.communityId]);
    await db.query(`INSERT INTO public.assembly_attendance (assembly_id, community_id, unit_id, unit_label, weight, attendee_profile_id, capacity, mode, status, identity_verified_at, identity_verified_by)
        VALUES ($1,$2,$3,'101',600,$4,'owner','in_person','present', now(), $7),($1,$2,$5,'102',400,$6,'owner','in_person','present', now(), $7)`,
        [s.assemblyId, s.communityId, s.unitA, s.ownerId, s.unitB, s.otherId, s.adminId]);
    return s;
}

/** Certificado: la 101 habilitada, la 102 no. */
async function certify(s: Seed): Promise<string> {
    const cert = await db.query<{ id: string }>(`INSERT INTO public.assembly_eligibility_certificates
        (assembly_id, community_id, cutoff_date, rights_method, total_units, eligible_units, total_rights, eligible_rights, issued_by, issued_by_name)
        VALUES ($1,$2,(now() AT TIME ZONE 'America/Santiago')::date,'share',2,1,1000,600,$3,'Administración') RETURNING id`, [s.assemblyId, s.communityId, s.adminId]);
    const certificateId = cert.rows[0].id;
    await db.query(`INSERT INTO public.assembly_eligibility_units (certificate_id, assembly_id, community_id, unit_id, eligible, basis, weight)
        VALUES ($1,$2,$3,$4,true,'up_to_date',600),($1,$2,$3,$5,false,'overdue',400)`, [certificateId, s.assemblyId, s.communityId, s.unitA, s.unitB]);
    return certificateId;
}

const vote = (s: Seed, unitId: string) => db.query(`INSERT INTO public.assembly_votes (assembly_id, agenda_item_id, community_id, unit_id, attendance_id, choice, weight, mode)
    SELECT $1, $2, $3, $4, id, 'yes', weight, 'in_person' FROM public.assembly_attendance WHERE assembly_id = $1 AND unit_id = $4`, [s.assemblyId, s.itemId, s.communityId, unitId]);

beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_community_id()'));
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_role()'));
    await db.exec(extractFunction('20261014220000_committee_weekly_digest.sql', 'public.is_active_committee_member(target_community uuid)'));
    // committee_digests como estaba antes del REVOKE manual: con privilegios por defecto (incluye TRUNCATE).
    await db.exec('CREATE TABLE public.committee_digests (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), community_id uuid)');
    await db.exec(migration('20261014230000_assemblies_ley_21442.sql'));
    await db.exec(migration('20261015000000_assembly_eligibility_certificates.sql'));
    // Idempotente: se puede volver a aplicar.
    await db.exec(migration('20261015000000_assembly_eligibility_certificates.sql'));
}, 60_000);

describe('RLS del certificado de habilidad', () => {
    it('el detalle por unidad solo lo lee el admin: ni el comité ni los residentes (tampoco la propia unidad)', async () => {
        const s = await seed();
        await certify(s);
        const admin = await asUser(s.adminId, () => db.query('SELECT unit_id FROM public.assembly_eligibility_units WHERE assembly_id = $1', [s.assemblyId]));
        expect(admin.rows).toHaveLength(2);
        for (const user of [s.committeeId, s.ownerId, s.otherId]) {
            const rows = await asUser(user, () => db.query('SELECT unit_id FROM public.assembly_eligibility_units WHERE assembly_id = $1', [s.assemblyId]));
            expect(rows.rows).toHaveLength(0);
        }
    });

    it('los totales del certificado los ve la comunidad; otra comunidad, nada', async () => {
        const s = await seed();
        const t = await seed();
        await certify(s);
        const resident = await asUser(s.otherId, () => db.query<{ eligible_units: number }>('SELECT eligible_units FROM public.assembly_eligibility_certificates WHERE assembly_id = $1', [s.assemblyId]));
        expect(resident.rows.map(r => r.eligible_units)).toEqual([1]);
        const foreignAdmin = await asUser(t.adminId, () => db.query('SELECT id FROM public.assembly_eligibility_certificates WHERE assembly_id = $1', [s.assemblyId]));
        expect(foreignAdmin.rows).toHaveLength(0);
        const foreignUnits = await asUser(t.adminId, () => db.query('SELECT unit_id FROM public.assembly_eligibility_units WHERE assembly_id = $1', [s.assemblyId]));
        expect(foreignUnits.rows).toHaveLength(0);
    });

    it('nadie autenticado escribe, borra ni trunca; anon no lee', async () => {
        const s = await seed();
        await certify(s);
        await expect(asUser(s.adminId, () => db.query(`UPDATE public.assembly_eligibility_units SET eligible = true WHERE assembly_id = $1`, [s.assemblyId]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query(`DELETE FROM public.assembly_eligibility_certificates WHERE assembly_id = $1`, [s.assemblyId]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.ownerId, () => db.query(`INSERT INTO public.assembly_eligibility_units (certificate_id, assembly_id, community_id, unit_id, eligible, basis)
            SELECT id, assembly_id, community_id, $2, true, 'up_to_date' FROM public.assembly_eligibility_certificates WHERE assembly_id = $1`, [s.assemblyId, s.unitB]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.assembly_eligibility_units'))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.assembly_eligibility_certificates'))).rejects.toThrow(/permission denied/);
        await db.exec('SET ROLE anon');
        try {
            await expect(db.query('SELECT id FROM public.assembly_eligibility_certificates')).rejects.toThrow(/permission denied/);
        } finally { await db.exec('RESET ROLE'); }
    });

    it('committee_digests: authenticated solo lee; TRUNCATE revocado por escrito', async () => {
        const s = await seed();
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.committee_digests'))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.adminId, () => db.query('INSERT INTO public.committee_digests (community_id) VALUES ($1)', [s.communityId]))).rejects.toThrow(/permission denied/);
        const privileges = await db.query<{ privilege_type: string }>(`SELECT privilege_type FROM information_schema.role_table_grants
            WHERE table_name = 'committee_digests' AND grantee IN ('authenticated', 'anon') ORDER BY 1`);
        expect(privileges.rows.map(r => r.privilege_type)).toEqual(['SELECT']);
    });
});

describe('reglas del certificado en la base', () => {
    it('sin certificado vigente no se abre la votación', async () => {
        const s = await seed();
        await expect(db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'open' WHERE id = $1`, [s.itemId])).rejects.toThrow(/certificado de habilidad/);
        await certify(s);
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'open' WHERE id = $1`, [s.itemId]);
    });

    it('el voto de una unidad no habilitada no se registra; el de una habilitada, sí', async () => {
        const s = await seed();
        await certify(s);
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'open' WHERE id = $1`, [s.itemId]);
        await vote(s, s.unitA);
        await expect(vote(s, s.unitB)).rejects.toThrow(/no figura habilitada/);
        const rows = await db.query<{ unit_id: string }>('SELECT unit_id FROM public.assembly_votes WHERE agenda_item_id = $1', [s.itemId]);
        expect(rows.rows.map(r => r.unit_id)).toEqual([s.unitA]);
    });

    it('un solo certificado vigente; se reemplaza solo antes de la primera votación y nunca se edita', async () => {
        const s = await seed();
        const first = await certify(s);
        await expect(certify(s)).rejects.toThrow(/duplicate key|unique/i);
        await expect(db.query(`UPDATE public.assembly_eligibility_certificates SET eligible_units = 2 WHERE id = $1`, [first])).rejects.toThrow(/no se modifica/);
        await expect(db.query(`UPDATE public.assembly_eligibility_units SET eligible = true WHERE certificate_id = $1`, [first])).rejects.toThrow(/no se modifica/);
        await db.query(`UPDATE public.assembly_eligibility_certificates SET status = 'superseded', superseded_at = now() WHERE id = $1`, [first]);
        const second = await certify(s);
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'open' WHERE id = $1`, [s.itemId]);
        await expect(db.query(`UPDATE public.assembly_eligibility_certificates SET status = 'superseded', superseded_at = now() WHERE id = $1`, [second])).rejects.toThrow(/la votación comenzó/);
        await expect(certify(s)).rejects.toThrow(/antes de abrir la primera votación|duplicate key|unique/i);
    });

    it('el certificado se emite con la sesión en curso y con corte no posterior a la emisión', async () => {
        const s = await seed();
        await db.query(`UPDATE public.assemblies SET status = 'cited' WHERE id = $1`, [s.assemblyId]);
        await expect(certify(s)).rejects.toThrow(/sesión en curso/);
        await db.query(`UPDATE public.assemblies SET status = 'in_progress' WHERE id = $1`, [s.assemblyId]);
        await expect(db.query(`INSERT INTO public.assembly_eligibility_certificates
            (assembly_id, community_id, cutoff_date, rights_method, total_units, eligible_units, total_rights, eligible_rights)
            VALUES ($1,$2,(now() AT TIME ZONE 'America/Santiago')::date + 3,'share',2,1,1000,600)`, [s.assemblyId, s.communityId])).rejects.toThrow(/fecha de corte/);
    });

    it('detalle coherente: habilitada solo con base al día o convenio', async () => {
        const s = await seed();
        const certificateId = await certify(s);
        const t = await seed();
        await expect(db.query(`INSERT INTO public.assembly_eligibility_units (certificate_id, assembly_id, community_id, unit_id, eligible, basis)
            VALUES ($1,$2,$3,$4,true,'overdue')`, [certificateId, s.assemblyId, s.communityId, t.unitA])).rejects.toThrow(/assembly_eligibility_units_basis/);
    });
});
