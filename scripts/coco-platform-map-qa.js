#!/usr/bin/env node
/**
 * QA del mapa de la plataforma de CoCo (estático, sin red).
 *
 * Falla si:
 *   - aparece una page.tsx en src/app que no está en PLATFORM_SCREENS,
 *     ni en PLATFORM_ALIASES, ni en EXCLUDED (abajo, con su motivo);
 *   - el mapa, un alias o una exclusión apuntan a una página que ya no existe;
 *   - un alias apunta a una ruta que no está en el mapa;
 *   - una entrada se pasa de escueta (does > 160 caracteres o > 4 pasos) o no
 *     tiene roles ni palabras clave.
 *
 * Si agregas una pantalla: súmala a src/lib/coco/platformMap.ts (o, si CoCo
 * nunca debe llevar a ella, a EXCLUDED con el motivo).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const APP = path.join(ROOT, "src", "app");
const MAP_FILE = path.join(ROOT, "src", "lib", "coco", "platformMap.ts");

/** Páginas que CoCo no debe mapear, con el motivo. */
const EXCLUDED = {
  "/": "Landing pública comercial",
  "/developers": "Documentación pública de la API para integradores",
  "/recorrido": "Recorrido comercial público",
  "/onboarding": "Formulario comercial de preactivación (antes de tener cuenta)",
  "/terms": "Texto legal público",
  "/admin-onboarding": "Alta de un edificio nuevo (antes de tener cuenta)",
  "/fiscalizador/[token]": "Portal de solo lectura por enlace firmado; no navegable",
  "/showcase": "Lienzo de diseño interno, oculto del menú",
  "/marketing/reels": "Herramienta interna del creador de la plataforma",
  "/superadmin": "Consola SaaS interna",
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "api" && dir === APP) continue; // Route handlers, no pantallas.
      walk(full, out);
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function routeOf(file) {
  const rel = path.relative(APP, path.dirname(file)).split(path.sep).filter(Boolean);
  const segments = rel.filter(seg => !/^\(.*\)$/.test(seg) && !seg.startsWith("@"));
  return "/" + segments.join("/");
}

const source = fs.readFileSync(MAP_FILE, "utf8");
const SCREENS_DECL = "export const PLATFORM_SCREENS";
const ALIASES_DECL = "export const PLATFORM_ALIASES";
if (!source.includes(SCREENS_DECL) || !source.includes(ALIASES_DECL)) {
  console.error("✗ coco-platform-map: no encuentro PLATFORM_SCREENS / PLATFORM_ALIASES en platformMap.ts");
  process.exit(1);
}
const screensBlock = source.slice(source.indexOf(SCREENS_DECL), source.indexOf(ALIASES_DECL));
const aliasesStart = source.indexOf(ALIASES_DECL);
const aliasesBlock = source.slice(aliasesStart, source.indexOf("};", aliasesStart));

const entries = [...screensBlock.matchAll(/\{\s*route:\s*'([^']+)'([\s\S]*?)keywords:\s*\[([^\]]*)\]\s*\}/g)].map(m => {
  const body = m[2];
  const does = (body.match(/does:\s*'((?:[^'\\]|\\.)*)'/) || [])[1] || "";
  const stepsRaw = (body.match(/steps:\s*\[([\s\S]*?)\]/) || [])[1];
  const steps = stepsRaw ? [...stepsRaw.matchAll(/'((?:[^'\\]|\\.)*)'/g)].length : 0;
  const roles = (body.match(/roles:\s*\[([^\]]*)\]/) || [])[1] || "";
  return { route: m[1], does, steps, roles: roles.trim(), keywords: m[3].trim() };
});
const aliases = Object.fromEntries([...aliasesBlock.matchAll(/'([^']+)':\s*'([^']+)'/g)].map(m => [m[1], m[2]]));

const failures = [];
const pages = new Set(walk(APP).map(routeOf));
const mapped = new Map();
for (const entry of entries) {
  if (mapped.has(entry.route)) failures.push(`Ruta duplicada en el mapa: ${entry.route}`);
  mapped.set(entry.route, entry);
}

const declaredRoutes = (screensBlock.match(/route:\s*'/g) || []).length;
if (declaredRoutes !== entries.length) {
  failures.push(`El QA leyó ${entries.length} de ${declaredRoutes} entradas: revisa el formato (route … keywords: [...] }).`);
}

for (const page of [...pages].sort()) {
  if (!mapped.has(page) && !(page in aliases) && !(page in EXCLUDED)) {
    failures.push(`Pantalla sin cubrir en el mapa de CoCo: ${page} (agrégala a src/lib/coco/platformMap.ts o a EXCLUDED con motivo)`);
  }
}
for (const route of mapped.keys()) {
  if (!pages.has(route)) failures.push(`El mapa describe una pantalla que no existe: ${route}`);
}
for (const [from, to] of Object.entries(aliases)) {
  if (!pages.has(from)) failures.push(`Alias de una página que no existe: ${from}`);
  if (!mapped.has(to)) failures.push(`El alias ${from} apunta a ${to}, que no está en el mapa`);
  if (mapped.has(from)) failures.push(`${from} está como alias y como pantalla a la vez`);
}
for (const route of Object.keys(EXCLUDED)) {
  if (!pages.has(route)) failures.push(`Exclusión obsoleta (la página ya no existe): ${route}`);
  if (mapped.has(route)) failures.push(`${route} está excluida y mapeada a la vez`);
}
for (const entry of entries) {
  if (!entry.does) failures.push(`${entry.route}: falta "does"`);
  if (entry.does.length > 160) failures.push(`${entry.route}: "does" tiene ${entry.does.length} caracteres (máx. 160)`);
  if (entry.steps > 4) failures.push(`${entry.route}: ${entry.steps} pasos (máx. 4)`);
  if (!entry.roles) failures.push(`${entry.route}: sin roles`);
  if (!entry.keywords) failures.push(`${entry.route}: sin palabras clave`);
}

if (failures.length) {
  console.error(`✗ coco-platform-map: ${failures.length} problema(s)`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✓ coco-platform-map: ${pages.size} páginas · ${entries.length} en el mapa · ${Object.keys(aliases).length} alias · ${Object.keys(EXCLUDED).length} excluidas`);
