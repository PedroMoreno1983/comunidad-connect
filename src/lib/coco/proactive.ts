/**
 * proactive.ts — Conciencia situacional de CoCo.
 *
 * Al abrir una conversación, CoCo puede adelantarse a lo que la persona
 * probablemente necesita: al residente, su deuda y próximo vencimiento; al
 * administrador, la morosidad del mes. Se calcula solo en el primer turno (para
 * no pagar consultas en cada mensaje) y se inyecta como contexto para que CoCo
 * lo mencione con naturalidad, sin inventar nada.
 *
 * Reutiliza getUnitStatement (lógica de cartola ya probada) en vez de duplicar.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { getUnitStatement } from '@/lib/finance/collectionService';

const money = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;

interface ProactiveUser {
    user_id?: string;
    role?: string;
    community_id?: string;
}

/**
 * Devuelve un bloque de "estado actual relevante" para inyectar en el prompt, o
 * '' si no hay nada que destacar. Best-effort: cualquier error devuelve ''.
 */
export async function getProactiveContext(userCtx: ProactiveUser): Promise<string> {
    const communityId = userCtx.community_id;
    if (!communityId) return '';

    try {
        if (userCtx.role === 'admin') {
            return await adminProactive(communityId);
        }
        if ((!userCtx.role || userCtx.role === 'resident') && userCtx.user_id) {
            return await residentProactive(communityId, userCtx.user_id);
        }
    } catch (error) {
        console.warn('[coco] getProactiveContext failed:', error);
    }
    return '';
}

async function residentProactive(communityId: string, userId: string): Promise<string> {
    const admin = getSupabaseAdmin();
    // El dueño se resuelve por units.owner_id (uuid) para evitar el choque de
    // tipos con profiles.unit_id (text).
    const { data: unit } = await admin
        .from('units')
        .select('id')
        .eq('community_id', communityId)
        .eq('owner_id', userId)
        .maybeSingle();
    if (!unit) return '';

    const statement = await getUnitStatement(communityId, String(unit.id));
    if (statement.balance <= 0) {
        return `\n\n## Estado actual relevante\nEsta persona está al día con sus gastos comunes. Si saluda, puedes reconocerlo brevemente; no la satures con esto.`;
    }

    const overduePart = statement.overdueAmount > 0
        ? ` De eso, ${money(statement.overdueAmount)} está VENCIDO${statement.oldestOverdueMonth ? ` (lo más antiguo, de ${statement.oldestOverdueMonth})` : ''}.`
        : '';
    return `\n\n## Estado actual relevante\nEsta persona debe ${money(statement.balance)} en total.${overduePart}`
        + `\nSi saluda o pregunta algo general, menciónalo de forma breve y ofrécele pagar o ver el detalle. No lo repitas si ya lo dijiste.`;
}

async function adminProactive(communityId: string): Promise<string> {
    const admin = getSupabaseAdmin();
    const month = new Date().toISOString().slice(0, 7);

    const { data: overdue } = await admin
        .from('expenses')
        .select('unit_id')
        .eq('community_id', communityId)
        .in('status', ['pending', 'overdue']);

    const rows = overdue ?? [];
    if (rows.length === 0) return '';
    const units = new Set(rows.map(row => String(row.unit_id))).size;

    return `\n\n## Estado actual relevante\nHay ${units} unidad(es) con gasto común impago en la comunidad (mes en curso: ${month}).`
        + `\nSi el administrador saluda o pregunta algo general, ofrécele revisar la morosidad o gestionar la cobranza. No lo repitas si ya lo dijiste.`;
}
