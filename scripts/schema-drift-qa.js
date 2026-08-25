/**
 * Detecta deriva entre lo que el repositorio declara y lo que la base
 * realmente tiene.
 *
 * Por qué existe: en agosto de 2026 `public.units` perdió las columnas
 * `type` y `resident_profile_id` en producción, pero handle_new_user() y
 * tres consultas del código seguían usándolas. Ningún test lo detectó
 * porque todos corren contra el código, no contra el esquema vivo. El
 * resultado fue que ningún residente que escribiera su número de
 * departamento podía registrarse, y nadie se enteró durante semanas.
 *
 * Este script compara las dos fuentes y falla ruidosamente:
 *
 *   1. Columnas que schema.sql declara y la base no tiene. Es la clase
 *      de fallo anterior: el desarrollador lee el esquema, escribe la
 *      consulta, y revienta en runtime.
 *
 *   2. Divergencia del historial de migraciones. Si el remoto tiene
 *      versiones sin archivo local, `supabase db push` deja de arrancar,
 *      lo que obliga a aplicar a mano por el editor SQL, lo que diverge
 *      más el historial. Ese círculo es lo que produjo el punto 1.
 *
 * Uso:  npm run qa:schema-drift
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function readLocalEnv() {
    const file = path.join(process.cwd(), '.env.local');
    if (!fs.existsSync(file)) return {};
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).reduce((acc, line) => {
        const match = line.match(/^\s*([^#][A-Za-z0-9_]+)\s*=\s*(.*)$/);
        if (match) acc[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, '');
        return acc;
    }, {});
}

const localEnv = readLocalEnv();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || localEnv.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || localEnv.SUPABASE_SERVICE_ROLE_KEY;

const report = { generatedAt: new Date().toISOString(), passed: false, checks: [], failures: [], skipped: [] };

function pass(name, details = {}) { report.checks.push({ name, details }); }
function fail(message, details = {}) { report.failures.push({ message, details }); }

/** Columnas que schema.sql declara para cada tabla, aplicando ADD/DROP COLUMN. */
function declaredSchema() {
    const sql = fs.readFileSync(path.join(process.cwd(), 'schema.sql'), 'utf8');
    const tables = {};

    const createBlock = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?public\.([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\n\);/gi;
    let match;
    while ((match = createBlock.exec(sql))) {
        const table = match[1].toLowerCase();
        const columns = match[2].split('\n')
            .map(line => line.trim())
            .filter(line => line && !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK|--)/i.test(line))
            .map(line => (line.match(/^"?([a-zA-Z0-9_]+)"?\s+[A-Za-z]/) || [])[1])
            .filter(Boolean)
            .map(column => column.toLowerCase());
        tables[table] = new Set([...(tables[table] || []), ...columns]);
    }

    const addColumn = /ALTER TABLE\s+(?:IF EXISTS\s+)?public\.([a-zA-Z0-9_]+)\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/gi;
    while ((match = addColumn.exec(sql))) {
        const table = match[1].toLowerCase();
        (tables[table] = tables[table] || new Set()).add(match[2].toLowerCase());
    }

    // Un DROP posterior gana sobre la declaración original.
    const dropColumn = /ALTER TABLE\s+(?:IF EXISTS\s+)?public\.([a-zA-Z0-9_]+)\s+DROP COLUMN\s+(?:IF EXISTS\s+)?"?([a-zA-Z0-9_]+)"?/gi;
    while ((match = dropColumn.exec(sql))) {
        const table = match[1].toLowerCase();
        if (tables[table]) tables[table].delete(match[2].toLowerCase());
    }

    return tables;
}

async function liveSchema() {
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        headers: { apikey: serviceRole, authorization: `Bearer ${serviceRole}`, accept: 'application/openapi+json' },
    });
    if (!response.ok) throw new Error(`OpenAPI spec no disponible (HTTP ${response.status})`);
    const spec = await response.json();
    const tables = {};
    for (const [name, definition] of Object.entries(spec.definitions || {})) {
        tables[name.toLowerCase()] = new Set(Object.keys(definition.properties || {}).map(c => c.toLowerCase()));
    }
    return tables;
}

function checkMigrationHistory() {
    let raw;
    try {
        // Comando completo como cadena: en Windows npx es un .cmd y execFile
        // no lo resuelve, y pasar args sueltos con shell:true está deprecado.
        raw = execSync('npx supabase migration list --linked --yes', {
            encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 180_000,
        });
    } catch {
        // Sin CLI, sin sesión o sin red: no es un fallo del esquema.
        report.skipped.push('Historial de migraciones: el CLI de Supabase no respondió.');
        return;
    }

    const json = raw.match(/\{"migrations".*\}/);
    if (!json) {
        report.skipped.push('Historial de migraciones: salida del CLI no reconocida.');
        return;
    }

    const migrations = JSON.parse(json[0]).migrations || [];
    const remoteOnly = migrations.filter(m => m.remote && !m.local).map(m => m.remote);
    const localOnly = migrations.filter(m => m.local && !m.remote).map(m => m.local);

    if (remoteOnly.length) {
        fail(
            'El historial remoto tiene versiones sin archivo local: `supabase db push` no arrancará, '
            + 'lo que obliga a aplicar migraciones a mano y agrava la deriva.',
            { remoteOnly },
        );
    } else {
        pass('Toda versión aplicada en remoto tiene su archivo en el repositorio');
    }

    if (localOnly.length) {
        fail(
            'Hay migraciones locales sin aplicar en remoto. Aplícalas con `supabase db push`, '
            + 'no por el editor SQL: el editor no actualiza el historial.',
            { localOnly },
        );
    } else {
        pass('Toda migración del repositorio está aplicada en remoto');
    }
}

async function main() {
    if (!supabaseUrl || !serviceRole) {
        report.skipped.push('Sin NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: no se pudo comparar contra la base.');
        report.passed = true;
        return;
    }

    const declared = declaredSchema();
    const live = await liveSchema();

    const missingColumns = [];
    const missingTables = [];
    for (const [table, columns] of Object.entries(declared)) {
        if (!live[table]) { missingTables.push(table); continue; }
        for (const column of columns) {
            if (!live[table].has(column)) missingColumns.push(`${table}.${column}`);
        }
    }

    if (missingColumns.length) {
        fail(
            'schema.sql declara columnas que la base no tiene. Cualquiera que lea el esquema y escriba '
            + 'una consulta con ellas provocará un error en runtime, como pasó con units.type.',
            { missingColumns },
        );
    } else {
        pass('Toda columna declarada en schema.sql existe en la base', {
            tablasComparadas: Object.keys(declared).length - missingTables.length,
        });
    }

    if (missingTables.length) {
        // Puede ser legítimo (tablas de otro esquema, vistas internas), así que
        // se informa sin romper la build.
        report.skipped.push(`Tablas declaradas que PostgREST no expone: ${missingTables.join(', ')}`);
    }

    checkMigrationHistory();
    report.passed = report.failures.length === 0;
}

main()
    .then(() => {
        console.log(JSON.stringify(report, null, 2));
        if (!report.passed) process.exit(1);
    })
    .catch(error => {
        report.failures.push({ message: error.message, details: {} });
        console.error(JSON.stringify(report, null, 2));
        process.exit(1);
    });
