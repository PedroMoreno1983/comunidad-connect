import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { isCommitteeDiscount } from '@/lib/finance/adjustments';
import type { AgentCollectionExpense, AgentCollectionPlan, AgentCollectionStage, AgentCollectionUnit } from '@/lib/types';

const PAGE_SIZE = 200;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function collectionBatches<T>(rows: T[]): T[][] {
    const batches: T[][] = [];
    for (let start = 0; start < rows.length; start += PAGE_SIZE) batches.push(rows.slice(start, start + PAGE_SIZE));
    return batches;
}

/** Keyset pagination: no 100-row cap or shifting offset between reads. */
export async function readCollectionExpenses(communityId: string): Promise<AgentCollectionExpense[]> {
    const admin = getSupabaseAdmin();
    const expenses: AgentCollectionExpense[] = [];
    let cursor: string | undefined;
    for (;;) {
        let query = admin.from('expenses').select('id, unit_id, month, amount, status, due_date')
            .eq('community_id', communityId).in('status', ['pending', 'overdue'])
            .order('id', { ascending: true }).limit(PAGE_SIZE);
        if (cursor) query = query.gt('id', cursor);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        expenses.push(...data);
        const next = String(data[data.length - 1].id);
        if (cursor && next <= cursor) throw new Error('La lectura de cobranza no avanzo.');
        cursor = next;
        // Continue even if the server applies a lower row limit.
    }
    // Multas, intereses, estacionamientos y extras viven en unit_charges: tambien son deuda.
    cursor = undefined;
    for (;;) {
        let query = admin.from('unit_charges').select('id, unit_id, month, amount, status, due_date, label, notes')
            .eq('community_id', communityId).eq('status', 'pending')
            .order('id', { ascending: true }).limit(PAGE_SIZE);
        if (cursor) query = query.gt('id', cursor);
        const { data, error } = await query;
        if (error) throw error;
        if (!data?.length) break;
        for (const row of data) {
            if (isCommitteeDiscount(row)) continue;
            expenses.push({ id: String(row.id), unit_id: row.unit_id, month: row.month, amount: Number(row.amount) || 0,
                status: 'pending', due_date: row.due_date, source: 'charge', label: row.label || null });
        }
        const next = String(data[data.length - 1].id);
        if (cursor && next <= cursor) throw new Error('La lectura de cobranza no avanzo.');
        cursor = next;
    }
    return expenses;
}

/** Dias de atraso entre dos fechas ISO (YYYY-MM-DD); negativo si aun no vence. */
export function daysOverdue(dueDate: string | null | undefined, today: string): number {
    if (!dueDate || !/^\d{4}-\d{2}-\d{2}/.test(dueDate)) return 0;
    const due = Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`);
    const now = Date.parse(`${today.slice(0, 10)}T00:00:00Z`);
    return Math.floor((now - due) / 86_400_000);
}

/** Escalera de cobranza: recordatorio, segundo aviso (15 dias) y propuesta de convenio (30 dias). */
export function collectionStage(days: number): AgentCollectionStage {
    if (days >= 30) return 'agreement';
    if (days >= 15) return 'second_notice';
    return 'reminder';
}

// Tono: cobrar es parte de convivir, y el aviso tiene que construir comunidad.
// Nunca montos, nunca amenazas ni lenguaje de deudor; siempre una salida concreta.
const STAGE_COPY: Record<AgentCollectionStage, { title: string; body: (unit: string) => string }> = {
    reminder: {
        title: 'Tu aporte a la comunidad',
        body: unit => `Hola, te contamos que la unidad ${unit} tiene cobros pendientes. Con los gastos comunes cuidamos lo que compartimos: aseo, seguridad, jardines y los espacios de todos. Revisa tu estado de cuenta con los abonos registrados; si ya pagaste, ¡gracias!`,
    },
    second_notice: {
        title: '¿Te podemos ayudar con tu cuenta?',
        body: unit => `La unidad ${unit} sigue con cobros pendientes hace más de 15 días. Si algo no cuadra o estás pasando por un momento difícil, escríbenos: entre vecinos siempre hay forma de ordenarse. Tu estado de cuenta muestra el saldo y los abonos al día.`,
    },
    agreement: {
        title: 'Busquemos juntos una solución',
        body: unit => `La unidad ${unit} tiene cobros pendientes hace más de 30 días. Podemos acordar un convenio en cuotas a tu medida, con total reserva. Escríbenos y lo conversamos; esta comunidad se sostiene entre todos.`,
    },
};

async function readActiveAgreementUnits(communityId: string, unitIds: string[]): Promise<Set<string>> {
    const covered = new Set<string>();
    for (const ids of collectionBatches(unitIds)) {
        const { data, error } = await getSupabaseAdmin().from('payment_agreements').select('unit_id')
            .eq('community_id', communityId).eq('status', 'active').in('unit_id', ids);
        if (error) throw error;
        for (const row of data || []) covered.add(String(row.unit_id));
    }
    return covered;
}

export async function resolveCollectionRecipients(
    communityId: string,
    expenses: AgentCollectionExpense[],
    today: string = chileTodayISO(),
): Promise<AgentCollectionPlan> {
    const admin = getSupabaseAdmin();
    const unitIds = [...new Set(expenses.map(row => row.unit_id || '').filter(id => UUID.test(id)))];
    const units: AgentCollectionUnit[] = [];
    for (const ids of collectionBatches(unitIds)) {
        const { data, error } = await admin.from('units').select('id, number, unit_number, owner_id, resident_profile_id')
            .eq('community_id', communityId).in('id', ids);
        if (error) throw error;
        units.push(...(data || []));
    }
    const profileIds = [...new Set(units.flatMap(unit => [unit.resident_profile_id, unit.owner_id]).filter((id): id is string => typeof id === 'string' && UUID.test(id)))];
    const validRecipients = new Set<string>();
    for (const ids of collectionBatches(profileIds)) {
        const { data, error } = await admin.from('profiles').select('id').eq('community_id', communityId).in('id', ids);
        if (error) throw error;
        for (const row of data || []) validRecipients.add(String(row.id));
    }
    const byUnit = new Map(units.map(unit => [String(unit.id), unit]));
    const withAgreement = await readActiveAgreementUnits(communityId, units.map(unit => String(unit.id)));
    const plan: AgentCollectionPlan = {
        notifications: [], missingRecipients: [], recipientCount: 0, agreementCandidates: [], skippedWithAgreement: 0,
    };
    // Un aviso por unidad y etapa, no uno por cobro: 30 cobros no son 30 mensajes.
    const debtsByUnit = new Map<string, AgentCollectionExpense[]>();
    for (const expense of expenses) {
        const unit = byUnit.get(expense.unit_id || '');
        const unitLabel = String(unit?.unit_number || unit?.number || expense.unit_id || 'Sin unidad');
        const recipient = [unit?.resident_profile_id, unit?.owner_id].find(id => id && validRecipients.has(id));
        if (!recipient) {
            plan.missingRecipients.push({ expenseId: expense.id, unitId: expense.unit_id, unitLabel,
                reason: unit ? 'No hay un residente o propietario vinculado a esta comunidad.' : 'La unidad no esta vinculada a esta comunidad.' });
            continue;
        }
        const unitKey = String(unit!.id);
        debtsByUnit.set(unitKey, [...(debtsByUnit.get(unitKey) || []), expense]);
    }
    for (const [unitKey, debts] of debtsByUnit) {
        if (withAgreement.has(unitKey)) {
            // Con convenio vigente no se insiste: el convenio ya ordena los pagos.
            plan.skippedWithAgreement! += 1;
            continue;
        }
        const unit = byUnit.get(unitKey)!;
        const unitLabel = String(unit.unit_number || unit.number || unitKey);
        const recipient = [unit.resident_profile_id, unit.owner_id].find(id => id && validRecipients.has(id))!;
        const days = Math.max(0, ...debts.map(debt => daysOverdue(debt.due_date, today)));
        const stage = collectionStage(days);
        const debtIds = debts.map(debt => `${debt.source || 'expense'}:${debt.id}`).sort().join(',');
        plan.notifications.push({
            id: stableNotificationId('finance_collection', communityId, recipient, `${unitKey}|${stage}|${debtIds}`),
            user_id: recipient, type: stage === 'reminder' ? 'warning' : 'alert', category: 'finance_collection',
            title: STAGE_COPY[stage].title, body: STAGE_COPY[stage].body(unitLabel),
            link: '/resident/finances', community_id: communityId,
        });
        if (stage === 'agreement') plan.agreementCandidates!.push({ unitId: unitKey, unitLabel, daysOverdue: days });
    }
    plan.recipientCount = new Set(plan.notifications.map(row => row.user_id)).size;
    const candidates = plan.agreementCandidates || [];
    if (plan.missingRecipients.length || candidates.length) {
        const { data: administrators, error } = await admin.from('profiles').select('id')
            .eq('community_id', communityId).eq('role', 'admin');
        if (error) throw error;
        const adminIds = (administrators || []).map(profile => String(profile.id));
        plan.adminNotifications = [];
        if (plan.missingRecipients.length) {
            plan.adminNotifications.push(...adminIds.map(adminId => ({
                id: stableNotificationId('finance_collection_unresolved', communityId, adminId,
                    [...plan.missingRecipients.map(issue => issue.expenseId)].sort().join(',')),
                user_id: adminId, type: 'warning', category: 'finance_collection',
                title: 'Cobranza: unidades sin destinatario',
                body: `${plan.missingRecipients.length} cobro(s) necesitan vincular un residente o propietario. Revisa las unidades y retoma la tarea de cobranza en Agent Center.`,
                link: '/admin/units', community_id: communityId,
            })));
        }
        if (candidates.length) {
            const labels = candidates.map(item => item.unitLabel).sort();
            plan.adminNotifications.push(...adminIds.map(adminId => ({
                id: stableNotificationId('finance_collection_agreement', communityId, adminId,
                    candidates.map(item => item.unitId).sort().join(',')),
                user_id: adminId, type: 'alert', category: 'finance_collection',
                title: 'Vecinos a los que podríamos ofrecer un convenio',
                body: `${candidates.length} unidad(es) llevan mas de 30 dias con cobros vencidos (${labels.slice(0, 8).join(', ')}${labels.length > 8 ? '...' : ''}). Te sugiero contactarlos en persona y ofrecer un convenio en cuotas; nada se crea sin tu aprobación.`,
                link: '/admin/finanzas/convenios', community_id: communityId,
            })));
        }
    }
    return plan;
}

export async function storeCollectionNotifications(plan: AgentCollectionPlan): Promise<string[]> {
    const admin = getSupabaseAdmin();
    const allNotifications = [...plan.notifications, ...(plan.adminNotifications || [])];
    for (const rows of collectionBatches(allNotifications)) {
        // A retry preserves the existing notification, including its read state.
        const { error } = await admin.from('notifications').upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (error) throw error;
    }
    return allNotifications.map(row => row.id);
}

export async function verifyCollectionNotifications(communityId: string, ids: string[]): Promise<number> {
    let verified = 0;
    for (const batch of collectionBatches(ids)) {
        const { count, error } = await getSupabaseAdmin().from('notifications').select('id', { count: 'exact', head: true })
            .eq('community_id', communityId).in('id', batch);
        if (error) throw error;
        if (count !== batch.length) throw new Error('No fue posible verificar todas las notificaciones en la app.');
        verified += count;
    }
    return verified;
}
