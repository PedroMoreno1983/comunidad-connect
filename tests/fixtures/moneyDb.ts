/**
 * Base Postgres real (PGlite) con TODAS las migraciones de supabase/migrations
 * aplicadas en orden, para los tests de punta a punta de los flujos de dinero.
 *
 * El historial de migraciones no se puede reproducir desde cero tal cual: unas
 * pocas tablas y funciones se crearon fuera de las migraciones (panel de
 * Supabase, `supabase/legacy_migrations/`, `schema_rpc_match_memories.sql`) y
 * algunas migraciones antiguas chocan por orden de nombre. Para esos casos hay
 * una lista corta y explícita de "puentes" (`DRIFT_BRIDGES`) que se aplican
 * justo antes de la migración que los necesita. Cada puente toma la definición
 * real de producción: la tabla del retrato `schema.sql` (con su PK y su RLS
 * activado) o la función desde la
 * migración del repo que la define. Ninguna migración de dinero necesita
 * puente: se aplican intactas.
 *
 * Lo único simulado es lo que en Supabase provee la plataforma: roles
 * (`anon`, `authenticated`, `service_role` con BYPASSRLS), `auth.uid()`,
 * `auth.role()`, `auth.jwt()`, `auth.users`, Storage y la publicación de
 * Realtime.
 *
 * `check_function_bodies = off` (igual que hace pg_dump al restaurar) solo
 * posterga la validación del cuerpo de funciones SQL a su primera ejecución;
 * los tests ejecutan las funciones de dinero, así que un cuerpo roto igual
 * falla.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { vector } from '@electric-sql/pglite-pgvector';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

const ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(ROOT, 'supabase/migrations');

const PLATFORM = `
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  raw_app_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.role', true), '')::text
$$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
GRANT USAGE ON SCHEMA auth TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA public TO authenticated, anon, service_role;
GRANT USAGE ON SCHEMA extensions TO authenticated, anon, service_role;
-- Privilegios por defecto de Supabase: toda tabla y función nueva queda abierta
-- a los tres roles y cada migración restringe con REVOKE/RLS.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
  id text PRIMARY KEY, name text, public boolean DEFAULT false, file_size_limit bigint,
  allowed_mime_types text[], owner uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text REFERENCES storage.buckets(id), name text,
  owner uuid, metadata jsonb, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;
CREATE FUNCTION storage.filename(name text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]
$$;
GRANT USAGE ON SCHEMA storage TO authenticated, anon, service_role;

CREATE PUBLICATION supabase_realtime;
`;

interface Bridge {
    /** Por qué hace falta (deriva conocida entre el repo y producción). */
    reason: string;
    /** Tablas tomadas del retrato de producción `schema.sql` (con su PK). */
    tables?: string[];
    /** Funciones tomadas de la migración del repo que las define. */
    functions?: string[];
    /** Archivos SQL del repo aplicados tal cual. */
    files?: string[];
    sql?: string;
}

/** Puentes mínimos para reproducir el historial; ninguno toca dinero. */
export const DRIFT_BRIDGES: Record<string, Bridge> = {
    '007_service_requests.sql': {
        reason: '001 ya crea service_requests sin user_id; en producción se recreó con legacy_migrations/007_service_requests_v3.sql (DROP + CREATE).',
        sql: 'DROP TABLE IF EXISTS public.service_requests CASCADE;',
    },
    '037_coco_sessions_lockdown.sql': { reason: 'coco_sessions se creó desde el panel.', tables: ['coco_sessions'] },
    '040_ai_budget_scale_defaults.sql': { reason: 'ai_budgets se creó desde el panel.', tables: ['ai_budgets'] },
    '043_training_multitenant_progress.sql': {
        reason: 'Usa helpers que en el repo recién define 20260516000000 (en producción ya existían).',
        functions: ['current_profile_community_id', 'current_profile_role'],
    },
    '048_profile_role_privacy_hardening.sql': { reason: 'visitor_logs se creó desde el panel.', tables: ['visitor_logs'] },
    '051_announcements_author_name.sql': {
        reason: '012 renombra profiles.name a full_name; producción tiene ambas columnas.',
        sql: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS name text;',
    },
    '20260429_hybrid_search.sql': {
        reason: 'Redefine con otro tipo de retorno funciones que 019/020 ya crearon (orden de nombres distinto al de aplicación).',
        sql: `DROP FUNCTION IF EXISTS public.search_marketplace_lexical(text);
              DROP FUNCTION IF EXISTS public.search_profiles_lexical(text);
              DROP FUNCTION IF EXISTS public.search_marketplace_semantic(vector, integer);
              DROP FUNCTION IF EXISTS public.search_marketplace_semantic(vector, double precision, integer);`,
    },
    '20260516000000_showcase_operational_tables.sql': { reason: 'notifications viene de legacy_migrations/phase5.', tables: ['notifications'] },
    '20260717120000_fix_confirmed_privilege_escalation.sql': { reason: 'agent_memories viene de schema_coco_memories.sql.', tables: ['agent_memories'] },
    '20260717140000_p0_remaining_rls_hardening.sql': {
        reason: 'Tablas sociales de legacy_migrations/phase4 y match_agent_memories de schema_rpc_match_memories.sql.',
        tables: ['social_posts', 'social_comments', 'chat_messages'],
        functions: ['increment_post_likes'],
        files: ['schema_rpc_match_memories.sql'],
    },
    '20260720120000_privacy_compliance_foundation.sql': {
        reason: 'profiles.whatsapp_enabled se agregó desde el panel.',
        sql: 'ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT FALSE;',
    },
};

let schemaSnapshot: string | null = null;

function snapshotTable(name: string): string {
    schemaSnapshot ??= readFileSync(resolve(ROOT, 'schema.sql'), 'utf8');
    const schema = schemaSnapshot;
    let start = schema.indexOf(`CREATE TABLE IF NOT EXISTS "public"."${name}" (`);
    if (start < 0) start = schema.indexOf(`CREATE TABLE IF NOT EXISTS public.${name} (`);
    if (start < 0) throw new Error(`schema.sql no tiene la tabla ${name}`);
    let sql = schema.slice(start, schema.indexOf('\n);', start) + 3);
    const pk = new RegExp(`ALTER TABLE ONLY "public"\\."${name}"\\s+ADD CONSTRAINT "[^"]+" PRIMARY KEY \\([^)]*\\);`).exec(schema);
    if (pk) sql += `\n${pk[0]}`;
    // El RLS de esas tablas se activó fuera de las migraciones (que solo crean sus
    // políticas): sin esto la tabla quedaría abierta en el test y no en producción.
    const rls = new RegExp(`ALTER TABLE (ONLY )?("public"\\."${name}"|public\\.${name}) ENABLE ROW LEVEL SECURITY;`).exec(schema);
    if (rls) sql += `\n${rls[0]}`;
    return sql;
}

function migrationFunction(name: string): string {
    for (const file of migrationFiles()) {
        const sql = readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8');
        const match = new RegExp(`CREATE (OR REPLACE )?FUNCTION (public\\.)?"?${name}"?\\s*\\(`, 'i').exec(sql);
        if (!match) continue;
        const bodyStart = sql.indexOf('$$', match.index);
        const bodyEnd = sql.indexOf('$$', bodyStart + 2);
        return sql.slice(match.index, sql.indexOf(';', bodyEnd) + 1);
    }
    throw new Error(`Ninguna migración define ${name}`);
}

export function migrationFiles(): string[] {
    return readdirSync(MIGRATIONS_DIR).filter(file => file.endsWith('.sql')).sort();
}

export interface MoneyDbInfo {
    migrations: number;
    bridged: string[];
    millis: number;
}

export async function createMoneyDb(): Promise<{ db: PGlite; info: MoneyDbInfo }> {
    const started = Date.now();
    const db = await PGlite.create({ extensions: { vector, pgcrypto, pg_trgm, uuid_ossp, btree_gist } });
    await db.exec(PLATFORM);
    await db.exec('SET check_function_bodies = off;');
    const files = migrationFiles();
    const bridged: string[] = [];
    for (const file of files) {
        const bridge = DRIFT_BRIDGES[file];
        if (bridge) {
            bridged.push(file);
            for (const table of bridge.tables ?? []) await db.exec(snapshotTable(table));
            for (const fn of bridge.functions ?? []) await db.exec(migrationFunction(fn));
            for (const extra of bridge.files ?? []) await db.exec(readFileSync(resolve(ROOT, extra), 'utf8'));
            if (bridge.sql) await db.exec(bridge.sql);
        }
        try {
            await db.exec(readFileSync(resolve(MIGRATIONS_DIR, file), 'utf8'));
        } catch (error) {
            throw new Error(`La migración ${file} no se pudo aplicar: ${(error as Error).message}`);
        }
    }
    await db.exec('RESET check_function_bodies;');
    return { db, info: { migrations: files.length, bridged, millis: Date.now() - started } };
}
