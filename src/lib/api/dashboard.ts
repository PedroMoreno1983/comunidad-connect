import { supabase } from '../supabase';
import { periodCollectionStats, resolveBillingPeriod } from '@/lib/finance/periodCollection';
import { AdminDashboardSummary, ResidentHomeSummary, User } from '../types';
import type { ExpenseDatabaseRow } from '../types';
import { isUuid } from './_shared';
import { ResidentFinanceService } from './finance';
import { MaintenanceService } from './maintenance';

function getAnnouncementCategory(priority: unknown): string {
    return priority === "alert" ? "Urgente" : "Aviso";
}

export const HomeService = {
    async getResidentSummary(user: Pick<User, "id" | "email" | "unitId" | "communityId">): Promise<ResidentHomeSummary> {

        let expensesQuery = supabase
            .from('expenses')
            .select('id, amount')
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

        const [expensesResult, bookingsResult, announcementResult, statement] = await Promise.all([
            expensesQuery,
            bookingsQuery,
            announcementsQuery,
            ResidentFinanceService.getStatement(),
        ]);

        if (expensesResult.error) throw expensesResult.error;
        if (bookingsResult.error) throw bookingsResult.error;
        if (announcementResult.error) throw announcementResult.error;

        const balances = new Map(statement.expenseBalances.map(item => [item.expenseId, item.outstandingAmount]));
        const expenseRows = (expensesResult.data || []) as Pick<ExpenseDatabaseRow, 'id' | 'amount'>[];
        if (expenseRows.some(item => !balances.has(item.id))) throw new Error('No se pudo verificar el saldo de todos los cobros.');
        const expenses = expenseRows.filter(item => (balances.get(item.id) ?? 0) > 0);
        const pendingExpensesAmount = expenses.reduce((sum, item) => sum + (balances.get(item.id) || 0), 0);
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

// ==========================================
// Admin Dashboard API
// ==========================================

type AdminExpenseRow = {
    amount: number | string | null;
    status: string | null;
    month: string | null;
    items?: Array<{ label?: string | null; amount?: number | string | null }> | null;
};

type AdminProfileRow = { id: string; role: string | null };
type AdminUnitRow = { id: string };
type AdminBookingRow = { id: string; status: string | null; date: string | null };

const ADMIN_CATEGORY_COLORS = [
    "#9C5636",
    "#5F7A46",
    "#C99A4A",
    "#5C4868",
    "#2F6CB0",
    "#C24A3E",
];

function normalizeMonthLabel(month: string | null, fallbackIndex: number) {
    if (!month) return ["Ene", "Feb", "Mar", "Abr", "May", "Jun"][fallbackIndex] || "Mes";
    const date = new Date(`${month}-02T00:00:00`);
    if (Number.isNaN(date.getTime())) return month.slice(0, 3);
    return date.toLocaleDateString("es-CL", { month: "short" }).replace(".", "");
}

function emptyAdminDashboardSummary(): AdminDashboardSummary {
    return {
        residentsActive: 0,
        unitsTotal: 0,
        collectionRate: 0,
        collectionCollected: 0,
        collectionTarget: 0,
        openRequests: 0,
        criticalRequests: 0,
        quorumPct: 0,
        assetsOptimalPct: 0,
        cocoCasesOpen: 0,
        monthlyCollection: [],
        expenseCategories: [],
        amenityUsage: [],
        activeRequests: [],
    };
}

export const AdminDashboardService = {
    async getSummary(user: Pick<User, "communityId">): Promise<AdminDashboardSummary> {
        const summary = emptyAdminDashboardSummary();

        try {
            let profilesQuery = supabase.from("profiles").select("id, role");
            let unitsQuery = supabase.from("units").select("id");
            let expensesQuery = supabase
                .from("expenses")
                .select("amount, status, month, items:expense_items(label, amount)")
                .order("month", { ascending: false })
                .limit(2500);
            let bookingsQuery = supabase
                .from("bookings")
                .select("id, status, date")
                .order("date", { ascending: false })
                .limit(120);

            if (isUuid(user.communityId)) {
                profilesQuery = profilesQuery.eq("community_id", user.communityId);
                unitsQuery = unitsQuery.eq("community_id", user.communityId);
                expensesQuery = expensesQuery.eq("community_id", user.communityId);
                bookingsQuery = bookingsQuery.eq("community_id", user.communityId);
            }

            const [profilesRes, unitsRes, expensesRes, bookingsRes, maintenance] = await Promise.all([
                profilesQuery,
                unitsQuery,
                expensesQuery,
                bookingsQuery,
                MaintenanceService.getDashboardData().catch((error) => {
                    console.warn("[AdminDashboardService] maintenance summary unavailable:", error);
                    return null;
                }),
            ]);

            const profiles = profilesRes.error ? [] : ((profilesRes.data || []) as AdminProfileRow[]);
            const units = unitsRes.error ? [] : ((unitsRes.data || []) as AdminUnitRow[]);
            const expenses = expensesRes.error ? [] : ((expensesRes.data || []) as AdminExpenseRow[]);
            const bookings = bookingsRes.error ? [] : ((bookingsRes.data || []) as AdminBookingRow[]);

            const residentsActive = profiles.filter(profile => profile.role === "resident").length;
            const unitsTotal = units.length;
            const period = resolveBillingPeriod(expenses.map(expense => expense.month));
            const collection = periodCollectionStats(expenses, period);
            const collectionTarget = collection.totalBilled;
            const collectionCollected = collection.totalCollected;
            const collectionRate = collection.collectionRate;

            const byMonth = new Map<string, { collected: number; target: number }>();
            expenses.forEach((expense) => {
                const month = expense.month || "Actual";
                const current = byMonth.get(month) || { collected: 0, target: 0 };
                const amount = Number(expense.amount || 0);
                current.target += amount;
                if (expense.status === "paid") current.collected += amount;
                byMonth.set(month, current);
            });
            const monthlyCollection = Array.from(byMonth.entries())
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(-6)
                .map(([month, values], index) => ({
                    label: normalizeMonthLabel(month, index),
                    collected: values.collected,
                    target: Math.max(values.target, 1),
                }));

            const categoryTotals = new Map<string, number>();
            expenses.forEach((expense) => {
                (expense.items || []).forEach((item) => {
                    const label = item.label || "Gasto común";
                    categoryTotals.set(label, (categoryTotals.get(label) || 0) + Number(item.amount || 0));
                });
            });
            const expenseCategories = Array.from(categoryTotals.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 6)
                .map(([label, amount], index) => ({
                    label,
                    amount,
                    color: ADMIN_CATEGORY_COLORS[index % ADMIN_CATEGORY_COLORS.length],
                }));

            const openServiceRequests = maintenance?.serviceRequests.filter(item => item.status !== "completed" && item.status !== "cancelled") || [];
            const criticalRequests = maintenance?.cases.filter(item => item.urgency === "emergencia").length || 0;
            const assets = maintenance?.assets || [];
            const optimalAssets = assets.filter(asset => asset.healthStatus === "optimal").length;
            const assetsOptimalPct = assets.length > 0 ? Math.round((optimalAssets / assets.length) * 100) : 0;
            const cocoCasesOpen = maintenance?.cases.filter(item => item.status !== "closed").length || 0;

            const activeRequests = openServiceRequests.slice(0, 5).map((request) => ({
                title: request.service_providers?.name || "Solicitud operativa",
                detail: request.description,
                status: request.status,
                tone: request.status === "pending" ? "amber" as const : "sage" as const,
            }));

            const activeBookings = bookings.filter(booking => booking.status !== "cancelled").length;
            const amenityUsage = [
                { label: "Reservas", collected: activeBookings, target: Math.max(activeBookings + 6, 10) },
                { label: "Uso semanal", collected: Math.min(activeBookings * 2, 24), target: 24 },
                { label: "Capacidad", collected: Math.min(unitsTotal, 100), target: Math.max(unitsTotal, 100) },
            ];

            return {
                residentsActive,
                unitsTotal,
                collectionRate,
                collectionCollected,
                collectionTarget,
                openRequests: openServiceRequests.length,
                criticalRequests,
                quorumPct: unitsTotal > 0 ? Math.round((residentsActive / unitsTotal) * 100) : 0,
                assetsOptimalPct,
                cocoCasesOpen,
                monthlyCollection,
                expenseCategories,
                amenityUsage,
                activeRequests,
            };
        } catch (error) {
            console.warn("[AdminDashboardService] summary unavailable:", error);
            return summary;
        }
    },
};

// ==========================================
// Maintenance / Admin API
// ==========================================
