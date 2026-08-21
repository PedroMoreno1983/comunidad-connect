/**
 * Quita del import de `./types` los nombres que el archivo ya no usa.
 *
 * Complementa a extract-service.mjs: al mover un servicio fuera de
 * `src/lib/api.ts` sus tipos quedan importados sin consumidor.
 *
 *   node scripts/prune-type-imports.mjs src/lib/api.ts
 */

import fs from 'node:fs';

const target = process.argv[2];
if (!target) {
    console.error('Uso: node scripts/prune-type-imports.mjs <archivo>');
    process.exit(1);
}

const source = fs.readFileSync(target, 'utf8');
// `[^{}]` evita que la coincidencia cruce otros imports por delante: con
// `[\s\S]*?` el patrón arrancaba en el primer `import {` del archivo y se
// llevaba por delante los imports de supabase y whatsapp.
const pattern = /import (?:type )?\{([^{}]*?)\} from '(\.{1,2}\/types)';/;
const match = pattern.exec(source);
if (!match) {
    console.error(`${target} no importa tipos desde ./types ni ../types.`);
    process.exit(1);
}
const typesPath = match[2];
const isTypeOnly = match[0].startsWith('import type');

const body = source.replace(match[0], '');
const names = match[1].split(',').map(entry => entry.trim()).filter(Boolean);
const kept = names.filter(name => new RegExp(`\\b${name.replace(/\s+as\s+.*/, '')}\\b`).test(body));
const removed = names.filter(name => !kept.includes(name));

if (removed.length === 0) {
    console.log('Sin tipos huerfanos.');
    process.exit(0);
}

const keyword = isTypeOnly ? 'import type' : 'import';
const replacement = kept.length > 0
    ? `${keyword} {\n${kept.map(name => `    ${name},`).join('\n')}\n} from '${typesPath}';`
    : '';
fs.writeFileSync(target, source.replace(match[0], replacement), 'utf8');

console.log(`${removed.length} tipos huerfanos retirados de ${target}:`);
console.log(`  ${removed.join(', ')}`);
