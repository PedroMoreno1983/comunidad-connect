/**
 * Cliente con la forma de supabase-js que traduce cada consulta a SQL y la
 * ejecuta en un Postgres real en memoria (PGlite).
 *
 * Sirve para correr los servicios TypeScript de la app (billingService,
 * collectionService, agreementService, reconcileCredits, el webhook de
 * Haulmer…) sin red y contra el esquema real de las migraciones: triggers,
 * restricciones, RPC y RLS corren en Postgres, no en un mock.
 *
 * Cada llamada es una transacción, como una petición a PostgREST, con el rol
 * que corresponda: `service_role` (BYPASSRLS, el cliente admin del servidor),
 * `authenticated` con `auth.uid()` simulado, o `anon`.
 *
 * Cubre el subconjunto de PostgREST que usan los flujos de dinero: select con
 * recursos embebidos por FK (`rel(cols)`, `alias:rel!fkey!inner(cols)`),
 * filtros eq/neq/gt/gte/lt/lte/in/is/like/ilike/not/match (también sobre
 * columnas embebidas `rel.col`), order, limit, range, count, single,
 * maybeSingle, insert/update/delete/upsert con `.select()` y rpc. Lo que no
 * cubre lo rechaza con un error explícito en vez de responder algo distinto
 * a PostgREST.
 */

import type { PGlite, Transaction } from '@electric-sql/pglite';

type Row = Record<string, unknown>;
type Queryable = PGlite | Transaction;

export type PgliteRole = { kind: 'service_role' } | { kind: 'anon' } | { kind: 'user'; userId: string };

export interface PostgrestLikeError {
    message: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
}

interface Result<T = unknown> {
    data: T;
    error: PostgrestLikeError | null;
    count?: number | null;
    status: number;
    statusText: string;
}

const IDENT = /^[a-z_][a-z0-9_]*$/;

function ident(name: string): string {
    if (!IDENT.test(name)) throw new Error(`[supabasePglite] identificador no soportado: ${name}`);
    return `"${name}"`;
}

// ---------------------------------------------------------------------------
// Catálogo (tipos de columna y FKs), cacheado por instancia de base
// ---------------------------------------------------------------------------

interface ForeignKey { name: string; from: string; fromColumn: string; to: string; toColumn: string }
interface Catalog {
    columns: Map<string, Map<string, string>>;
    primaryKeys: Map<string, string[]>;
    foreignKeys: ForeignKey[];
    functions: Map<string, Array<{ args: Array<{ name: string; type: string; hasDefault: boolean }>; returnsSet: boolean; returnsComposite: boolean }>>;
}

const catalogs = new WeakMap<PGlite, Catalog>();

async function loadCatalog(db: PGlite): Promise<Catalog> {
    const cached = catalogs.get(db);
    if (cached) return cached;
    const columns = new Map<string, Map<string, string>>();
    const { rows: columnRows } = await db.query<{ table_name: string; column_name: string; type: string }>(`
        SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS type
        FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v', 'p', 'm') AND a.attnum > 0 AND NOT a.attisdropped`);
    for (const row of columnRows) {
        if (!columns.has(row.table_name)) columns.set(row.table_name, new Map());
        columns.get(row.table_name)!.set(row.column_name, row.type);
    }
    const { rows: pkRows } = await db.query<{ table_name: string; column_name: string }>(`
        SELECT c.relname AS table_name, a.attname AS column_name
        FROM pg_constraint k JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN LATERAL unnest(k.conkey) WITH ORDINALITY AS u(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = u.attnum
        WHERE n.nspname = 'public' AND k.contype = 'p' ORDER BY u.ord`);
    const primaryKeys = new Map<string, string[]>();
    for (const row of pkRows) primaryKeys.set(row.table_name, [...(primaryKeys.get(row.table_name) || []), row.column_name]);
    const { rows: fkRows } = await db.query<{ name: string; from_table: string; from_column: string; to_table: string; to_column: string }>(`
        SELECT k.conname AS name, c.relname AS from_table, a.attname AS from_column, rc.relname AS to_table, ra.attname AS to_column
        FROM pg_constraint k
        JOIN pg_class c ON c.oid = k.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace
        JOIN pg_class rc ON rc.oid = k.confrelid JOIN pg_namespace rn ON rn.oid = rc.relnamespace
        JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.conkey[1]
        JOIN pg_attribute ra ON ra.attrelid = rc.oid AND ra.attnum = k.confkey[1]
        WHERE k.contype = 'f' AND n.nspname = 'public' AND rn.nspname = 'public' AND array_length(k.conkey, 1) = 1`);
    const foreignKeys = fkRows.map(row => ({ name: row.name, from: row.from_table, fromColumn: row.from_column, to: row.to_table, toColumn: row.to_column }));
    const { rows: fnRows } = await db.query<{ name: string; arg_names: string[] | null; arg_types: string[]; nargdefaults: number; retset: boolean; composite: boolean }>(`
        SELECT p.proname AS name, p.proargnames AS arg_names,
               ARRAY(SELECT format_type(t, NULL) FROM unnest(p.proargtypes) AS t) AS arg_types,
               p.pronargdefaults AS nargdefaults, p.proretset AS retset,
               (SELECT typtype = 'c' FROM pg_type WHERE oid = p.prorettype) AS composite
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`);
    const functions: Catalog['functions'] = new Map();
    for (const row of fnRows) {
        const names = row.arg_names || [];
        const args = row.arg_types.map((type, index) => ({
            name: names[index] || `$${index + 1}`, type, hasDefault: index >= row.arg_types.length - row.nargdefaults,
        }));
        functions.set(row.name, [...(functions.get(row.name) || []), { args, returnsSet: row.retset, returnsComposite: row.composite }]);
    }
    const catalog = { columns, primaryKeys, foreignKeys, functions };
    catalogs.set(db, catalog);
    return catalog;
}

/** Invalida el catálogo (p. ej. tras crear tablas en un test). */
export function resetCatalog(db: PGlite) {
    catalogs.delete(db);
}

function columnType(catalog: Catalog, table: string, column: string): string {
    const type = catalog.columns.get(table)?.get(column);
    if (!type) throw new Error(`[supabasePglite] la columna ${table}.${column} no existe`);
    return type;
}

function encodeParam(value: unknown, type: string): unknown {
    if (value === null || value === undefined) return null;
    if ((type === 'jsonb' || type === 'json')) return JSON.stringify(value);
    if (type.endsWith('[]')) {
        if (!Array.isArray(value)) return value;
        const items = value.map(item => item === null ? 'NULL' : `"${String(item).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
        return `{${items.join(',')}}`;
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') return JSON.stringify(value);
    return value;
}

/**
 * Literales tipados en vez de parámetros posicionales: así una misma consulta
 * puede armarse por partes (proyección, conteo, EXISTS) sin desalinear $n.
 * Con standard_conforming_strings (por defecto) basta con duplicar la comilla.
 */
class Params {
    readonly values: unknown[] = [];
    add(value: unknown, type: string): string {
        const encoded = encodeParam(value, type);
        if (encoded === null) return `NULL::${type}`;
        const text = typeof encoded === 'boolean' ? (encoded ? 'true' : 'false') : String(encoded);
        return `'${text.replace(/'/g, "''")}'::${type}`;
    }
}

// ---------------------------------------------------------------------------
// Parser del select de PostgREST
// ---------------------------------------------------------------------------

interface SelectColumn { kind: 'column'; name: string; alias: string | null }
interface SelectStar { kind: 'star' }
interface SelectEmbed { kind: 'embed'; relation: string; alias: string; hint: string | null; inner: boolean; children: SelectItem[] }
type SelectItem = SelectColumn | SelectStar | SelectEmbed;

function splitTopLevel(input: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of input) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0) { parts.push(current); current = ''; continue; }
        current += char;
    }
    if (current.trim()) parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
}

function parseSelect(input: string): SelectItem[] {
    const text = input.replace(/\s+/g, ' ').trim() || '*';
    return splitTopLevel(text).map(part => {
        if (part === '*') return { kind: 'star' } as SelectStar;
        const open = part.indexOf('(');
        if (open >= 0) {
            if (!part.endsWith(')')) throw new Error(`[supabasePglite] select no soportado: ${part}`);
            const head = part.slice(0, open).trim();
            const children = parseSelect(part.slice(open + 1, -1));
            const [aliasPart, refPart] = head.includes(':') ? head.split(':') : [null, head];
            const [relation, ...modifiers] = refPart!.split('!').map(item => item.trim());
            const inner = modifiers.includes('inner');
            const hint = modifiers.find(item => item !== 'inner' && item !== 'left') ?? null;
            return { kind: 'embed', relation, alias: (aliasPart || relation).trim(), hint, inner, children } as SelectEmbed;
        }
        if (part.includes('::')) throw new Error(`[supabasePglite] casts en select no soportados: ${part}`);
        const [alias, name] = part.includes(':') ? part.split(':').map(item => item.trim()) : [null, part];
        return { kind: 'column', name: name!, alias } as SelectColumn;
    });
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

type Operator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'is' | 'like' | 'ilike';
interface Filter { path: string[]; column: string; op: Operator; value: unknown; negate: boolean }

function parseInList(value: unknown): unknown[] {
    if (Array.isArray(value)) return value;
    const text = String(value).trim();
    if (!text.startsWith('(') || !text.endsWith(')')) throw new Error(`[supabasePglite] lista in no soportada: ${text}`);
    return splitTopLevel(text.slice(1, -1)).map(item => item.replace(/^"|"$/g, ''));
}

function filterSql(filter: Filter, alias: string, table: string, catalog: Catalog, params: Params): string {
    const type = columnType(catalog, table, filter.column);
    const column = `${alias}.${ident(filter.column)}`;
    let sql: string;
    switch (filter.op) {
        case 'eq': sql = `${column} = ${params.add(filter.value, type)}`; break;
        case 'neq': sql = `${column} <> ${params.add(filter.value, type)}`; break;
        case 'gt': sql = `${column} > ${params.add(filter.value, type)}`; break;
        case 'gte': sql = `${column} >= ${params.add(filter.value, type)}`; break;
        case 'lt': sql = `${column} < ${params.add(filter.value, type)}`; break;
        case 'lte': sql = `${column} <= ${params.add(filter.value, type)}`; break;
        case 'like': sql = `${column}::text LIKE ${params.add(filter.value, 'text')}`; break;
        case 'ilike': sql = `${column}::text ILIKE ${params.add(filter.value, 'text')}`; break;
        case 'in': {
            const list = parseInList(filter.value);
            sql = list.length === 0 ? 'FALSE' : `${column} IN (${list.map(item => params.add(item, type)).join(', ')})`;
            break;
        }
        case 'is': {
            const value = filter.value === null || filter.value === 'null' ? 'NULL'
                : filter.value === true || filter.value === 'true' ? 'TRUE'
                    : filter.value === false || filter.value === 'false' ? 'FALSE' : null;
            if (!value) throw new Error(`[supabasePglite] is(${String(filter.value)}) no soportado`);
            sql = `${column} IS ${value}`;
            break;
        }
        default: throw new Error(`[supabasePglite] operador no soportado: ${String(filter.op)}`);
    }
    return filter.negate ? `NOT (${sql})` : sql;
}

// ---------------------------------------------------------------------------
// Generación de SQL para el select (con embebidos)
// ---------------------------------------------------------------------------

interface Relationship { fk: ForeignKey; toOne: boolean }

function resolveRelationship(catalog: Catalog, base: string, embed: SelectEmbed): Relationship {
    const candidates: Relationship[] = [];
    for (const fk of catalog.foreignKeys) {
        if (fk.from === base && fk.to === embed.relation) candidates.push({ fk, toOne: true });
        if (fk.from === embed.relation && fk.to === base) candidates.push({ fk, toOne: false });
    }
    const hinted = embed.hint
        ? candidates.filter(item => item.fk.name === embed.hint || item.fk.fromColumn === embed.hint)
        : candidates;
    if (hinted.length !== 1) {
        throw new Error(`[supabasePglite] relación ${base} → ${embed.relation}${embed.hint ? `!${embed.hint}` : ''}: ${hinted.length} candidatas`);
    }
    return hinted[0];
}

let aliasCounter = 0;

function joinCondition(rel: Relationship, baseAlias: string, embedAlias: string): string {
    return rel.toOne
        ? `${embedAlias}.${ident(rel.fk.toColumn)} = ${baseAlias}.${ident(rel.fk.fromColumn)}`
        : `${embedAlias}.${ident(rel.fk.fromColumn)} = ${baseAlias}.${ident(rel.fk.toColumn)}`;
}

/** Columnas del SELECT interno (antes de row_to_json) para una tabla y su lista de items. */
function selectList(
    items: SelectItem[], table: string, alias: string, catalog: Catalog, params: Params,
    filters: Filter[], path: string[],
): { columns: string[]; innerConditions: string[] } {
    const columns: string[] = [];
    const innerConditions: string[] = [];
    for (const item of items) {
        if (item.kind === 'star') { columns.push(`${alias}.*`); continue; }
        if (item.kind === 'column') {
            columnType(catalog, table, item.name);
            columns.push(`${alias}.${ident(item.name)} AS ${ident(item.alias || item.name)}`);
            continue;
        }
        const rel = resolveRelationship(catalog, table, item);
        const embedAlias = `e${++aliasCounter}`;
        const embedPath = [...path, item.alias];
        const embedFilters = filters.filter(filter => filter.path.join('.') === embedPath.join('.'));
        const nested = selectList(item.children, item.relation, embedAlias, catalog, params, filters, embedPath);
        const where = [joinCondition(rel, alias, embedAlias),
            ...embedFilters.map(filter => filterSql(filter, embedAlias, item.relation, catalog, params)),
            ...nested.innerConditions];
        const inner = `SELECT ${nested.columns.join(', ') || `${embedAlias}.*`} FROM public.${ident(item.relation)} ${embedAlias} WHERE ${where.join(' AND ')}`;
        const sub = `s${++aliasCounter}`;
        columns.push(rel.toOne
            ? `(SELECT row_to_json(${sub}) FROM (${inner} LIMIT 1) ${sub}) AS ${ident(item.alias)}`
            : `(SELECT coalesce(json_agg(row_to_json(${sub})), '[]'::json) FROM (${inner}) ${sub}) AS ${ident(item.alias)}`);
        if (item.inner) {
            const existsAlias = `x${++aliasCounter}`;
            const existsNested = selectList(item.children, item.relation, existsAlias, catalog, params, filters, embedPath);
            const existsWhere = [joinCondition(rel, alias, existsAlias),
                ...embedFilters.map(filter => filterSql(filter, existsAlias, item.relation, catalog, params)),
                ...existsNested.innerConditions];
            innerConditions.push(`EXISTS (SELECT 1 FROM public.${ident(item.relation)} ${existsAlias} WHERE ${existsWhere.join(' AND ')})`);
        }
    }
    return { columns, innerConditions };
}

function pgError(error: unknown): PostgrestLikeError {
    const e = error as { message?: string; code?: string; detail?: string; hint?: string };
    return { message: e?.message || String(error), code: e?.code, details: e?.detail ?? null, hint: e?.hint ?? null };
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

type Kind = 'select' | 'insert' | 'update' | 'delete' | 'upsert';

interface Order { path: string[]; column: string; ascending: boolean; nullsFirst?: boolean }

export interface PgliteClientOptions {
    /** Se llama con cada SQL ejecutado (para depurar). */
    onQuery?: (sql: string, params: unknown[]) => void;
}

export type PgliteSupabase = ReturnType<typeof createPgliteSupabase>;

export function createPgliteSupabase(db: PGlite, role: PgliteRole = { kind: 'service_role' }, options: PgliteClientOptions = {}) {
    async function run<T>(work: (tx: Queryable) => Promise<T>): Promise<T> {
        return db.transaction(async tx => {
            if (role.kind === 'service_role') {
                await tx.exec(`SET LOCAL ROLE service_role`);
                await tx.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true), set_config('request.jwt.claim.sub', '', true)`);
            } else if (role.kind === 'anon') {
                await tx.exec(`SET LOCAL ROLE anon`);
                await tx.query(`SELECT set_config('request.jwt.claim.role', 'anon', true), set_config('request.jwt.claim.sub', '', true)`);
            } else {
                await tx.exec(`SET LOCAL ROLE authenticated`);
                await tx.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.sub', $1, true),
                    set_config('request.jwt.claims', $2, true)`, [role.userId, JSON.stringify({ sub: role.userId, role: 'authenticated' })]);
            }
            return work(tx);
        });
    }

    async function query(tx: Queryable, sql: string, params: unknown[]) {
        options.onQuery?.(sql, params);
        return tx.query<Row>(sql, params);
    }

    function from(table: string) {
        if (!IDENT.test(table)) throw new Error(`[supabasePglite] tabla no soportada: ${table}`);
        let kind: Kind = 'select';
        let selectText: string | null = null;
        let returning = false;
        let countMode: 'exact' | null = null;
        let head = false;
        let payload: Row | Row[] | null = null;
        let onConflict: string | null = null;
        let ignoreDuplicates = false;
        const filters: Filter[] = [];
        const orders: Order[] = [];
        let limit: number | null = null;
        let offset: number | null = null;
        let single: 'single' | 'maybe' | null = null;

        const addFilter = (rawColumn: string, op: Operator, value: unknown, negate = false) => {
            const parts = rawColumn.split('.');
            const column = parts.pop()!;
            filters.push({ path: parts, column, op, value, negate });
            return builder;
        };

        async function execute(): Promise<Result> {
            const catalog = await loadCatalog(db);
            if (!catalog.columns.has(table)) {
                return { data: null, error: { message: `relation "public.${table}" does not exist`, code: '42P01' }, status: 404, statusText: 'Not Found' };
            }
            const params = new Params();
            const items = parseSelect(selectText ?? '*');
            const baseFilters = filters.filter(filter => filter.path.length === 0);
            const where = baseFilters.map(filter => filterSql(filter, 't0', table, catalog, params));
            const projection = () => selectList(items, table, 't0', catalog, params, filters, []);

            const orderSql = () => {
                const parts = orders.map(order => {
                    if (order.path.length) throw new Error('[supabasePglite] order sobre embebidos no soportado');
                    columnType(catalog, table, order.column);
                    const nulls = order.nullsFirst === undefined ? '' : order.nullsFirst ? ' NULLS FIRST' : ' NULLS LAST';
                    return `t0.${ident(order.column)} ${order.ascending ? 'ASC' : 'DESC'}${nulls}`;
                });
                return parts.length ? ` ORDER BY ${parts.join(', ')}` : '';
            };
            const pageSql = () => `${limit !== null ? ` LIMIT ${limit}` : ''}${offset !== null ? ` OFFSET ${offset}` : ''}`;

            try {
                return await run(async tx => {
                    if (kind === 'select') {
                        const projected = projection();
                        const conditions = [...where, ...projected.innerConditions];
                        const whereSql = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';
                        let count: number | null = null;
                        if (countMode) {
                            // Parámetros propios: el conteo no lleva la proyección.
                            const countParams = new Params();
                            const countWhere = [
                                ...baseFilters.map(filter => filterSql(filter, 't0', table, catalog, countParams)),
                                ...selectList(items, table, 't0', catalog, countParams, filters, []).innerConditions,
                            ];
                            const { rows } = await query(tx, `SELECT count(*)::int AS n FROM public.${ident(table)} t0${countWhere.length ? ` WHERE ${countWhere.join(' AND ')}` : ''}`, countParams.values);
                            count = Number(rows[0].n);
                        }
                        if (head) return { data: null, error: null, count, status: 200, statusText: 'OK' };
                        const sql = `SELECT row_to_json(r) AS row FROM (SELECT ${projected.columns.join(', ')} FROM public.${ident(table)} t0${whereSql}${orderSql()}${pageSql()}) r`;
                        const { rows } = await query(tx, sql, params.values);
                        return finish(rows.map(row => row.row as Row), count);
                    }

                    let mutation: string;
                    if (kind === 'insert' || kind === 'upsert') {
                        const list = Array.isArray(payload) ? payload : [payload || {}];
                        if (list.length === 0) return finish([], null);
                        const columns = [...new Set(list.flatMap(row => Object.keys(row)))];
                        for (const column of columns) columnType(catalog, table, column);
                        const values = list.map(row => `(${columns.map(column => (
                            column in row ? params.add(row[column], columnType(catalog, table, column)) : 'DEFAULT'
                        )).join(', ')})`);
                        mutation = `INSERT INTO public.${ident(table)} AS t0 (${columns.map(ident).join(', ')}) VALUES ${values.join(', ')}`;
                        if (kind === 'upsert') {
                            const target = (onConflict ? onConflict.split(',').map(item => item.trim()) : catalog.primaryKeys.get(table) || []);
                            if (!target.length) throw new Error(`[supabasePglite] upsert sin clave en ${table}`);
                            const updatable = columns.filter(column => !target.includes(column));
                            mutation += ` ON CONFLICT (${target.map(ident).join(', ')}) `
                                + (ignoreDuplicates || updatable.length === 0
                                    ? 'DO NOTHING'
                                    : `DO UPDATE SET ${updatable.map(column => `${ident(column)} = EXCLUDED.${ident(column)}`).join(', ')}`);
                        }
                    } else if (kind === 'update') {
                        const entries = Object.entries(payload as Row);
                        if (!entries.length) throw new Error('[supabasePglite] update vacío');
                        const sets = entries.map(([column, value]) => `${ident(column)} = ${params.add(value, columnType(catalog, table, column))}`);
                        mutation = `UPDATE public.${ident(table)} AS t0 SET ${sets.join(', ')}${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
                    } else {
                        mutation = `DELETE FROM public.${ident(table)} AS t0${where.length ? ` WHERE ${where.join(' AND ')}` : ''}`;
                    }

                    if (!returning) {
                        const result = await query(tx, `${mutation}`, params.values);
                        return { data: null, error: null, count: countMode ? (result.affectedRows ?? null) : null, status: kind === 'insert' ? 201 : 204, statusText: 'OK' };
                    }
                    // Las filas devueltas se proyectan igual que un select, embebidos incluidos.
                    const returned = `m${++aliasCounter}`;
                    const projected = selectList(items, table, 't0', catalog, params, filters, []);
                    const sql = `WITH ${returned} AS (${mutation} RETURNING t0.*)
                        SELECT row_to_json(r) AS row FROM (SELECT ${projected.columns.join(', ')} FROM ${returned} t0${projected.innerConditions.length ? ` WHERE ${projected.innerConditions.join(' AND ')}` : ''}${orderSql()}${pageSql()}) r`;
                    const { rows } = await query(tx, sql, params.values);
                    return finish(rows.map(row => row.row as Row), null);
                });
            } catch (error) {
                if (error instanceof Error && error.message.startsWith('[supabasePglite]')) throw error;
                return { data: null, error: pgError(error), count: null, status: 400, statusText: 'Bad Request' };
            }
        }

        function finish(rows: Row[], count: number | null): Result {
            if (single) {
                if (rows.length === 1) return { data: rows[0], error: null, count, status: 200, statusText: 'OK' };
                if (rows.length === 0 && single === 'maybe') return { data: null, error: null, count, status: 200, statusText: 'OK' };
                return {
                    data: null,
                    error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: `The result contains ${rows.length} rows` },
                    count, status: 406, statusText: 'Not Acceptable',
                };
            }
            return { data: rows, error: null, count, status: 200, statusText: 'OK' };
        }

        const builder = {
            select(columns?: string, opts?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean }) {
                selectText = columns ?? '*';
                if (kind !== 'select') returning = true;
                if (opts?.count) countMode = 'exact';
                if (opts?.head) head = true;
                return builder;
            },
            insert(value: Row | Row[], opts?: { count?: 'exact' }) { kind = 'insert'; payload = value; if (opts?.count) countMode = 'exact'; return builder; },
            upsert(value: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean }) {
                kind = 'upsert'; payload = value; onConflict = opts?.onConflict ?? null; ignoreDuplicates = Boolean(opts?.ignoreDuplicates); return builder;
            },
            update(value: Row, opts?: { count?: 'exact' }) { kind = 'update'; payload = value; if (opts?.count) countMode = 'exact'; return builder; },
            delete(opts?: { count?: 'exact' }) { kind = 'delete'; if (opts?.count) countMode = 'exact'; return builder; },
            eq: (column: string, value: unknown) => addFilter(column, 'eq', value),
            neq: (column: string, value: unknown) => addFilter(column, 'neq', value),
            gt: (column: string, value: unknown) => addFilter(column, 'gt', value),
            gte: (column: string, value: unknown) => addFilter(column, 'gte', value),
            lt: (column: string, value: unknown) => addFilter(column, 'lt', value),
            lte: (column: string, value: unknown) => addFilter(column, 'lte', value),
            in: (column: string, values: unknown[]) => addFilter(column, 'in', values),
            is: (column: string, value: unknown) => addFilter(column, 'is', value),
            like: (column: string, value: string) => addFilter(column, 'like', value),
            ilike: (column: string, value: string) => addFilter(column, 'ilike', value),
            not: (column: string, op: string, value: unknown) => addFilter(column, op as Operator, value, true),
            filter: (column: string, op: string, value: unknown) => addFilter(column, op as Operator, value),
            match: (query: Row) => { for (const [column, value] of Object.entries(query)) addFilter(column, 'eq', value); return builder; },
            or: () => { throw new Error('[supabasePglite] .or() no soportado'); },
            order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
                if (opts?.foreignTable || opts?.referencedTable) throw new Error('[supabasePglite] order en tabla embebida no soportado');
                const parts = column.split('.');
                const name = parts.pop()!;
                orders.push({ path: parts, column: name, ascending: opts?.ascending !== false, nullsFirst: opts?.nullsFirst });
                return builder;
            },
            limit(value: number) { limit = value; return builder; },
            range(fromIndex: number, toIndex: number) { offset = fromIndex; limit = toIndex - fromIndex + 1; return builder; },
            single() { single = 'single'; return builder; },
            maybeSingle() { single = 'maybe'; return builder; },
            abortSignal() { return builder; },
            returns() { return builder; },
            then<TResult1 = Result, TResult2 = never>(
                onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
                onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
            ): Promise<TResult1 | TResult2> {
                return execute().then(onfulfilled, onrejected);
            },
        };
        return builder;
    }

    async function rpc(name: string, args: Row = {}): Promise<Result> {
        const catalog = await loadCatalog(db);
        const overloads = catalog.functions.get(name) || [];
        const keys = Object.keys(args);
        const match = overloads.find(candidate => keys.every(key => candidate.args.some(arg => arg.name === key))
            && candidate.args.every(arg => arg.hasDefault || keys.includes(arg.name)));
        if (!match) {
            return { data: null, error: { message: `Could not find the function public.${name}(${keys.join(', ')})`, code: 'PGRST202' }, status: 404, statusText: 'Not Found' };
        }
        const params = new Params();
        const call = `public.${ident(name)}(${keys.map(key => `${ident(key)} => ${params.add(args[key], match.args.find(arg => arg.name === key)!.type)}`).join(', ')})`;
        try {
            return await run(async tx => {
                if (match.returnsSet || match.returnsComposite) {
                    const { rows } = await query(tx, `SELECT row_to_json(r) AS row FROM ${call} r`, params.values);
                    const data = rows.map(row => row.row as Row);
                    return { data: match.returnsSet ? data : (data[0] ?? null), error: null, count: null, status: 200, statusText: 'OK' };
                }
                const { rows } = await query(tx, `SELECT to_json(${call}) AS value`, params.values);
                return { data: rows[0]?.value ?? null, error: null, count: null, status: 200, statusText: 'OK' };
            });
        } catch (error) {
            return { data: null, error: pgError(error), count: null, status: 400, statusText: 'Bad Request' };
        }
    }

    const storage = {
        from: () => ({
            remove: async () => ({ data: [], error: null }),
            upload: async () => ({ data: null, error: { message: 'storage no disponible en tests' } }),
            createSignedUrl: async () => ({ data: null, error: { message: 'storage no disponible en tests' } }),
        }),
    };

    // Lo mínimo de supabase.auth que usan los servicios del cliente.
    const auth = {
        getUser: async () => ({
            data: { user: role.kind === 'user' ? { id: role.userId } : null },
            error: role.kind === 'user' ? null : { message: 'Auth session missing!' },
        }),
    };

    return { from, rpc, storage, auth };
}
