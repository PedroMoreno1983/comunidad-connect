/**
 * HomeService: resumen de la pantalla de inicio del residente.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    ResidentHomeSummary,
    User,
} from '../types';

function getAnnouncementCategory(priority: unknown): string {
    return priority === "alert" ? "Urgente" : "Aviso";
}

export const HomeService = {
    async getResidentSummary(user: Pick<User, "id" | "email" | "unitId" | "communityId">): Promise<ResidentHomeSummary> {

        let expensesQuery = supabase
            .from('expenses')
            .select('amount')
            .in('status', ['pending', 'overdue']);

        if (user.unitId) {
            expensesQuery = expensesQuery.eq('unit_id', user.unitId);
        }

        const today = new Date().toISOString().split('T')[0];
        const bookingsQuery = supabase
            .from('bookings')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date', today);

        let announcementsQuery = supabase
            .from('announcements')
            .select('title, content, priority, created_at')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (user.communityId) {
            announcementsQuery = announcementsQuery.eq('community_id', user.communityId);
        }

        const [expensesResult, bookingsResult, announcementResult] = await Promise.all([
            expensesQuery,
            bookingsQuery,
            announcementsQuery,
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        if (announcementResult.error) throw announcementResult.error;

        const expenses = (expensesResult.data || []) as Array<{ amount: number | string | null }>;
        const pendingExpensesAmount = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const announcement = announcementResult.data as Record<string, unknown> | null;

        return {
            pendingExpensesCount: expenses.length,
            pendingExpensesAmount,
            bookingsCount: bookingsResult.count || 0,
            recentAnnouncement: announcement ? {
                title: String(announcement.title || "Aviso de la comunidad"),
                content: String(announcement.content || ""),
                category: getAnnouncementCategory(announcement.priority),
                time: announcement.created_at
                    ? new Date(String(announcement.created_at)).toLocaleDateString('es-CL')
                    : "",
            } : null,
        };
    },
};
