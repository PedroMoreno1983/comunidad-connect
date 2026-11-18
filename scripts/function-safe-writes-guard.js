#!/usr/bin/env node
/**
 * Guard: ninguna función de la base hace DELETE o UPDATE sin WHERE.
 *
 * Supabase rechaza esas sentencias ("DELETE requires a WHERE clause"), pero
 * solo al ejecutarlas, no al crear la función. Dos veces llegó a producción una
 * función que nunca podía funcionar:
 *   - refresh_supermarket_search_terms (corregida en 20260908180000).
 *   - save_unit_rights (corregida en 20261118160000): durante semanas nadie pudo
 *     guardar los derechos de las unidades, ni desde la pantalla ni desde CoCo.
 *
 * Mira la versión vigente de cada función (la última migración que la define).
 * Si el borrado o la actualización total es la intención, se declara con
 * WHERE true.
 */
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'supabase', 'migrations');

/** Última definición de cada función, en el orden en que se aplican las migraciones. */
function latestFunctions(files) {
    const latest = new Map();
    for (const file of files) {
        const sql = fs.readFileSync(path.join(DIR, file), 'utf8');
        const definition = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w."]+)\s*\([\s\S]*?\)[\s\S]*?AS\s+(\$\w*\$)([\s\S]*?)\2/gi;
        let match;
        while ((match = definition.exec(sql))) {
            latest.set(match[1].replace(/"/g, '').toLowerCase(), { file, body: match[3] });
        }
        const drop = /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?([\w."]+)/gi;
        while ((match = drop.exec(sql))) {
            const name = match[1].replace(/"/g, '').toLowerCase();
            if (latest.get(name)?.file !== file) latest.delete(name);
        }
    }
    return latest;
}

/** Sentencias DELETE/UPDATE sin WHERE dentro del cuerpo de una función. */
function unsafeWrites(body) {
    return body
        .replace(/--[^\n]*/g, '')
        .split(';')
        .map(statement => statement.trim().replace(/\s+/g, ' '))
        .filter(statement => /\b(DELETE\s+FROM|UPDATE)\s+[\w."]+/i.test(statement))
        .filter(statement => !/\bWHERE\b/i.test(statement) && !/\bON\s+CONFLICT\b/i.test(statement));
}

function main() {
    const files = fs.readdirSync(DIR).filter(file => /^\d.*\.sql$/.test(file)).sort();
    const latest = latestFunctions(files);
    const report = { passed: true, checks: [], failures: [] };
    for (const [name, { file, body }] of latest) {
        for (const statement of unsafeWrites(body)) {
            report.failures.push({
                message: `${name} (${file}) tiene una sentencia sin WHERE: Supabase la rechaza al ejecutarla. Si el borrado total es la intención, agrega WHERE true.`,
                details: { statement: statement.slice(0, 200) },
            });
        }
    }
    report.checks.push({ name: 'Funciones vigentes sin DELETE/UPDATE sin WHERE', details: { functions: latest.size } });
    report.passed = report.failures.length === 0;
    return report;
}

if (require.main === module) {
    const report = main();
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exit(1);
}

module.exports = { latestFunctions, unsafeWrites };
