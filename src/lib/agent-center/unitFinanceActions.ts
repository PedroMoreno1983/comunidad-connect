import { createHash } from 'node:crypto';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';
import { resolveResidentExpenseTarget } from '@/lib/agent-center/financeQueries';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function cleanText(value: unknown, max = 500) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function bestEffortInsert(table: string, payload: Record<string, unknown>) {
    try {
        const { data, error } = await getSupabaseAdmin().from(table).insert(payload).select('id').maybeSingle();
        if (error) {
            console.error(`[agent-center] bestEffortInsert failed for ${table}`, error);
            return null;
        }
        return typeof data?.id === 'string' ? data.id : null;
    } catch (error) {
        console.error(`[agent-center] bestEffortInsert threw for ${table}`, error);
        return null;
    }
}

function stableNotificationId(...parts: string[]) {
    const hash = createHash('sha256').update(parts.join(':')).digest('hex');
    const variant = ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
    return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-${variant}${hash.slice(18, 20)}-${hash.slice(20, 32)}`;
}

export async function executeCreateUnitExpense(action: AgentAction, profile: AgentProfile, communityId: string) {
    if (profile.role !== 'admin') throw new Error('Solo administracion puede crear cobros de gastos comunes.');
    const admin = getSupabaseAdmin();
    const target = await resolveResidentExpenseTarget(profile, null, action.args.unitNumber);
    const month = cleanText(action.args.month, 7);
    const dueDate = cleanText(action.args.dueDate, 10);
    const amount = Number(action.args.amount || 0);
    const label = cleanText(action.args.label, 120) || 'Gasto comun generado desde Agent Center';

    const { data: existing, error: existingError } = await admin
        .from('expenses')
        .select('id, status')
        .eq('community_id', communityId)
        .eq('unit_id', target.unitId)
        .eq('month', month)
        .limit(1)
        .maybeSingle();
    if (existingError) throw existingError;
    if (existing) throw new Error(`El Depto ${target.unitNumber} ya tiene un cobro registrado para ${month}.`);

    const { data: expense, error: expenseError } = await admin
        .from('expenses')
        .insert({
            unit_id: target.unitId,
            month,
            amount,
            status: 'pending',
            due_date: dueDate,
            community_id: communityId,
        })
        .select('id, month, amount, status, due_date')
        .single();
    if (expenseError) throw expenseError;

    await bestEffortInsert('expense_items', {
        expense_id: expense.id,
        category: 'other',
        label,
        amount,
    });

    let notificationId: string | null = null;
    if (target.residentId) {
        const notification = {
            id: stableNotificationId('unit_expense_created', communityId, target.residentId, String(expense.id)),
            user_id: target.residentId,
            type: 'warning',
            category: 'finance_charge',
            title: 'Nuevo gasto comun disponible',
            body: `Tu unidad ${target.unitNumber} tiene un nuevo gasto comun de $${amount.toLocaleString('es-CL')} (${month}), con vencimiento ${dueDate}.`,
            link: '/resident/finances',
            community_id: communityId,
        };
        const { data: notificationRow, error: notificationError } = await admin
            .from('notifications')
            .upsert(notification, { onConflict: 'id' })
            .select('id')
            .single();
        if (notificationError) throw notificationError;
        notificationId = String(notificationRow.id);
    }

    const recipientText = target.residentId ? 'y notifique al residente vinculado' : 'pero no hay residente vinculado para notificar';
    return {
        entityType: 'expense',
        entityId: String(expense.id),
        title: 'Cobro creado',
        message: `Cree un cobro pendiente para Depto ${target.unitNumber} por $${amount.toLocaleString('es-CL')} (${month}) ${recipientText}.`,
        data: { expense, notificationId, unitId: target.unitId, unitNumber: target.unitNumber, residentId: target.residentId },
    };
}

export async function executeSendUnitPaymentReminder(action: AgentAction, profile: AgentProfile, communityId: string) {
    if (profile.role !== 'admin') throw new Error('Solo administracion puede enviar recordatorios de cobro.');
    const admin = getSupabaseAdmin();
    const target = await resolveResidentExpenseTarget(profile, action.args.residentQuery, action.args.unitNumber);
    if (!target.residentId) {
        throw new Error(`El Depto ${target.unitNumber} no tiene un residente vinculado para recibir el recordatorio.`);
    }

    const { data: expenses, error: expensesError } = await admin
        .from('expenses')
        .select('id, month, amount, status, due_date')
        .eq('unit_id', target.unitId)
        .eq('community_id', communityId)
        .in('status', ['pending', 'overdue'])
        .order('due_date', { ascending: true });
    if (expensesError) throw expensesError;

    const rows = (expenses || []) as Array<Record<string, unknown>>;
    if (rows.length === 0) {
        return {
            entityType: 'notification',
            entityId: null,
            title: 'Sin deuda pendiente',
            message: `Depto ${target.unitNumber} no tiene gastos pendientes, por lo que no envie recordatorio.`,
            data: { unitId: target.unitId, unitNumber: target.unitNumber, residentId: target.residentId, pendingCount: 0 },
        };
    }

    const pendingAmount = rows.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const expenseIds = rows.map(row => String(row.id || '')).filter(Boolean).join(',');
    const customMessage = cleanText(action.args.message, 500);
    const body = customMessage
        ? `${customMessage}\n\nSaldo pendiente registrado: $${pendingAmount.toLocaleString('es-CL')} en ${rows.length} gasto(s).`
        : `Tu unidad ${target.unitNumber} registra ${rows.length} gasto(s) comun(es) pendiente(s) por $${pendingAmount.toLocaleString('es-CL')}. Puedes revisarlos en Finanzas.`;
    const notification = {
        id: stableNotificationId('unit_payment_reminder', communityId, target.residentId, expenseIds),
        user_id: target.residentId,
        type: rows.some(row => row.status === 'overdue') ? 'alert' : 'warning',
        category: 'finance_collection',
        title: 'Recordatorio de gasto comun',
        body,
        link: '/resident/finances',
        community_id: communityId,
    };
    const { data: notificationRow, error: notificationError } = await admin
        .from('notifications')
        .upsert(notification, { onConflict: 'id' })
        .select('id')
        .single();
    if (notificationError) throw notificationError;

    return {
        entityType: 'notification',
        entityId: String(notificationRow.id),
        title: 'Recordatorio enviado',
        message: `Envie un recordatorio privado a Depto ${target.unitNumber} por $${pendingAmount.toLocaleString('es-CL')} pendiente(s).`,
        data: { notificationId: notificationRow.id, unitId: target.unitId, unitNumber: target.unitNumber, residentId: target.residentId, pendingCount: rows.length, pendingAmount },
    };
}