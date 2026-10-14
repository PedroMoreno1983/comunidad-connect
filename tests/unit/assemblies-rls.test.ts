/**
 * Asambleas (migración 20261014230000) contra Postgres real (PGlite): RLS
 * multi-tenant, escrituras solo por el servidor, y las reglas que viven en la
 * base (el administrador no representa, solo se vota con el punto abierto, el
 * acta firmada no se edita).
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

interface Seed { communityId: string; adminId: string; ownerId: string; otherId: string; committeeId: string; unitA: string; unitB: string; assemblyId: string; draftId: string; itemId: string }

async function seed(): Promise<Seed> {
    const id = () => crypto.randomUUID();
    const s = { communityId: id(), adminId: id(), ownerId: id(), otherId: id(), committeeId: id(), unitA: id(), unitB: id(), assemblyId: id(), draftId: id(), itemId: id() };
    await db.query('INSERT INTO public.communities (id) VALUES ($1)', [s.communityId]);
    for (const user of [s.adminId, s.ownerId, s.otherId, s.committeeId]) await db.query('INSERT INTO auth.users (id) VALUES ($1)', [user]);
    await db.query(`INSERT INTO public.profiles (id, role, community_id) VALUES ($1,'admin',$5),($2,'resident',$5),($3,'resident',$5),($4,'resident',$5)`,
        [s.adminId, s.ownerId, s.otherId, s.committeeId, s.communityId]);
    await db.query(`INSERT INTO public.units (id, community_id, number, owner_id, share_permille) VALUES ($1,$3,'101',$4,600),($2,$3,'102',$5,400)`,
        [s.unitA, s.unitB, s.communityId, s.ownerId, s.otherId]);
    await db.query('INSERT INTO public.finance_committee_members (community_id, resident_id, starts_on) VALUES ($1, $2, CURRENT_DATE - 1)', [s.communityId, s.committeeId]);
    await db.query(`INSERT INTO public.assemblies (id, community_id, title, session_type, modality, scheduled_at, video_url, status, citation_text, cited_at)
        VALUES ($1,$3,'Anual','ordinary','hybrid', now() + interval '7 days','https://meet.example/x','cited','Citación', now()),
               ($2,$3,'Borrador','ordinary','in_person', now() + interval '9 days','','draft','',NULL)`,
        [s.assemblyId, s.draftId, s.communityId]);
    await db.query(`INSERT INTO public.assembly_agenda_items (id, assembly_id, community_id, position, matter_code, title, quorum_class)
        VALUES ($1,$2,$3,1,'ord_rendicion_cuentas','Balance','ordinary')`, [s.itemId, s.assemblyId, s.communityId]);
    await db.query(`INSERT INTO public.assembly_attendance (assembly_id, community_id, unit_id, unit_label, weight, attendee_profile_id, capacity, mode, status)
        VALUES ($1,$2,$3,'101',600,$4,'owner','remote','confirmed'),($1,$2,$5,'102',400,$6,'owner','in_person','confirmed')`,
        [s.assemblyId, s.communityId, s.unitA, s.ownerId, s.unitB, s.otherId]);
    return s;
}

beforeAll(async () => {
    db = new PGlite();
    await db.exec(STUBS);
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_community_id()'));
    await db.exec(extractFunction('20260516000000_showcase_operational_tables.sql', 'public.current_profile_role()'));
    await db.exec(extractFunction('20261014220000_committee_weekly_digest.sql', 'public.is_active_committee_member(target_community uuid)'));
    await db.exec(migration('20261014230000_assemblies_ley_21442.sql'));
    // Idempotente: se puede volver a aplicar.
    await db.exec(migration('20261014230000_assemblies_ley_21442.sql'));
}, 60_000);

describe('RLS de asambleas', () => {
    it('un residente ve las asambleas citadas de su comunidad, no los borradores', async () => {
        const s = await seed();
        const rows = await asUser(s.ownerId, () => db.query<{ id: string }>('SELECT id FROM public.assemblies WHERE community_id = $1', [s.communityId]));
        expect(rows.rows.map(r => r.id)).toEqual([s.assemblyId]);
        const admin = await asUser(s.adminId, () => db.query('SELECT id FROM public.assemblies WHERE community_id = $1', [s.communityId]));
        expect(admin.rows).toHaveLength(2);
    });

    it('otra comunidad no ve nada', async () => {
        const s = await seed();
        const t = await seed();
        const rows = await asUser(t.adminId, () => db.query('SELECT id FROM public.assemblies WHERE id = $1', [s.assemblyId]));
        expect(rows.rows).toHaveLength(0);
        const items = await asUser(t.ownerId, () => db.query('SELECT id FROM public.assembly_agenda_items WHERE assembly_id = $1', [s.assemblyId]));
        expect(items.rows).toHaveLength(0);
    });

    it('un residente solo ve la asistencia de su unidad; el comité y el admin, toda', async () => {
        const s = await seed();
        const own = await asUser(s.ownerId, () => db.query<{ unit_label: string }>('SELECT unit_label FROM public.assembly_attendance WHERE assembly_id = $1', [s.assemblyId]));
        expect(own.rows.map(r => r.unit_label)).toEqual(['101']);
        const committee = await asUser(s.committeeId, () => db.query('SELECT id FROM public.assembly_attendance WHERE assembly_id = $1', [s.assemblyId]));
        expect(committee.rows).toHaveLength(2);
        const admin = await asUser(s.adminId, () => db.query('SELECT id FROM public.assembly_attendance WHERE assembly_id = $1', [s.assemblyId]));
        expect(admin.rows).toHaveLength(2);
    });

    it('nadie autenticado escribe directo: todo pasa por el servidor', async () => {
        const s = await seed();
        await expect(asUser(s.adminId, () => db.query(`UPDATE public.assemblies SET title = 'x' WHERE id = $1`, [s.assemblyId]))).rejects.toThrow(/permission denied/);
        await expect(asUser(s.ownerId, () => db.query(`INSERT INTO public.assembly_votes (assembly_id, agenda_item_id, community_id, unit_id, attendance_id, choice, weight, mode)
            SELECT $1, $2, $3, $4, id, 'yes', 600, 'remote' FROM public.assembly_attendance WHERE unit_id = $4`, [s.assemblyId, s.itemId, s.communityId, s.unitA]))).rejects.toThrow(/permission denied/);
        // TRUNCATE ignora el RLS: tampoco debe estar concedido.
        await expect(asUser(s.adminId, () => db.query('TRUNCATE public.assembly_votes'))).rejects.toThrow(/permission denied/);
    });

    it('el acta en borrador la ven admin y comité; firmada, todos', async () => {
        const s = await seed();
        await db.query(`INSERT INTO public.assembly_minutes (assembly_id, community_id, content, generated_content, due_on) VALUES ($1,$2,'Acta borrador','Acta borrador', CURRENT_DATE + 30)`, [s.assemblyId, s.communityId]);
        const resident = await asUser(s.ownerId, () => db.query('SELECT id FROM public.assembly_minutes WHERE assembly_id = $1', [s.assemblyId]));
        expect(resident.rows).toHaveLength(0);
        const committee = await asUser(s.committeeId, () => db.query('SELECT id FROM public.assembly_minutes WHERE assembly_id = $1', [s.assemblyId]));
        expect(committee.rows).toHaveLength(1);
        await db.query(`UPDATE public.assembly_minutes SET status = 'signed', signed_at = now(), signed_by = $2, signers = 'Comité' WHERE assembly_id = $1`, [s.assemblyId, s.adminId]);
        const after = await asUser(s.ownerId, () => db.query('SELECT id FROM public.assembly_minutes WHERE assembly_id = $1', [s.assemblyId]));
        expect(after.rows).toHaveLength(1);
        await expect(db.query(`UPDATE public.assembly_minutes SET content = 'otra' WHERE assembly_id = $1`, [s.assemblyId])).rejects.toThrow(/ya está firmada/);
    });
});

describe('reglas en la base', () => {
    it('el administrador no puede ser apoderado ni asistir representando', async () => {
        const s = await seed();
        await expect(db.query(`INSERT INTO public.assembly_proxies (assembly_id, community_id, unit_id, kind, proxy_profile_id, status) VALUES ($1,$2,$3,'proxy',$4,'accepted')`,
            [s.assemblyId, s.communityId, s.unitA, s.adminId])).rejects.toThrow(/administrador no puede representar/);
        // Como titular de su propia unidad sí puede asistir (DS 7, art. 22).
        await db.query(`UPDATE public.assembly_attendance SET attendee_profile_id = $1, capacity = 'owner' WHERE assembly_id = $2 AND unit_id = $3`, [s.adminId, s.assemblyId, s.unitB]);
        await expect(db.query(`UPDATE public.assembly_attendance SET capacity = 'occupant' WHERE assembly_id = $1 AND unit_id = $2`, [s.assemblyId, s.unitB])).rejects.toThrow(/administrador no puede representar/);
    });

    it('solo se vota con la sesión en curso y el punto abierto; un voto por unidad', async () => {
        const s = await seed();
        const insertVote = (choice: string) => db.query(`INSERT INTO public.assembly_votes (assembly_id, agenda_item_id, community_id, unit_id, attendance_id, choice, weight, mode)
            SELECT $1, $2, $3, $4, id, $5, 600, 'remote' FROM public.assembly_attendance WHERE assembly_id = $1 AND unit_id = $4`, [s.assemblyId, s.itemId, s.communityId, s.unitA, choice]);
        await expect(insertVote('yes')).rejects.toThrow(/no está abierta/);
        await db.query(`UPDATE public.assemblies SET status = 'in_progress' WHERE id = $1`, [s.assemblyId]);
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'open' WHERE id = $1`, [s.itemId]);
        await insertVote('yes');
        await expect(insertVote('no')).rejects.toThrow(/duplicate key|unique/i);
        await db.query(`UPDATE public.assembly_agenda_items SET voting_status = 'closed', outcome = 'approved', result = '{}'::jsonb WHERE id = $1`, [s.itemId]);
        await expect(db.query(`UPDATE public.assembly_votes SET choice = 'no' WHERE agenda_item_id = $1`, [s.itemId])).rejects.toThrow(/no está abierta/);
    });

    it('una sesión telemática no se puede citar sin enlace', async () => {
        const s = await seed();
        await expect(db.query(`INSERT INTO public.assemblies (community_id, title, session_type, modality, scheduled_at, status, citation_text, cited_at)
            VALUES ($1, 'Sin enlace', 'ordinary', 'remote', now(), 'cited', 'x', now())`, [s.communityId])).rejects.toThrow(/assemblies_link_for_online/);
    });
});
