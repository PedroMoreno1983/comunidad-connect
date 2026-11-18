import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { stableNotificationId } from '@/lib/agent-center/utils';
import { formatFinanceDate, todayInChile } from '@/lib/finance/chileDates';
import { UTILITY_SERVICE_LABELS, daysBetween, findUtilityProvider, isUtilityService, nextDueDate } from './providers';

/** Días antes del vencimiento en que se avisa. 0: el mismo día. */
const NOTICE_DAYS = [3, 0] as const;

export interface UtilityReminderAccount {
    id: string;
    userId: string;
    communityId: string;
    service: string;
    provider: string;
    dueDay: number;
    lastPaidPeriod: string | null;
}

/**
 * Qué avisos corresponden hoy. Una cuenta marcada como pagada en el mes del
 * vencimiento no recibe aviso. El id del aviso es estable por cuenta, fecha de
 * vencimiento y tipo, así que correr el cron dos veces no duplica nada.
 */
export function buildUtilityReminders(accounts: UtilityReminderAccount[], today: string) {
    return accounts.flatMap(account => {
        const dueDate = nextDueDate(account.dueDay, today);
        const days = daysBetween(today, dueDate);
        if (!(NOTICE_DAYS as readonly number[]).includes(days)) return [];
        if (account.lastPaidPeriod === dueDate.slice(0, 7)) return [];
        const provider = findUtilityProvider(account.provider);
        const service = isUtilityService(account.service) ? UTILITY_SERVICE_LABELS[account.service].toLowerCase() : 'servicio';
        const name = provider?.name ?? account.provider;
        return [{
            id: stableNotificationId('utility', 'due', account.id, dueDate, String(days)),
            user_id: account.userId,
            community_id: account.communityId,
            type: days === 0 ? 'warning' : 'info',
            category: 'utility_due',
            title: days === 0 ? `Hoy vence tu cuenta de ${service}` : `Tu cuenta de ${service} vence en ${days} días`,
            body: `${name} · vence el ${formatFinanceDate(dueDate)}. Si ya pagaste, márcala como pagada en Mis servicios.`,
            link: '/resident/servicios',
        }];
    });
}

/** Cron diario: avisa en la app (y por push si hay teléfono registrado) los vencimientos de luz, agua y gas. */
export async function sendUtilityReminders(now = new Date()) {
    const admin = getSupabaseAdmin();
    const today = todayInChile(now);
    const { data, error } = await admin.from('resident_utility_accounts')
        .select('id, user_id, service, provider, due_day, last_paid_period, profiles!inner(community_id)')
        .eq('reminders_enabled', true).not('due_day', 'is', null);
    if (error) throw error;

    type Row = { id: string; user_id: string; service: string; provider: string; due_day: number; last_paid_period: string | null;
        profiles: { community_id: string | null } | { community_id: string | null }[] | null };
    const accounts: UtilityReminderAccount[] = ((data ?? []) as unknown as Row[]).flatMap(row => {
        const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
        if (!profile?.community_id) return [];
        return [{ id: row.id, userId: row.user_id, communityId: profile.community_id, service: row.service,
            provider: row.provider, dueDay: row.due_day, lastPaidPeriod: row.last_paid_period }];
    });

    const notifications = buildUtilityReminders(accounts, today);
    for (let index = 0; index < notifications.length; index += 500) {
        const { error: insertError } = await admin.from('notifications')
            .upsert(notifications.slice(index, index + 500), { onConflict: 'id', ignoreDuplicates: true });
        if (insertError) throw insertError;
    }
    return { today, accounts: accounts.length, notified: notifications.length };
}
