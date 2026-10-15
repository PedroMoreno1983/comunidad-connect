import {
    normalizeUnitLabel,
    parsePermilleText,
    RIGHTS_TOLERANCE_PERMILLE,
    RIGHTS_TOTAL_PERMILLE,
    roundPermille,
    sourceNoteOf,
    validateUnitRights,
} from '@/lib/assemblies/unitRights';
import type { UnitRightsUnit } from '@/lib/assemblies/types';
import type {
    OnboardingPendingTask,
    OnboardingRightsMeta,
    OnboardingRightsOutcome,
    OnboardingRightsPreview,
    RightsScale,
} from './types';

/**
 * Derechos de cada unidad (‰) en el onboarding de comunidades. Módulo **puro**.
 *
 * La nómina de unidades puede traer una columna opcional `derechos_permil`
 * (también "prorrateo", "alícuota", "‰" o "%"). Si viene en %, se multiplica
 * por 10. La validación (todas las unidades, cada una > 0 y ≤ 1000, suma en
 * 1000‰ ± 0,5) es la de `validateUnitRights` de `assemblies/unitRights.ts`: no
 * se duplica aquí. Nada de esto bloquea el resto del onboarding.
 */

export const RIGHTS_COLUMN = 'derechos_permil';

export const RIGHTS_WHY = 'Con esto las votaciones de asamblea y el prorrateo de gastos comunes quedan según el reglamento.';

export const RIGHTS_SOURCE_PLACEHOLDER = 'Reglamento de copropiedad, art. X';

export const RIGHTS_TASK_HREF = '/admin/asambleas#derechos';

/** Tarea pendiente cuando los derechos no quedan cargados desde el onboarding. */
export function rightsPendingTask(reason: 'missing' | 'partial'): OnboardingPendingTask {
    return {
        id: 'unit_rights',
        title: 'Cargar derechos de cada unidad',
        detail: reason === 'partial'
            ? 'Los derechos del archivo no estaban completos o no sumaban 1000‰, así que las unidades se crearon sin ellos. Cárgalos según el reglamento de copropiedad.'
            : 'Mientras falten, las asambleas cuentan 1 unidad = 1 voto. Cárgalos según el reglamento de copropiedad.',
        href: RIGHTS_TASK_HREF,
    };
}

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizeHeader = (header: string) => stripAccents(header.toLowerCase()).replace(/[\s_\-().:/]+/g, '');

/**
 * ¿Es este encabezado la columna de derechos? Devuelve la escala que indica,
 * 'auto' si no la indica ("prorrateo", "alícuota", "derechos") o null si no es.
 */
export function rightsHeaderScale(header: string): RightsScale | 'auto' | null {
    const h = normalizeHeader(header);
    if (!h) return null;
    if (h.includes('‰') || h.includes('permil') || h.includes('pormil')) return 'permille';
    if (h.includes('%') || h.includes('porcentaje') || h.includes('porciento')) return 'percent';
    if (/prorrateo|alicuota|derecho/.test(h)) return 'auto';
    return null;
}

const UNIT_HEADER = /^(unidad|unidades|depto|departamento|dpto|numero|nro|n°|nº|casa|oficina|unit|unitid|unitnumber)/;

/** Celda → número y el símbolo que traía (si lo traía). */
export function parseRightsCell(raw: string): { value: number | null | undefined; symbol: RightsScale | null } {
    const text = raw.trim();
    const symbol: RightsScale | null = text.includes('%') ? 'percent' : text.includes('‰') ? 'permille' : null;
    return { value: parsePermilleText(text), symbol };
}

/** % → ‰ (×10). */
export function percentToPermille(value: number): number {
    return roundPermille(value * 10);
}

/** ‰ como texto editable, sin separador de miles: 12.5 → "12,5"; 1000 → "1000". */
export function permilleToText(value: number | null): string {
    return value === null ? '' : String(roundPermille(value)).replace('.', ',');
}

export interface ConvertedRightsColumn {
    /** Por celda: ‰ convertido, null si venía vacía, undefined si no se pudo leer. */
    values: (number | null | undefined)[];
    scale: RightsScale;
    scaleInferred: boolean;
}

/**
 * Convierte una columna de derechos a ‰. Escala: la del encabezado; si es
 * ambiguo, el símbolo de las celdas; si no hay símbolo, la suma (≈100 → %,
 * si no ‰). Una celda con su propio símbolo (% o ‰) manda sobre la columna.
 */
export function convertRightsColumn(raws: string[], headerScale: RightsScale | 'auto'): ConvertedRightsColumn {
    const cells = raws.map(parseRightsCell);
    let scale: RightsScale;
    let scaleInferred = false;
    if (headerScale !== 'auto') scale = headerScale;
    else {
        scaleInferred = true;
        const symbol = cells.find(cell => cell.symbol)?.symbol;
        if (symbol) scale = symbol;
        else {
            const sum = cells.reduce((acc, cell) => acc + (typeof cell.value === 'number' ? cell.value : 0), 0);
            const percentTolerance = RIGHTS_TOLERANCE_PERMILLE / 10;
            scale = sum > 0 && Math.abs(sum - RIGHTS_TOTAL_PERMILLE / 10) <= percentTolerance ? 'percent' : 'permille';
        }
    }
    const values = cells.map(cell => {
        if (cell.value === null || cell.value === undefined) return cell.value;
        return (cell.symbol ?? scale) === 'percent' ? percentToPermille(cell.value) : cell.value;
    });
    return { values, scale, scaleInferred };
}

/** Divide una línea CSV respetando comillas. */
function splitDelimited(line: string, separator: string): string[] {
    const out: string[] = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            if (quoted && line[i + 1] === '"') { current += '"'; i++; } else quoted = !quoted;
        } else if (char === separator && !quoted) { out.push(current.trim()); current = ''; } else current += char;
    }
    out.push(current.trim());
    return out;
}

/** CSV/TXT → filas. Separador: punto y coma, tabulador o coma (el que tenga el encabezado). */
export function parseDelimitedTable(text: string): string[][] {
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim());
    if (!lines.length) return [];
    const header = lines[0];
    const separator = header.includes(';') ? ';' : header.includes('\t') ? '\t' : ',';
    return lines.map(line => splitDelimited(line, separator));
}

export interface TableRights {
    meta: OnboardingRightsMeta;
    /** Rótulo normalizado de la unidad → ‰ en texto ("" si no se pudo leer: queda el texto original). */
    byUnit: Map<string, string>;
}

/**
 * Lee la columna de derechos de una tabla (primera fila = encabezados). Null si
 * no hay columna de derechos. Las filas sin unidad se ignoran.
 */
export function extractRightsFromTable(rows: string[][]): TableRights | null {
    if (rows.length < 2) return null;
    const header = rows[0];
    const rightsIndex = header.findIndex(cell => rightsHeaderScale(cell) !== null);
    if (rightsIndex < 0) return null;
    const headerScale = rightsHeaderScale(header[rightsIndex]) as RightsScale | 'auto';
    const unitHeaderIndex = header.findIndex((cell, index) => index !== rightsIndex && UNIT_HEADER.test(normalizeHeader(cell)));
    const unitIndex = unitHeaderIndex >= 0 ? unitHeaderIndex : rightsIndex === 0 ? 1 : 0;
    const body = rows.slice(1).filter(row => (row[unitIndex] || '').trim());
    const raws = body.map(row => (row[rightsIndex] || '').trim());
    const converted = convertRightsColumn(raws, headerScale);
    const byUnit = new Map<string, string>();
    body.forEach((row, index) => {
        const key = normalizeUnitLabel(row[unitIndex] || '');
        const value = converted.values[index];
        const text = value === undefined ? raws[index] : permilleToText(value);
        if (key && (text || !byUnit.has(key))) byUnit.set(key, text);
    });
    return {
        meta: {
            header: header[rightsIndex].trim(), scale: converted.scale, scaleInferred: converted.scaleInferred,
            unitsWithValue: [...byUnit.values()].filter(Boolean).length,
        },
        byUnit,
    };
}

/** Rótulo normalizado de la unidad de una fila (para agrupar residentes por unidad). */
export const rightsUnitKey = (label: string) => normalizeUnitLabel(label);

interface RightsInputRow { unit_id: string; derechos_permil?: string }

interface GroupedRights {
    units: { id: string; label: string }[];
    values: Record<string, number | null | undefined>;
    conflicts: string[];
    unitsWithValue: number;
}

/** Texto de una celda → ‰; ilegible → NaN (validateUnitRights lo informa como no válido). */
function cellValue(text: string): number | null {
    const value = parsePermilleText(text);
    return value === undefined ? Number.NaN : value;
}

/** Agrupa por unidad: varios residentes de una misma unidad comparten sus derechos. */
function groupByUnit(rows: RightsInputRow[]): GroupedRights {
    const units: { id: string; label: string }[] = [];
    const values: Record<string, number | null | undefined> = {};
    const conflicts: string[] = [];
    const texts = new Map<string, string>();
    for (const row of rows) {
        const key = rightsUnitKey(row.unit_id || '');
        if (!key) continue;
        if (!(key in values)) { units.push({ id: key, label: row.unit_id.trim() }); values[key] = null; }
        const text = (row.derechos_permil || '').trim();
        if (!text) continue;
        const value = cellValue(text);
        if (texts.has(key)) {
            if (!Object.is(values[key], value) && !conflicts.includes(row.unit_id.trim())) conflicts.push(row.unit_id.trim());
            continue;
        }
        texts.set(key, text);
        values[key] = value;
    }
    return { units, values, conflicts, unitsWithValue: texts.size };
}

const conflictMessage = (conflicts: string[]) =>
    `${conflicts.length === 1 ? 'La unidad' : 'Las unidades'} ${conflicts.join(', ')} ${conflicts.length === 1 ? 'tiene' : 'tienen'} derechos distintos en filas distintas.`;

/**
 * Vista previa con lo que trae el lote. Completa = todas las unidades del lote
 * con derechos y suma en 1000‰ ± 0,5 (`validateUnitRights`). Al sincronizar se
 * vuelve a validar contra todas las unidades de la comunidad.
 */
export function previewOnboardingRights(rows: RightsInputRow[], sourceNote: string): OnboardingRightsPreview {
    const grouped = groupByUnit(rows);
    if (grouped.unitsWithValue === 0) {
        return {
            status: 'none', units: grouped.units.length, unitsWithValue: 0, total: 0, difference: -RIGHTS_TOTAL_PERMILLE,
            errors: [], conflicts: [], willBeVerified: false, task: rightsPendingTask('missing'),
        };
    }
    const validation = validateUnitRights(grouped.units, grouped.values);
    const errors = [...validation.errors];
    if (grouped.conflicts.length) errors.push(conflictMessage(grouped.conflicts));
    const complete = errors.length === 0;
    return {
        status: complete ? 'complete' : 'partial',
        units: grouped.units.length,
        unitsWithValue: grouped.unitsWithValue,
        total: validation.total,
        difference: validation.difference,
        errors,
        conflicts: grouped.conflicts,
        willBeVerified: complete && sourceNoteOf(sourceNote).length > 0,
        task: complete ? null : rightsPendingTask('partial'),
    };
}

export interface ProvidedRight { unitId: string; label: string; raw: string }

export type OnboardingRightsPlan =
    | { action: 'save'; values: Record<string, number>; sourceNote: string; verified: boolean }
    | { action: 'skip'; outcome: OnboardingRightsOutcome };

/**
 * Qué hacer al sincronizar, contra **todas** las unidades de la comunidad (las
 * que ya existían también cuentan). Solo se guarda si la carga queda completa.
 */
export function planOnboardingRights(
    units: Pick<UnitRightsUnit, 'id' | 'label' | 'sharePermille'>[],
    provided: ProvidedRight[],
    rawSourceNote: string,
): OnboardingRightsPlan {
    const alreadyLoaded = units.length > 0 && units.every(unit => unit.sharePermille !== null && unit.sharePermille > 0);
    const given = provided.filter(item => item.raw.trim());
    if (!given.length) {
        return alreadyLoaded
            ? { action: 'skip', outcome: { status: 'already_loaded', verified: false, errors: [], task: null } }
            : { action: 'skip', outcome: { status: 'none', verified: false, errors: [], task: rightsPendingTask('missing') } };
    }
    const values: Record<string, number | null | undefined> = Object.fromEntries(units.map(unit => [unit.id, null]));
    const seen = new Map<string, number | null>();
    const conflicts: string[] = [];
    for (const item of given) {
        const value = cellValue(item.raw);
        if (seen.has(item.unitId)) {
            if (!Object.is(seen.get(item.unitId), value) && !conflicts.includes(item.label)) conflicts.push(item.label);
            continue;
        }
        seen.set(item.unitId, value);
        if (item.unitId in values) values[item.unitId] = value;
    }
    const validation = validateUnitRights(units, values);
    const errors = [...validation.errors];
    if (conflicts.length) errors.push(conflictMessage(conflicts));
    if (errors.length) {
        return {
            action: 'skip',
            outcome: { status: 'skipped', verified: false, errors, task: alreadyLoaded ? null : rightsPendingTask('partial') },
        };
    }
    const sourceNote = sourceNoteOf(rawSourceNote);
    return {
        action: 'save',
        values: Object.fromEntries(units.map(unit => [unit.id, Number(values[unit.id])])),
        sourceNote,
        verified: sourceNote.length > 0,
    };
}

/** `derechos_permil` guardado en `onboarding_import_rows.raw_data` (texto en ‰; "" si no hay). */
export function rightsFromRawData(raw: unknown): string {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '';
    const value = (raw as Record<string, unknown>)[RIGHTS_COLUMN];
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim().slice(0, 40) : '';
}

/** Plantilla descargable de la nómina (CSV con punto y coma, como lo abre Excel en Chile). */
export const RIGHTS_TEMPLATE_HREF = '/plantillas/nomina-unidades.csv';
