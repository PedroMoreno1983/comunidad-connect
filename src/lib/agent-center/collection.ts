import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { stableNotificationId } from '@/lib/agent-center/utils';
import type { AgentCollectionExpense, AgentCollectionPlan, AgentCollectionUnit } from '@/lib/types';

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
    return expenses;
}

export async function resolveCollectionRecipients(communityId: string, expenses: AgentCollectionExpense[]): Promise<AgentCollectionPlan> {
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
    const plan: AgentCollectionPlan = { notifications: [], missingRecipients: [], recipientCount: 0 };
    for (const expense of expenses) {
        const unit = byUnit.get(expense.unit_id || '');
        const unitLabel = String(unit?.unit_number || unit?.number || expense.unit_id || 'Sin unidad');
        const recipient = [unit?.resident_profile_id, unit?.owner_id].find(id => id && validRecipients.has(id));
        if (!recipient) {
            plan.missingRecipients.push({ expenseId: expense.id, unitId: expense.unit_id, unitLabel,
                reason: unit ? 'No hay un residente o propietario vinculado a esta comunidad.' : 'La unidad no esta vinculada a esta comunidad.' });
            continue;
        }
        plan.notifications.push({
            id: stableNotificationId('finance_collection', communityId, recipient, expense.id),
            user_id: recipient, type: expense.status === 'overdue' ? 'alert' : 'warning', category: 'finance_collection',
            title: 'Gasto comun pendiente',
            body: `Tu unidad ${unitLabel} registra un gasto comun pendiente (${expense.month || 'periodo actual'}). Revisa el saldo actualizado y los abonos en tu estado de cuenta.`,
            link: '/resident/finances', community_id: communityId,
        });
    }
    plan.recipientCount = new Set(plan.notifications.map(row => row.user_id)).size;
    if (plan.missingRecipients.length) {
        const { data: administrators, error } = await admin.from('profiles').select('id')
            .eq('community_id', communityId).eq('role', 'admin');
        if (error) throw error;
        plan.adminNotifications = (administrators || []).map(profile => ({
            id: stableNotificationId('finance_collection_unresolved', communityId, String(profile.id),
                [...plan.missingRecipients.map(issue => issue.expenseId)].sort().join(',')),
            user_id: String(profile.id), type: 'warning', category: 'finance_collection',
            title: 'Cobranza: unidades sin destinatario',
            body: `${plan.missingRecipients.length} cobro(s) necesitan vincular un residente o propietario. Revisa las unidades y retoma la tarea de cobranza en Agent Center.`,
            link: '/admin/units', community_id: communityId,
        }));
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
