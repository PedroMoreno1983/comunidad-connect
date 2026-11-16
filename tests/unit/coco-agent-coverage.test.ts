/**
 * Guard de cobertura agéntica. La meta es que lo que una persona puede hacer en
 * la interfaz lo pueda pedir también conversando con CoCo. Eso solo se puede
 * sostener si cada acción nueva de la interfaz obliga a decidir, por escrito,
 * si CoCo la hace, si le falta, o por qué se queda en pantalla.
 *
 * Falla cuando:
 *   - aparece un método de Service o una ruta que modifica datos y no figura en
 *     AGENT_COVERAGE (src/lib/coco/agentCoverage.ts);
 *   - queda una entrada de algo que ya no existe;
 *   - una entrada `tool` nombra una herramienta que CoCo no tiene;
 *   - una brecha o una exclusión no explica su razón.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_COVERAGE, coverageSummary } from '@/lib/coco/agentCoverage';
import { TOOL_DEFINITIONS } from '@/lib/coco/tools';

const root = path.resolve(__dirname, '../..');

// Un método de Service "escribe" si su nombre empieza con uno de estos verbos.
const MUTATING_VERB = /^(create|update|delete|cancel|add|remove|book|reserve|send|submit|approve|reject|mark|set|pay|register|publish|vote|join|leave|rent|request|close|assign|confirm|toggle|upload|accept|decline|invite|issue|record|resolve|report|save|rate|end|start|archive|block|unblock|respond|reply|claim|release|return|move|schedule|edit|post|like|comment|follow|share|flag|settle)/;
// Rutas que no responden a una persona en la interfaz: CoCo mismo, webhooks,
// tareas programadas, autenticación y notificaciones push.
const SYSTEM_ROUTE = /^(coco|agent-center|webhooks|cron|internal|auth|push|whatsapp|qa|health)(\/|$)/;

function serviceActions(dir: string) {
    const out: string[] = [];
    for (const file of fs.readdirSync(dir)) {
        if (!file.endsWith('.ts') || file.startsWith('_')) continue;
        let service: string | null = null;
        for (const line of fs.readFileSync(path.join(dir, file), 'utf8').split(/\r?\n/)) {
            const declared = line.match(/^export const ([A-Za-z]+Service)\s*=/);
            if (declared) service = declared[1];
            const method = line.match(/^ {4}async ([a-zA-Z]+)\s*[(<]/);
            if (method && service && MUTATING_VERB.test(method[1])) out.push(`${service}.${method[1]}`);
        }
    }
    return out;
}

function routeActions(dir: string, rel = ''): string[] {
    return fs.readdirSync(path.join(dir, rel), { withFileTypes: true }).flatMap(entry => {
        const child = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) return routeActions(dir, child);
        if (entry.name !== 'route.ts' || SYSTEM_ROUTE.test(rel)) return [];
        const source = fs.readFileSync(path.join(dir, child), 'utf8');
        // Un verbo por entrada: si la ruta exporta PUT y DELETE, son dos
        // acciones y cada una necesita su propia clasificación.
        const verbs = new Set([...source.matchAll(/export (?:async function|const) (POST|PATCH|PUT|DELETE)\b/g)].map(match => match[1]));
        return [...verbs].map(verb => `${verb} /api/${rel}`);
    });
}

const actions = [
    ...serviceActions(path.join(root, 'src/lib/api')),
    ...routeActions(path.join(root, 'src/app/api')),
].sort();

describe('cobertura agéntica de CoCo', () => {
    it('el inventario encuentra acciones (si no, el guard no protege nada)', () => {
        expect(actions.length).toBeGreaterThan(100);
    });

    it('toda acción de la interfaz que modifica datos está clasificada', () => {
        const missing = actions.filter(action => !(action in AGENT_COVERAGE));
        // Una acción nueva: decide en agentCoverage.ts si CoCo la hace (tool),
        // si le falta (gap) o por qué se queda en la interfaz (ui/read/system).
        expect(missing).toEqual([]);
    });

    it('no quedan entradas de acciones que ya no existen', () => {
        const stale = Object.keys(AGENT_COVERAGE).filter(key => !actions.includes(key));
        expect(stale).toEqual([]);
    });

    it('las herramientas citadas existen en CoCo', () => {
        const tools = new Set((TOOL_DEFINITIONS as ReadonlyArray<{ name: string }>).map(tool => tool.name));
        const ghosts = Object.entries(AGENT_COVERAGE).flatMap(([action, entry]) =>
            'tool' in entry ? [entry.tool].flat().filter(tool => !tools.has(tool)).map(tool => `${action} → ${tool}`) : []);
        expect(ghosts).toEqual([]);
    });

    it('cada brecha y cada exclusión explica su razón', () => {
        const unexplained = Object.entries(AGENT_COVERAGE)
            .filter(([, entry]) => !('tool' in entry))
            .filter(([, entry]) => String(Object.values(entry)[0] ?? '').trim().length < 10)
            .map(([action]) => action);
        expect(unexplained).toEqual([]);
    });

    it('informa la cobertura actual', () => {
        const summary = coverageSummary();
        console.info(`Cobertura agéntica de CoCo: ${summary.tool} de ${summary.askable} acciones pedibles (${summary.percent}%). Brechas: ${summary.gap}. Solo interfaz: ${summary.ui}.`);
        expect(summary.askable).toBe(summary.tool + summary.gap);
    });
});
