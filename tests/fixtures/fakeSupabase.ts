/**
 * Supabase en memoria para tests de aislamiento por comunidad.
 *
 * A diferencia de los mocks encadenables que ignoran los filtros, este SI los
 * aplica (eq, neq, in, gte, lte, gt, lt, ilike): si una consulta olvida
 * `.eq('community_id', ...)`, el test ve filas de otra comunidad y falla. Ese
 * es justamente el error que se quiere atrapar.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

export type FakeDb = {
    tables: Record<string, Row[]>;
    updates: Array<{ table: string; payload: Row; matched: number }>;
    inserts: Array<{ table: string; payload: Row }>;
    rpcCalls: Array<{ name: string; args: Row }>;
    rpc: (name: string, args: Row) => Promise<{ data: unknown; error: { message: string } | null }>;
};

export function createFakeDb(tables: Record<string, Row[]> = {}): FakeDb {
    return {
        tables,
        updates: [],
        inserts: [],
        rpcCalls: [],
        rpc: async () => ({ data: null, error: null }),
    };
}

let sequence = 0;

/** Ids con forma de UUID: el codigo de produccion valida ese formato. */
function fakeUuid(n: number) {
    return `aaaaaaaa-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
}

function compare(a: unknown, b: unknown) {
    return String(a ?? '').localeCompare(String(b ?? ''));
}

export function fakeClient(db: FakeDb) {
    function from(table: string) {
        const filters: Filter[] = [];
        let kind: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
        let payload: Row | Row[] | null = null;
        let limit: number | null = null;
        let order: { column: string; ascending: boolean } | null = null;
        let headCount = false;

        const rows = () => (db.tables[table] ||= []);

        const run = () => {
            if (kind === 'insert' || kind === 'upsert') {
                const list = (Array.isArray(payload) ? payload : [payload || {}]).map(item => ({ id: fakeUuid(++sequence), ...item }));
                rows().push(...list);
                for (const item of list) db.inserts.push({ table, payload: item });
                return { data: list, error: null };
            }
            const matched = rows().filter(row => filters.every(filter => filter(row)));
            if (kind === 'update') {
                for (const row of matched) Object.assign(row, payload);
                db.updates.push({ table, payload: (payload || {}) as Row, matched: matched.length });
                return { data: matched.map(row => ({ ...row })), error: null };
            }
            if (kind === 'delete') {
                db.tables[table] = rows().filter(row => !matched.includes(row));
                return { data: matched, error: null };
            }
            let result = [...matched];
            if (order) {
                const { column, ascending } = order;
                result.sort((a, b) => (ascending ? 1 : -1) * compare(a[column], b[column]));
            }
            if (limit !== null) result = result.slice(0, limit);
            // Copias: como en la base real, una lectura no cambia si despues se actualiza la fila.
            return { data: headCount ? null : result.map(row => ({ ...row })), error: null, count: matched.length };
        };

        const builder: Record<string, unknown> = {
            select: (_columns?: string, options?: { head?: boolean }) => {
                if (options?.head) headCount = true;
                return builder;
            },
            insert: (value: Row | Row[]) => { kind = 'insert'; payload = value; return builder; },
            upsert: (value: Row | Row[]) => { kind = 'upsert'; payload = value; return builder; },
            update: (value: Row) => { kind = 'update'; payload = value; return builder; },
            delete: () => { kind = 'delete'; return builder; },
            eq: (column: string, value: unknown) => { filters.push(row => row[column] === value); return builder; },
            neq: (column: string, value: unknown) => { filters.push(row => row[column] !== value); return builder; },
            in: (column: string, values: unknown[]) => { filters.push(row => values.includes(row[column])); return builder; },
            gte: (column: string, value: unknown) => { filters.push(row => compare(row[column], value) >= 0); return builder; },
            lte: (column: string, value: unknown) => { filters.push(row => compare(row[column], value) <= 0); return builder; },
            gt: (column: string, value: unknown) => { filters.push(row => compare(row[column], value) > 0); return builder; },
            lt: (column: string, value: unknown) => { filters.push(row => compare(row[column], value) < 0); return builder; },
            ilike: (column: string, pattern: string) => {
                const needle = pattern.replace(/%/g, '').toLowerCase();
                filters.push(row => String(row[column] ?? '').toLowerCase().includes(needle));
                return builder;
            },
            order: (column: string, options?: { ascending?: boolean }) => { order ||= { column, ascending: options?.ascending !== false }; return builder; },
            limit: (value: number) => { limit = value; return builder; },
            range: (from: number, to: number) => { limit = to - from + 1; return builder; },
            maybeSingle: async () => {
                const result = run();
                const list = Array.isArray(result.data) ? result.data : [];
                return { data: list[0] ?? null, error: null };
            },
            single: async () => {
                const result = run();
                const list = Array.isArray(result.data) ? result.data : [];
                return list[0] ? { data: list[0], error: null } : { data: null, error: { message: 'not found' } };
            },
            then: (onOk: (value: unknown) => unknown, onErr?: (error: unknown) => unknown) => Promise.resolve(run()).then(onOk, onErr),
        };
        return builder;
    }

    return {
        from,
        rpc: async (name: string, args: Row) => {
            db.rpcCalls.push({ name, args });
            return db.rpc(name, args);
        },
    };
}
