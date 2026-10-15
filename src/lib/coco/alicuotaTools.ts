import 'server-only';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { PROVISIONAL_RIGHTS_WARNING, formatDecimalEsCl, permilleToPercent, RIGHTS_TOLERANCE_PERCENT, sourceNoteOf } from '@/lib/assemblies/unitRights';
import {
    UnitRightsError,
    distributeUnitRightsEqually,
    setUnitShare,
    unitRightsLock,
    type UnitRightsActor,
} from '@/lib/assemblies/unitRightsService';
import type { UnitRightsStatus, UnitRightsValidation } from '@/lib/assemblies/types';
import { ALICUOTA_PERCENT_PARAM, alicuotaPercentText, readAlicuotaInput } from './alicuotaInput';

/**
 * Herramientas de alícuotas de CoCo, en **%** (‰ en la base: ‰ = % × 10).
 * Escriben solo a través de `unitRightsService` (reglas del PR #175):
 * - revisión auditable en `unit_rights_revisions` (`save_unit_rights` con método
 *   `manual` si la carga queda completa; si no, el trigger la registra como
 *   `direct`), con "vía CoCo" en quién guardó y `channel: 'coco'` en el evento;
 * - bloqueo mientras haya una votación abierta;
 * - sin fuente del reglamento, los valores quedan **provisorios**.
 */

export const ALICUOTA_TOOL_DEFINITIONS = [
    {
        name: 'create_unit',
        description: 'Crea un departamento/unidad en la comunidad, con su alícuota opcional en PORCENTAJE (%). SOLO administradores. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                number: { type: 'string', description: 'Número o identificador del depto, ej: 1204' },
                tower: { type: 'string', description: 'Torre o bloque, ej: A. Opcional.' },
                floor: { type: 'string', description: 'Piso (número). Opcional.' },
                [ALICUOTA_PERCENT_PARAM]: { type: 'string', description: 'Alícuota (derechos) de la unidad en PORCENTAJE (%), con coma decimal y hasta 4 decimales, ej: 0,8333. Mayor que 0 y como máximo 100. La suma de todas las unidades es 100 %. Opcional; se puede cargar después.' },
            },
            required: ['number'],
        },
    },
    {
        name: 'set_unit_alicuota',
        description: 'Fija la alícuota (derechos) en PORCENTAJE (%) de una unidad existente. La suma de todas debe dar 100 % (± 0,05 %). Sin fuente del reglamento queda provisoria. Bloqueada si hay una votación de asamblea abierta. SOLO administradores. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                unit_id: { type: 'string', description: 'ID o número del depto.' },
                [ALICUOTA_PERCENT_PARAM]: { type: 'string', description: 'Alícuota en PORCENTAJE (%), con coma decimal y hasta 4 decimales, ej: 0,8333. Mayor que 0 y como máximo 100.' },
                fuente: { type: 'string', description: 'Fuente del valor si el admin la indica (ej: "Reglamento de copropiedad, art. 5"). Opcional; sin fuente queda provisoria.' },
            },
            required: ['unit_id', ALICUOTA_PERCENT_PARAM],
        },
    },
    {
        name: 'distribute_alicuotas_equally',
        description: 'Reparte el 100 % en partes iguales entre TODAS las unidades de la comunidad (suma exacta 100 %). Útil cuando todas pagan igual. Sin fuente del reglamento queda provisoria. Bloqueada si hay una votación de asamblea abierta. SOLO administradores. Requiere confirmación.',
        input_schema: {
            type: 'object' as const,
            properties: {
                fuente: { type: 'string', description: 'Fuente si el admin indica que el reglamento fija partes iguales (ej: "Reglamento de copropiedad, art. 5"). Opcional; sin fuente queda provisoria.' },
            },
            required: [],
        },
    },
] as const;

export interface AlicuotaToolContext {
    communityId: string;
    userId?: string;
    name?: string;
}

const COCO_CHANNEL = 'coco' as const;
const PENDING_SOURCE = 'Quedan provisorios: registra la fuente (reglamento de copropiedad) en Asambleas › Derechos de cada unidad.';

async function actorOf(ctx: AlicuotaToolContext): Promise<UnitRightsActor | null> {
    if (!ctx.userId) return null;
    let name = (ctx.name || '').trim();
    if (!name) {
        const { data } = await supabaseAdmin.from('profiles').select('name').eq('id', ctx.userId).maybeSingle();
        name = typeof data?.name === 'string' ? data.name.trim() : '';
    }
    return { id: ctx.userId, role: 'admin', communityId: ctx.communityId, name: `${name || 'Administración'} (vía CoCo)`.slice(0, 160) };
}

const statusText = (status: UnitRightsStatus) => (status === 'verified' ? 'verificados' : status === 'provisional' ? 'provisorios' : 'incompletos');

function sumSummary(validation: UnitRightsValidation) {
    const total = formatDecimalEsCl(permilleToPercent(validation.total), 5) || '0';
    return {
        suma_actual_porcentaje: `${total} %`,
        diferencia_porcentaje: `${formatDecimalEsCl(permilleToPercent(validation.difference), 5) || '0'} %`,
        tolerancia: `± ${formatDecimalEsCl(RIGHTS_TOLERANCE_PERCENT)} %`,
    };
}

function rightsError(error: unknown, fallback: string) {
    if (error instanceof UnitRightsError) return { error: error.message, bloqueado_por_votacion: error.status === 409 };
    return { error: fallback, detail: error instanceof Error ? error.message : undefined };
}

async function shareFor(actor: UnitRightsActor, unitId: string, permille: number, source: string) {
    const result = await setUnitShare(actor, unitId, permille, source, COCO_CHANNEL);
    const provisional = result.status !== 'verified';
    return {
        alicuota_porcentaje: alicuotaPercentText(result.permille),
        derechos_completos: result.complete,
        estado_derechos: statusText(result.status),
        provisorio: provisional,
        ...sumSummary(result.validation),
        advertencias: [
            ...(result.complete ? [] : result.validation.errors),
            ...(provisional ? [result.complete ? PROVISIONAL_RIGHTS_WARNING : PENDING_SOURCE] : []),
        ],
    };
}

export async function runCreateUnit(ctx: AlicuotaToolContext, input: Record<string, string>) {
    const number = (input.number || '').trim().slice(0, 80);
    if (!number) return { error: 'Indica el número o identificador del depto.' };
    const reading = readAlicuotaInput('create_unit', input, number);
    if (!reading.ok) return { error: reading.error };

    const record: Record<string, unknown> = { community_id: ctx.communityId, number };
    if (input.tower && input.tower.trim()) record.tower = input.tower.trim().slice(0, 40);
    if (input.floor && input.floor.trim()) {
        const floor = Number(input.floor);
        if (!Number.isInteger(floor) || floor < -10 || floor > 300) return { error: 'El piso indicado no es válido.' };
        record.floor = floor;
    }

    let actor: UnitRightsActor | null = null;
    if (reading.permille !== null) {
        actor = await actorOf(ctx);
        if (!actor) return { error: 'No pude identificarte para registrar quién cargó la alícuota.' };
        // Se revisa antes de crear para no dejar una unidad a medias.
        const lock = await unitRightsLock(ctx.communityId);
        if (lock) return { error: lock, bloqueado_por_votacion: true };
    }

    // La unidad se crea sin derechos; la alícuota entra por el servicio (auditoría y bloqueo).
    const { data, error } = await supabaseAdmin.from('units').insert(record).select('id, number').single();
    if (error || !data) return { error: 'No se pudo crear la unidad.', detail: error?.message };
    if (reading.permille === null || !actor) {
        return { success: true, unit_id: data.id, message: `Unidad ${data.number} creada, sin alícuota. Cárgala en % cuando la tengas (la suma de todas debe dar 100 %).` };
    }
    try {
        const share = await shareFor(actor, data.id, reading.permille, '');
        return { success: true, unit_id: data.id, ...share, message: `Unidad ${data.number} creada con alícuota ${share.alicuota_porcentaje}${share.provisorio ? ' (provisoria)' : ''}.` };
    } catch (shareError) {
        return { success: true, unit_id: data.id, alicuota_guardada: false, ...rightsError(shareError, 'No se pudo guardar la alícuota.'), message: `Unidad ${data.number} creada, pero sin alícuota.` };
    }
}

export async function runSetUnitAlicuota(ctx: AlicuotaToolContext, unitId: string, input: Record<string, string>) {
    const reading = readAlicuotaInput('set_unit_alicuota', input);
    if (!reading.ok) return { error: reading.error };
    if (reading.permille === null) return { error: 'Indica la alícuota en %, por ejemplo 0,8333.' };
    const actor = await actorOf(ctx);
    if (!actor) return { error: 'No pude identificarte para registrar quién cambió la alícuota.' };
    try {
        const share = await shareFor(actor, unitId, reading.permille, sourceNoteOf(input.fuente || ''));
        return {
            success: true, ...share,
            message: `Alícuota de la unidad fijada en ${share.alicuota_porcentaje}${share.provisorio ? ' (provisoria)' : ''}. Suma actual: ${share.suma_actual_porcentaje} de 100 %.`,
        };
    } catch (error) {
        return rightsError(error, 'No se pudo fijar la alícuota.');
    }
}

export async function runDistributeEqually(ctx: AlicuotaToolContext, input: Record<string, string>) {
    const actor = await actorOf(ctx);
    if (!actor) return { error: 'No pude identificarte para registrar quién repartió las alícuotas.' };
    try {
        const view = await distributeUnitRightsEqually(actor, sourceNoteOf(input.fuente || ''), COCO_CHANNEL);
        const shares = view.units.map(unit => unit.sharePermille ?? 0);
        const min = Math.min(...shares);
        const max = Math.max(...shares);
        const provisional = view.status !== 'verified';
        const each = min === max ? alicuotaPercentText(min) : `entre ${alicuotaPercentText(min)} y ${alicuotaPercentText(max)}`;
        return {
            success: true,
            unidades: view.units.length,
            alicuota_porcentaje: each,
            suma_porcentaje: `${formatDecimalEsCl(permilleToPercent(view.total), 5)} %`,
            estado_derechos: statusText(view.status),
            provisorio: provisional,
            advertencias: provisional ? [PROVISIONAL_RIGHTS_WARNING] : [],
            message: `100 % repartido en partes iguales entre ${view.units.length} unidades (${each} cada una)${provisional ? ', como provisorio' : ''}.`,
        };
    } catch (error) {
        return rightsError(error, 'No se pudieron repartir las alícuotas.');
    }
}
