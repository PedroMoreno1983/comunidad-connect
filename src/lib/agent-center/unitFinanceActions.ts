import { createHash } from 'node:crypto';
import type { AgentAction, AgentProfile } from '@/lib/agent-center/domain';
import { resolveResidentExpenseTarget } from '@/lib/agent-center/financeQueries';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { sendWhatsAppNotificationForUser, type WhatsAppNotificationResult } from '@/lib/server/whatsappNotify';

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

function describeWhatsAppResult(result: WhatsAppNotificationResult | null) {
    if (!result) return 'WhatsApp no se intento.';
    if (result.status === 'sent') return 'WhatsApp enviado al residente.';
    if (result.status === 'queued') return 'Twilio acepto el WhatsApp; la entrega queda pendiente de confirmacion.';
    if (result.status === 'failed') return `No pude enviar WhatsApp: ${result.reason || 'error de proveedor'}.`;
    if (result.reason === 'twilio_not_configured') return 'WhatsApp esta pendiente: Twilio no esta configurado.';
    if (result.reason === 'resident_without_whatsapp_opt_in') return 'WhatsApp omitido: el residente no tiene opt-in activo.';
    if (result.reason === 'resident_without_phone_number') return 'WhatsApp omitido: el residente no tiene telefono registrado.';
    return `WhatsApp omitido: ${result.reason || 'sin detalle'}.`;
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
    let whatsappResult: WhatsAppNotificationResult | null = null;
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
        whatsappResult = await sendWhatsAppNotificationForUser({
            userId: target.residentId,
            title: notification.title,
            body: notification.body,
            type: 'warning',
            communityId,
            actorId: profile.id,
            templateKey: 'payment_reminder',
            templateVariables: { '1': target.unitNumber, '2': `$${amount.toLocaleString('es-CL')} CLP` },
            metadata: { source: 'agent-center.create_unit_expense', notificationId, expenseId: String(expense.id) },
        });
    }

    const recipientText = target.residentId ? 'y notifique al residente vinculado' : 'pero no hay residente vinculado para notificar';
    const whatsappText = target.residentId ? ` ${describeWhatsAppResult(whatsappResult)}` : '';
    return {
        entityType: 'expense',
        entityId: String(expense.id),
        title: 'Cobro creado',
        message: `Cree un cobro pendiente para Depto ${target.unitNumber} por $${amount.toLocaleString('es-CL')} (${month}) ${recipientText}.${whatsappText}`,
        data: { expense, notificationId, whatsapp: whatsappResult, unitId: target.unitId, unitNumber: target.unitNumber, residentId: target.residentId },
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
    const notificationType = rows.some(row => row.status === 'overdue') ? 'alert' : 'warning';
    const notification = {
        id: stableNotificationId('unit_payment_reminder', communityId, target.residentId, expenseIds),
        user_id: target.residentId,
        type: notificationType,
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

    const whatsappResult = await sendWhatsAppNotificationForUser({
        userId: target.residentId,
        title: notification.title,
        body: notification.body,
        type: notificationType,
        communityId,
        actorId: profile.id,
        templateKey: 'payment_reminder',
        templateVariables: { '1': target.unitNumber, '2': `$${pendingAmount.toLocaleString('es-CL')} CLP` },
        metadata: { source: 'agent-center.send_unit_payment_reminder', notificationId: String(notificationRow.id), expenseIds },
    });

    return {
        entityType: 'notification',
        entityId: String(notificationRow.id),
        title: whatsappResult.status === 'sent'
            ? 'Recordatorio enviado por WhatsApp'
            : whatsappResult.status === 'queued'
                ? 'Recordatorio aceptado por Twilio'
                : 'Recordatorio registrado',
        message: `Envie un recordatorio privado a Depto ${target.unitNumber} por $${pendingAmount.toLocaleString('es-CL')} pendiente(s). ${describeWhatsAppResult(whatsappResult)}`,
        data: { notificationId: notificationRow.id, whatsapp: whatsappResult, unitId: target.unitId, unitNumber: target.unitNumber, residentId: target.residentId, pendingCount: rows.length, pendingAmount },
    };
}