/**
 * Deja el barrel de `src/lib/api.ts` en su sitio y en orden.
 *
 * Al mover a mano los helpers privados que acompañan a un servicio es fácil
 * arrastrar de paso la línea `export { X } from './services/…'` que dejó la
 * extracción anterior, y acaba dentro del propio módulo de destino
 * (autorreferencia) en vez de en api.ts. Esto lo rescata y reagrupa todo.
 *
 *   node scripts/normalize-service-barrel.mjs
 */

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const apiPath = path.join(root, 'src', 'lib', 'api.ts');
const servicesDir = path.join(root, 'src', 'lib', 'services');
const reexport = /^export \{ (\w+Service) \} from '\.\/services\/([\w-]+)';$/;

const found = new Map();

// 1. Rescatar reexports que acabaron dentro de un módulo de servicios.
for (const file of fs.readdirSync(servicesDir)) {
    if (!file.endsWith('.ts')) continue;
    const filePath = path.join(servicesDir, file);
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const kept = [];
    let rescued = 0;
    for (const line of lines) {
        const match = reexport.exec(line);
        if (match) {
            found.set(match[1], match[2]);
            rescued += 1;
            continue;
        }
        kept.push(line);
    }
    if (rescued > 0) {
        fs.writeFileSync(filePath, kept.join('\n'), 'utf8');
        console.log(`  rescatados ${rescued} reexport(s) de services/${file}`);
    }
}

// 2. Recoger los que ya están en api.ts y reagruparlos tras la cabecera.
const lines = fs.readFileSync(apiPath, 'utf8').split('\n');
const body = [];
lines.forEach(line => {
    const match = reexport.exec(line);
    if (match) {
        found.set(match[1], match[2]);
        return;
    }
    body.push(line);
});

const marker = '// Servicios extraidos por dominio';
const bannerStart = body.findIndex(line => line.includes(marker));
if (bannerStart !== -1) {
    // Quitar el banner viejo (empieza una línea antes, en la barra de ====).
    let end = bannerStart;
    while (end < body.length && !body[end].startsWith('// ====')) end += 1;
    end += 1;
    body.splice(bannerStart - 1, end - (bannerStart - 1));
}

const banner = [
    '',
    '// ==========================================',
    '// Servicios extraidos por dominio',
    '//',
    '// api.ts se reparte en src/lib/services/* (ver docs/deuda-arquitectonica.md).',
    '// Estos reexports mantienen `import { X } from "@/lib/api"` funcionando en',
    '// los archivos que ya lo usan, para que el reparto se pueda hacer servicio a',
    '// servicio sin tocarlos.',
    '// ==========================================',
    ...[...found.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, domain]) => `export { ${name} } from './services/${domain}';`),
    '',
];

const anchor = body.reduce((last, line, index) => (index < 120 && line.startsWith('import ') ? index : last), 0);
const out = [...body.slice(0, anchor + 1), ...banner, ...body.slice(anchor + 1)];
fs.writeFileSync(apiPath, out.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');

console.log(`Barrel normalizado: ${found.size} servicios reexportados desde api.ts.`);
