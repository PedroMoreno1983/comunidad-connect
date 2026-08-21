/**
 * Mueve un servicio de `src/lib/api.ts` a `src/lib/services/<dominio>.ts` y deja
 * un reexport en su lugar, para que los 39 archivos que importan desde
 * `@/lib/api` no tengan que cambiar.
 *
 * Herramienta de la etapa 2 de docs/deuda-arquitectonica.md. Es de un solo uso
 * por servicio: se ejecuta, se revisa el diff y se verifica con tsc y lint.
 *
 *   node scripts/extract-service.mjs <NombreService> <dominio> ["Titulo del modulo"]
 */

import fs from 'node:fs';
import path from 'node:path';

const [serviceName, domain, title] = process.argv.slice(2);
if (!serviceName || !domain) {
    console.error('Uso: node scripts/extract-service.mjs <NombreService> <dominio> ["Titulo"]');
    process.exit(1);
}

const root = process.cwd();
const apiPath = path.join(root, 'src', 'lib', 'api.ts');
const targetPath = path.join(root, 'src', 'lib', 'services', `${domain}.ts`);

const source = fs.readFileSync(apiPath, 'utf8');
const lines = source.split('\n');

// --- Localizar el bloque del servicio, con su banner de comentario ----------
// Los `export { X } from './services/…'` que va dejando esta misma herramienta
// también cierran un bloque: si no, la siguiente extracción se los lleva por
// delante al arrastrar todo hasta el próximo `export const`.
const starts = [];
lines.forEach((line, index) => {
    const declared = /^export const (\w+Service)\b/.exec(line);
    if (declared) {
        starts.push({ index, name: declared[1] });
        return;
    }
    if (/^export \{ \w+Service \} from '\.\/services\//.test(line)) {
        starts.push({ index, name: '__REEXPORT__' });
    }
});
starts.push({ index: lines.length, name: '__EOF__' });

const position = starts.findIndex(entry => entry.name === serviceName);
if (position === -1) {
    console.error(`No se encontro ${serviceName} en src/lib/api.ts.`);
    process.exit(1);
}

let from = starts[position].index;
// El bloque termina donde cierra el literal del servicio, no donde empieza el
// siguiente: entre uno y otro suelen vivir los helpers privados del siguiente,
// y arrastrarlos rompía a su dueño.
let to = starts[position].index + 1;
while (to < lines.length && lines[to] !== '};') to += 1;
to = Math.min(to + 1, starts[position + 1].index);
// Arrastrar el banner de comentario inmediatamente anterior.
while (from > 0) {
    const previous = lines[from - 1].trim();
    if (previous === '' || previous.startsWith('//') || previous.startsWith('*') || previous.startsWith('/*')) {
        from -= 1;
        continue;
    }
    break;
}

const block = lines.slice(from, to).join('\n').replace(/^\n+/, '').replace(/\n+$/, '');

// --- Qué tipos del import compartido necesita el bloque ---------------------
const typeImportMatch = /import \{([\s\S]*?)\} from '\.\/types';/.exec(source);
const availableTypes = typeImportMatch
    ? typeImportMatch[1].split(',').map(entry => entry.trim()).filter(Boolean)
    : [];
const neededTypes = availableTypes.filter(name => new RegExp(`\\b${name}\\b`).test(block));

const usesSupabase = /\bsupabase\b/.test(block);
const usesWhatsApp = /\bformatWhatsAppPhone\b/.test(block);

// Helpers privados de api.ts que el bloque necesita y que habrá que mover o
// compartir a mano. Avisar es mejor que dejar que falle tsc sin contexto.
const apiHelpers = [...source.matchAll(/^(?:async )?function (\w+)|^const ([A-Z_0-9]+) =/gm)]
    .map(match => match[1] || match[2])
    .filter(Boolean);
const pendingHelpers = [...new Set(apiHelpers.filter(name => new RegExp(`\\b${name}\\b`).test(block)))];

fs.mkdirSync(path.dirname(targetPath), { recursive: true });

if (fs.existsSync(targetPath)) {
    // Un dominio puede alojar varios servicios: se fusionan los imports en vez
    // de sobrescribir lo que ya hay.
    let existing = fs.readFileSync(targetPath, 'utf8');
    if (usesSupabase && !/import \{ supabase \}/.test(existing)) {
        existing = existing.replace(/(^\/\*\*[\s\S]*?\*\/\n)/, `$1\nimport { supabase } from '../supabase';`);
    }
    if (usesWhatsApp && !/formatWhatsAppPhone/.test(existing)) {
        existing = existing.replace(/(^\/\*\*[\s\S]*?\*\/\n)/, `$1\nimport { formatWhatsAppPhone } from '../whatsapp';`);
    }
    const typeBlock = /import type \{([^{}]*?)\} from '\.\.\/types';/.exec(existing);
    if (typeBlock) {
        const merged = [...new Set([
            ...typeBlock[1].split(',').map(entry => entry.trim()).filter(Boolean),
            ...neededTypes,
        ])].sort();
        existing = existing.replace(
            typeBlock[0],
            `import type {\n${merged.map(name => `    ${name},`).join('\n')}\n} from '../types';`,
        );
    } else if (neededTypes.length > 0) {
        existing = existing.replace(
            /(^\/\*\*[\s\S]*?\*\/\n)/,
            `$1\nimport type {\n${neededTypes.map(name => `    ${name},`).join('\n')}\n} from '../types';`,
        );
    }
    fs.writeFileSync(targetPath, `${existing.replace(/\n+$/, '')}\n\n${block}\n`, 'utf8');
} else {
    const header = [
        '/**',
        ` * ${title || `Acceso a datos del dominio ${domain}.`}`,
        ' *',
        " * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no",
        ' * romper a quienes los importan desde `@/lib/api`.',
        ' * Ver docs/deuda-arquitectonica.md.',
        ' */',
        '',
    ];
    if (usesSupabase) header.push("import { supabase } from '../supabase';");
    if (usesWhatsApp) header.push("import { formatWhatsAppPhone } from '../whatsapp';");
    if (neededTypes.length > 0) {
        header.push('import type {', ...neededTypes.map(name => `    ${name},`), "} from '../types';");
    }
    header.push('');
    fs.writeFileSync(targetPath, `${header.join('\n')}\n${block}\n`, 'utf8');
}

// --- Sustituir el bloque en api.ts por un reexport --------------------------
const reexport = `export { ${serviceName} } from './services/${domain}';`;
const remaining = [...lines.slice(0, from), reexport, '', ...lines.slice(to)];
fs.writeFileSync(apiPath, remaining.join('\n'), 'utf8');

console.log(`${serviceName} -> src/lib/services/${domain}.ts`);
console.log(`  ${block.split('\n').length} lineas movidas, ${neededTypes.length} tipos importados`);
if (pendingHelpers.length > 0) {
    console.log(`  Usa helpers que siguen en api.ts: ${pendingHelpers.join(', ')}`);
}
console.log('  Revisa el diff, y luego: npx tsc --noEmit && npm run lint');
