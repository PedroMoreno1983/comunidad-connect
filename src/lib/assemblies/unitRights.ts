import type { RightsCsvResult, RightsSnapshot, UnitRightsRevision, UnitRightsStatus, UnitRightsUnit, UnitRightsValidation } from './types';

/**
 * Derechos de cada unidad (‰) para votar en asambleas. Módulo **puro**.
 *
 * Ley 21.442, art. 3: los derechos de cada copropietario en los bienes comunes
 * son la proporción que fija el reglamento de copropiedad (a falta de ella, el
 * avalúo fiscal). Art. 15: en las asambleas se vota según esos derechos.
 * Suele coincidir con el prorrateo de gastos comunes, pero no es lo mismo: lo
 * que no tenga fuente del reglamento o la escritura queda **provisorio**.
 */

export const RIGHTS_TOTAL_PERMILLE = 1000;
/** Tolerancia de redondeo: la suma debe quedar en 1000‰ ± 0,5. */
export const RIGHTS_TOLERANCE_PERMILLE = 0.5;
export const RIGHTS_SOURCE_MAX = 500;

const SCALE = 10_000;
export const roundPermille = (value: number) => Math.round(value * SCALE) / SCALE;
const toUnits = (value: number) => Math.round(value * SCALE);

/** "12,5" / "12.5" / "1.234,5" → número. Vacío → null. Inválido o negativo → undefined. */
export function parsePermilleText(raw: string): number | null | undefined {
    let text = raw.trim().replace(/‰|%|\s/g, '');
    if (text === '') return null;
    if (text.includes(',') && text.includes('.')) text = text.replace(/\./g, '').replace(',', '.');
    else text = text.replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(text)) return undefined;
    const value = Number(text);
    return Number.isFinite(value) ? roundPermille(value) : undefined;
}

export function formatPermille(value: number | null): string {
    if (value === null) return '';
    return roundPermille(value).toLocaleString('es-CL', { maximumFractionDigits: 4 });
}

/**
 * Valida una carga completa: todas las unidades con un valor > 0 y ≤ 1000, y la
 * suma en 1000‰ ± 0,5. Si no cuadra no se guarda y se informa la diferencia.
 */
export function validateUnitRights(units: Pick<UnitRightsUnit, 'id' | 'label'>[], values: Record<string, number | null | undefined>): UnitRightsValidation {
    const missing: string[] = [];
    const invalid: string[] = [];
    let totalUnits = 0;
    for (const unit of units) {
        const value = values[unit.id];
        if (value === null || value === undefined) { missing.push(unit.label); continue; }
        if (!Number.isFinite(value) || value <= 0 || value > RIGHTS_TOTAL_PERMILLE) { invalid.push(unit.label); continue; }
        totalUnits += toUnits(value);
    }
    const total = totalUnits / SCALE;
    const difference = roundPermille(total - RIGHTS_TOTAL_PERMILLE);
    const errors: string[] = [];
    if (units.length === 0) errors.push('La comunidad no tiene unidades.');
    if (missing.length) errors.push(`Faltan los derechos de ${missing.length === 1 ? 'la unidad' : 'las unidades'} ${missing.join(', ')}.`);
    if (invalid.length) errors.push(`Valores no válidos en ${invalid.join(', ')}: deben ser mayores que 0 y no superar 1000‰.`);
    if (!missing.length && !invalid.length && units.length > 0 && Math.abs(difference) > RIGHTS_TOLERANCE_PERMILLE) {
        errors.push(`La suma es ${formatPermille(total)}‰: ${difference > 0 ? 'sobran' : 'faltan'} ${formatPermille(Math.abs(difference))}‰ para llegar a 1000‰ (tolerancia ± 0,5‰).`);
    }
    return { ok: errors.length === 0, total, difference, missing, invalid, errors };
}

/** Normaliza el rótulo de una unidad para compararlo ("Depto 1204" → "1204"). */
export const normalizeUnitLabel = (raw: string) => raw.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(depto|departamento|dpto|unidad|casa|of|oficina|n°|nº|no\.)\b/g, '')
    .replace(/[\s.#°º-]/g, '');

function unitKeys(unit: Pick<UnitRightsUnit, 'label' | 'number' | 'tower'>): string[] {
    const keys = [unit.label, unit.number];
    if (unit.tower) keys.push(`${unit.tower}-${unit.number}`, `${unit.tower}${unit.number}`);
    return [...new Set(keys.filter(Boolean).map(normalizeUnitLabel))];
}

/** Separa una línea: punto y coma o tabulador; si solo hay comas, unidad,valor (con coma decimal opcional). */
function splitLine(line: string): [string, string] | null {
    const sep = line.includes(';') ? ';' : line.includes('\t') ? '\t' : null;
    if (sep) {
        const parts = line.split(sep).map(part => part.trim().replace(/^"|"$/g, ''));
        return parts.length >= 2 ? [parts[0], parts[1]] : null;
    }
    const parts = line.split(',').map(part => part.trim().replace(/^"|"$/g, ''));
    if (parts.length === 2) return [parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], `${parts[1]},${parts[2]}`];
    return null;
}

/**
 * Pegado o CSV: una fila por unidad, "unidad;derechos" (también tabulador o
 * coma). Acepta encabezado, coma decimal y "Depto 1204". Las filas que no
 * calzan con una unidad se informan; nunca se inventan unidades.
 */
/** Índice rótulo normalizado → id de unidad (acepta "1204", "Depto 1204", "B-1204"). */
export function unitLabelIndex(units: Pick<UnitRightsUnit, 'id' | 'label' | 'number' | 'tower'>[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const unit of units) for (const key of unitKeys(unit)) if (!index.has(key)) index.set(key, unit.id);
    return index;
}

export function parseRightsCsv(text: string, units: Pick<UnitRightsUnit, 'id' | 'label' | 'number' | 'tower'>[]): RightsCsvResult {
    const index = unitLabelIndex(units);
    const values: Record<string, number> = {};
    const unmatched: string[] = [];
    const duplicates: string[] = [];
    const invalid: string[] = [];
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    lines.forEach((line, position) => {
        const pair = splitLine(line);
        if (!pair) { invalid.push(line.slice(0, 60)); return; }
        const [label, rawValue] = pair;
        const value = parsePermilleText(rawValue);
        if (position === 0 && value === undefined && !index.has(normalizeUnitLabel(label))) return; // encabezado
        const unitId = index.get(normalizeUnitLabel(label));
        if (!unitId) { unmatched.push(label.slice(0, 40)); return; }
        if (value === undefined || value === null) { invalid.push(label.slice(0, 40)); return; }
        if (unitId in values) duplicates.push(label.slice(0, 40));
        values[unitId] = value;
    });
    return { values, unmatched, duplicates, invalid };
}

/**
 * Proporción de un cobro de gastos comunes → ‰ que suman exactamente 1000
 * (resto mayor a 4 decimales). Solo si cubre todas las unidades con montos > 0.
 */
export function permilleFromAmounts(amounts: Record<string, number>, unitIds: string[]): Record<string, number> | null {
    if (unitIds.length === 0) return null;
    if (unitIds.some(id => !(Number(amounts[id]) > 0))) return null;
    const total = unitIds.reduce((sum, id) => sum + Number(amounts[id]), 0);
    const target = RIGHTS_TOTAL_PERMILLE * SCALE;
    const raw = unitIds.map(id => (Number(amounts[id]) / total) * target);
    const floors = raw.map(Math.floor);
    let remainder = target - floors.reduce((sum, value) => sum + value, 0);
    const order = raw.map((value, index) => ({ index, frac: value - floors[index] })).sort((a, b) => b.frac - a.frac);
    for (const { index } of order) { if (remainder <= 0) break; floors[index] += 1; remainder -= 1; }
    return Object.fromEntries(unitIds.map((id, index) => [id, floors[index] / SCALE]));
}

/** Bloqueo: mientras una asamblea en curso tenga una votación abierta, no se editan. */
export function rightsLockMessage(lockedBy: string | null): string | null {
    return lockedBy ? `Hay una votación abierta en la asamblea "${lockedBy}": los derechos no se cambian hasta cerrarla.` : null;
}

export function assertRightsEditable(lockedBy: string | null): void {
    const message = rightsLockMessage(lockedBy);
    if (message) throw new Error(message);
}

/** Estado de los derechos: faltan, provisorios (sin fuente) o verificados. */
export function unitRightsStatus(units: Pick<UnitRightsUnit, 'sharePermille'>[], latest: Pick<UnitRightsRevision, 'verified'> | null): UnitRightsStatus {
    if (units.length === 0 || units.some(unit => unit.sharePermille === null || !(unit.sharePermille > 0))) return 'missing';
    return latest?.verified ? 'verified' : 'provisional';
}

export const PROVISIONAL_RIGHTS_WARNING = 'Los derechos de las unidades son provisorios: no se han verificado contra el reglamento de copropiedad. Registra la fuente en Asambleas › Derechos de cada unidad.';

/** Marca una foto de derechos como provisoria (solo si se cuenta por alícuota). */
export function markProvisional(rights: RightsSnapshot, status: UnitRightsStatus): RightsSnapshot {
    if (rights.method !== 'share' || status !== 'provisional') return rights;
    if (rights.warnings.includes(PROVISIONAL_RIGHTS_WARNING)) return { ...rights, provisional: true };
    return { ...rights, provisional: true, warnings: [...rights.warnings, PROVISIONAL_RIGHTS_WARNING] };
}

export function sourceNoteOf(raw: string): string {
    return raw.replace(/\s+/g, ' ').trim().slice(0, RIGHTS_SOURCE_MAX);
}
