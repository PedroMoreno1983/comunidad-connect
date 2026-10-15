import {
    RIGHTS_TOTAL_PERCENT,
    formatRightsPercent,
    parsePercentToPermille,
    parsePermilleText,
    validateUnitRights,
} from '@/lib/assemblies/unitRights';

/**
 * Entrada y salida de las herramientas de alícuotas de CoCo (`create_unit`,
 * `set_unit_alicuota`, `distribute_alicuotas_equally`). Módulo **puro**.
 *
 * CoCo habla en **porcentaje** (como toda la interfaz desde el PR #178): el
 * parámetro es `alicuota_porcentaje`, con coma decimal es-CL ("0,8333"). En la
 * base se sigue guardando `units.share_permille` en ‰ (‰ = % × 10). Por
 * compatibilidad (sesiones con una confirmación pendiente de antes del cambio)
 * se acepta el parámetro viejo en ‰ (`share_permille` en `create_unit`,
 * `permille` en `set_unit_alicuota`) y se convierte.
 *
 * La lectura y la validación son las de `unitRights.ts`; aquí no se duplican.
 */

export const ALICUOTA_PERCENT_PARAM = 'alicuota_porcentaje';
export const LEGACY_PERMILLE_PARAMS = {
    create_unit: 'share_permille',
    set_unit_alicuota: 'permille',
} as const;

export type AlicuotaTool = keyof typeof LEGACY_PERMILLE_PARAMS;

export type AlicuotaReading =
    | { ok: true; permille: number | null; legacy: boolean }
    | { ok: false; error: string };

const text = (value: unknown) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '').trim();

/**
 * Lee la alícuota de la entrada de la herramienta y la devuelve en ‰.
 * Prefiere `alicuota_porcentaje` (en %); si no viene, el parámetro viejo en ‰.
 * Sin valor → `permille: null`. Valida que sea > 0 % y ≤ 100 % con `validateUnitRights`.
 */
export function readAlicuotaInput(tool: AlicuotaTool, input: Record<string, unknown>, label = 'la unidad'): AlicuotaReading {
    const percentRaw = text(input[ALICUOTA_PERCENT_PARAM]);
    const legacyRaw = text(input[LEGACY_PERMILLE_PARAMS[tool]]);
    let permille: number | null | undefined;
    let legacy = false;
    if (percentRaw) permille = parsePercentToPermille(percentRaw);
    else if (legacyRaw) { permille = parsePermilleText(legacyRaw); legacy = true; }
    else permille = null;
    if (permille === undefined) {
        return { ok: false, error: `La alícuota debe ser un porcentaje válido con coma decimal, por ejemplo 0,8333 % (entre 0 % y ${RIGHTS_TOTAL_PERCENT} %).` };
    }
    if (permille === null) return { ok: true, permille: null, legacy };
    const check = validateUnitRights([{ id: 'unit', label }], { unit: permille });
    if (check.invalid.length) return { ok: false, error: check.errors.join(' ') };
    return { ok: true, permille, legacy };
}

/** Alícuota de la entrada para la pantalla de confirmación ("8,3333 %"), o '' si no viene o no se lee. */
export function describeAlicuotaInput(tool: AlicuotaTool, input: Record<string, unknown>): string {
    const reading = readAlicuotaInput(tool, input);
    if (reading.ok) return formatRightsPercent(reading.permille);
    return text(input[ALICUOTA_PERCENT_PARAM]) ? `${text(input[ALICUOTA_PERCENT_PARAM])} %` : '';
}

/** ‰ → "8,3333 %", para lo que devuelven las herramientas. */
export const alicuotaPercentText = (permille: number | null) => formatRightsPercent(permille);
