import type { RightsCsvResult, RightsScale, RightsSnapshot, UnitRightsRevision, UnitRightsStatus, UnitRightsUnit, UnitRightsValidation } from './types';

/**
 * Derechos de cada unidad para votar en asambleas. Módulo **puro**.
 *
 * Ley 21.442, art. 3: los derechos de cada copropietario en los bienes comunes
 * son la proporción que fija el reglamento de copropiedad (a falta de ella, el
 * avalúo fiscal). Art. 15: en las asambleas se vota según esos derechos.
 * Suele coincidir con el prorrateo de gastos comunes, pero no es lo mismo: lo
 * que no tenga fuente del reglamento o la escritura queda **provisorio**.
 *
 * **Escala.** La interfaz muestra y acepta **porcentaje** (los reglamentos
 * chilenos suelen decir "0,532 %"; la suma es 100 %), con hasta 4 decimales y
 * coma decimal. Internamente se sigue guardando `units.share_permille` en ‰:
 * ‰ = % × 10. La validación trabaja en ‰ y redacta sus mensajes en %.
 *
 * **Números (es-CL).** Punto de miles y coma decimal, al formatear y al leer:
 * "1.000" es mil (no uno) y "0,532" es cero coma quinientos treinta y dos.
 */

export const RIGHTS_TOTAL_PERMILLE = 1000;
/** Tolerancia de redondeo: la suma debe quedar en 1000‰ ± 0,5 (= 100 % ± 0,05). */
export const RIGHTS_TOLERANCE_PERMILLE = 0.5;
export const RIGHTS_TOTAL_PERCENT = 100;
/** La misma tolerancia en %: ± 0,05 %. */
export const RIGHTS_TOLERANCE_PERCENT = 0.05;
/** Decimales con que se muestran los derechos en %. */
export const RIGHTS_PERCENT_DECIMALS = 4;
export const RIGHTS_SOURCE_MAX = 500;

const SCALE = 10_000;
export const roundPermille = (value: number) => Math.round(value * SCALE) / SCALE;
const toUnits = (value: number) => Math.round(value * SCALE);

// ---------------------------------------------------------------------------
// Números en es-CL: punto de miles, coma decimal
// ---------------------------------------------------------------------------

/**
 * Formatea con la convención es-CL (punto de miles, coma decimal), hasta
 * `maxDecimals` decimales y sin ceros de relleno: 1000 → "1.000"; 0.532 → "0,532".
 * Determinista (no depende de los datos de ICU del navegador).
 */
export function formatDecimalEsCl(value: number, maxDecimals = 4): string {
    if (!Number.isFinite(value)) return '';
    const factor = 10 ** maxDecimals;
    const rounded = Math.round(Math.abs(value) * factor) / factor;
    const [integer, decimals = ''] = rounded.toFixed(maxDecimals).split('.');
    const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const trimmed = decimals.replace(/0+$/, '');
    const text = trimmed ? `${grouped},${trimmed}` : grouped;
    return value < 0 && rounded !== 0 ? `-${text}` : text;
}

/**
 * Lee un número escrito en es-CL. Vacío → null; inválido o negativo → undefined.
 * - Con coma: la coma es el decimal y los puntos, separadores de miles bien
 *   agrupados ("1.000,25" → 1000.25; "1,234.5" no es válido).
 * - Sin coma: los puntos agrupados de a tres son miles ("1.000" → 1000,
 *   "12.500" → 12500). Un punto que no agrupa de a tres, o tras un 0 inicial,
 *   se tolera como decimal de archivos exportados con punto ("12.5", "0.532").
 * Ignora los símbolos %, ‰ y los espacios.
 */
export function parseDecimalEsCl(raw: string): number | null | undefined {
    const text = String(raw ?? '').trim().replace(/‰|%|\s/g, '');
    if (text === '') return null;
    let normalized: string;
    if (text.includes(',')) {
        const match = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d+)$/.exec(text);
        if (!match) return undefined;
        normalized = `${match[1].replace(/\./g, '')}.${match[2]}`;
    } else if (/^[1-9]\d{0,2}(?:\.\d{3})+$/.test(text)) {
        normalized = text.replace(/\./g, '');
    } else if (/^\d+(?:\.\d+)?$/.test(text)) {
        normalized = text;
    } else return undefined;
    const value = Number(normalized);
    return Number.isFinite(value) ? value : undefined;
}

/** Texto en ‰ → ‰ (4 decimales). Vacío → null. Inválido o negativo → undefined. */
export function parsePermilleText(raw: string): number | null | undefined {
    const value = parseDecimalEsCl(raw);
    return typeof value === 'number' ? roundPermille(value) : value;
}

/** ‰ con formato es-CL (punto de miles, coma decimal, hasta 4 decimales). */
export function formatPermille(value: number | null): string {
    if (value === null) return '';
    return formatDecimalEsCl(roundPermille(value), 4);
}

// ---------------------------------------------------------------------------
// Porcentaje (lo que ve el usuario) ↔ ‰ (lo que se guarda)
// ---------------------------------------------------------------------------

/** % → ‰ (× 10), con los 4 decimales de ‰ que admite la base. */
export function percentToPermille(value: number): number {
    return roundPermille(value * 10);
}

/** ‰ → % (÷ 10), sin perder decimales (4 en ‰ son 5 en %). */
export function permilleToPercent(value: number): number {
    return toUnits(value) / (SCALE * 10);
}

/** Texto en % → ‰. Vacío → null. Inválido o negativo → undefined. */
export function parsePercentToPermille(raw: string): number | null | undefined {
    const value = parseDecimalEsCl(raw);
    return typeof value === 'number' ? percentToPermille(value) : value;
}

/** ‰ → % en texto es-CL, hasta 4 decimales y sin símbolo: 5.32 → "0,532". */
export function formatPercent(permille: number | null, maxDecimals = RIGHTS_PERCENT_DECIMALS): string {
    if (permille === null || !Number.isFinite(permille)) return '';
    return formatDecimalEsCl(permilleToPercent(permille), maxDecimals);
}

/** ‰ → "0,532 %" (vacío si no hay valor). */
export function formatRightsPercent(permille: number | null, maxDecimals = RIGHTS_PERCENT_DECIMALS): string {
    const text = formatPercent(permille, maxDecimals);
    return text ? `${text} %` : '';
}

/**
 * ‰ → % como texto editable **sin pérdida** (hasta 5 decimales: los 4 de ‰).
 * Para celdas que reflejan un archivo y se vuelven a leer: 12.5 → "1,25".
 */
export function permilleToPercentText(permille: number | null): string {
    return permille === null ? '' : formatPercent(permille, 5);
}

/** Texto con hasta 5 decimales para cifras que se comparan con la tolerancia (sumas, diferencias). */
const exactPercent = (permille: number) => formatPercent(permille, 5) || '0';

// ---------------------------------------------------------------------------
// Escala de una columna o pegado (%, ‰)
// ---------------------------------------------------------------------------

const stripAccents = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const normalizeRightsHeader = (header: string) => stripAccents(header.toLowerCase()).replace(/[\s_\-().:/]+/g, '');

/**
 * ¿Es este encabezado una columna de derechos? Devuelve la escala que indica
 * ("derechos_porcentaje", "%" → %; "derechos_permil", "‰" → ‰), 'auto' si no la
 * indica ("prorrateo", "alícuota", "derechos") o null si no es.
 */
export function rightsHeaderScale(header: string): RightsScale | 'auto' | null {
    const h = normalizeRightsHeader(header);
    if (!h) return null;
    if (h.includes('‰') || h.includes('permil') || h.includes('pormil')) return 'permille';
    if (h.includes('%') || h.includes('porcentaje') || h.includes('porciento')) return 'percent';
    if (/prorrateo|alicuota|derecho/.test(h)) return 'auto';
    return null;
}

/**
 * Escala por la suma, cuando el encabezado no la dice: ≈100 → %, ≈1000 → ‰ (con
 * la tolerancia). Si no da ninguna, la más cercana (en escala logarítmica:
 * menos de ~316 → %). Sin valores, % (la escala de la interfaz).
 */
export function inferRightsScale(sum: number): RightsScale {
    if (!(sum > 0)) return 'percent';
    if (Math.abs(sum - RIGHTS_TOTAL_PERCENT) <= RIGHTS_TOLERANCE_PERCENT) return 'percent';
    if (Math.abs(sum - RIGHTS_TOTAL_PERMILLE) <= RIGHTS_TOLERANCE_PERMILLE) return 'permille';
    return sum < Math.sqrt(RIGHTS_TOTAL_PERCENT * RIGHTS_TOTAL_PERMILLE) ? 'percent' : 'permille';
}

/** Celda → número (en su escala) y el símbolo que traía (si lo traía). */
export function parseRightsCell(raw: string): { value: number | null | undefined; symbol: RightsScale | null } {
    const text = String(raw ?? '').trim();
    const symbol: RightsScale | null = text.includes('%') ? 'percent' : text.includes('‰') ? 'permille' : null;
    return { value: parseDecimalEsCl(text), symbol };
}

export interface ConvertedRightsColumn {
    /** Por celda: ‰ convertido, null si venía vacía, undefined si no se pudo leer. */
    values: (number | null | undefined)[];
    scale: RightsScale;
    scaleInferred: boolean;
}

/**
 * Convierte una columna de derechos a ‰. Escala: la del encabezado (en ‰ no se
 * convierte); si es ambiguo, el símbolo de las celdas; si no hay símbolo, la
 * suma (≈100 → %, ≈1000 → ‰). Una celda con su propio símbolo manda sobre la columna.
 */
export function convertRightsColumn(raws: string[], headerScale: RightsScale | 'auto'): ConvertedRightsColumn {
    const cells = raws.map(parseRightsCell);
    let scale: RightsScale;
    let scaleInferred = false;
    if (headerScale !== 'auto') scale = headerScale;
    else {
        scaleInferred = true;
        const symbol = cells.find(cell => cell.symbol)?.symbol;
        scale = symbol ?? inferRightsScale(cells.reduce((acc, cell) => acc + (typeof cell.value === 'number' ? cell.value : 0), 0));
    }
    const values = cells.map(cell => {
        if (cell.value === null || cell.value === undefined) return cell.value;
        return (cell.symbol ?? scale) === 'percent' ? percentToPermille(cell.value) : roundPermille(cell.value);
    });
    return { values, scale, scaleInferred };
}

// ---------------------------------------------------------------------------
// Validación (en ‰; mensajes en %)
// ---------------------------------------------------------------------------

/**
 * Valida una carga completa (valores en ‰): todas las unidades con un valor
 * > 0 y ≤ 100 %, y la suma en 100 % ± 0,05 (1000‰ ± 0,5). Si no cuadra no se
 * guarda y se informa la diferencia, en %.
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
    if (invalid.length) errors.push(`Valores no válidos en ${invalid.join(', ')}: deben ser mayores que 0 % y no superar ${RIGHTS_TOTAL_PERCENT} %.`);
    if (!missing.length && !invalid.length && units.length > 0 && Math.abs(difference) > RIGHTS_TOLERANCE_PERMILLE) {
        errors.push(`La suma debe ser ${RIGHTS_TOTAL_PERCENT} % (hoy: ${exactPercent(total)} %): ${difference > 0 ? 'sobra' : 'falta'} ${exactPercent(Math.abs(difference))} % (tolerancia ± ${formatDecimalEsCl(RIGHTS_TOLERANCE_PERCENT)} %).`);
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

/** Índice rótulo normalizado → id de unidad (acepta "1204", "Depto 1204", "B-1204"). */
export function unitLabelIndex(units: Pick<UnitRightsUnit, 'id' | 'label' | 'number' | 'tower'>[]): Map<string, string> {
    const index = new Map<string, string>();
    for (const unit of units) for (const key of unitKeys(unit)) if (!index.has(key)) index.set(key, unit.id);
    return index;
}

/**
 * Pegado o CSV: una fila por unidad, "unidad;derechos" (también tabulador o
 * coma). Acepta encabezado, coma decimal y "Depto 1204". Los valores se leen en
 * **%**; en ‰ si el encabezado lo dice ("derechos_permil", "‰") o, con un
 * encabezado ambiguo o sin él, si los valores traen ‰ o suman ≈1000. Devuelve ‰.
 * Las filas que no calzan con una unidad se informan; nunca se inventan unidades.
 */
export function parseRightsCsv(text: string, units: Pick<UnitRightsUnit, 'id' | 'label' | 'number' | 'tower'>[]): RightsCsvResult {
    const index = unitLabelIndex(units);
    const unmatched: string[] = [];
    const invalid: string[] = [];
    const rows: { unitId: string; label: string; raw: string }[] = [];
    let headerScale: RightsScale | 'auto' = 'auto';
    const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    lines.forEach((line, position) => {
        const pair = splitLine(line);
        if (!pair) { invalid.push(line.slice(0, 60)); return; }
        const [label, rawValue] = pair;
        if (position === 0 && typeof parseDecimalEsCl(rawValue) !== 'number' && !index.has(normalizeUnitLabel(label))) { // encabezado
            const scale = rightsHeaderScale(rawValue);
            if (scale) headerScale = scale;
            return;
        }
        const unitId = index.get(normalizeUnitLabel(label));
        if (!unitId) { unmatched.push(label.slice(0, 40)); return; }
        rows.push({ unitId, label: label.slice(0, 40), raw: rawValue });
    });
    const converted = convertRightsColumn(rows.map(row => row.raw), headerScale);
    const values: Record<string, number> = {};
    const duplicates: string[] = [];
    rows.forEach((row, position) => {
        const value = converted.values[position];
        if (value === undefined || value === null) { invalid.push(row.label); return; }
        if (row.unitId in values) duplicates.push(row.label);
        values[row.unitId] = value;
    });
    return { values, scale: converted.scale, scaleInferred: converted.scaleInferred, unmatched, duplicates, invalid };
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
