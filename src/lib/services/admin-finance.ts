/**
 * AdminFinanceService: finanzas visibles para administracion.
 *
 * Extraído de `src/lib/api.ts`, que reexporta estos servicios para no
 * romper a quienes los importan desde `@/lib/api`.
 * Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';
import type {
    CommunityFinance,
} from '../types';

type FinanceExpenseItemRow = {
    category?: string | null;
    label?: string | null;
    amount?: number | string | null;
};

type FinanceExpenseRow = {
    id: string;
    unit_id?: string | null;
    amount?: number | string | null;
    status?: string | null;
    month?: string | null;
    due_date?: string | null;
    paid_at?: string | null;
    items?: FinanceExpenseItemRow[] | null;
};

export const AdminFinanceService = {
    async getOverview(): Promise<CommunityFinance> {
        const [{ data, error }, unitsResult] = await Promise.all([
            supabase
                .from('expenses')
                .select('id,unit_id,amount,status,month,due_date,paid_at,items:expense_items(category,label,amount)')
                .order('month', { ascending: false })
                .limit(2500),
            supabase.from('units').select('id', { count: 'exact', head: true }),
        ]);
        if (error) throw error;
        if (unitsResult.error) throw unitsResult.error;

        const rows = (data || []) as FinanceExpenseRow[];
        const period = rows.map(row => row.month || '').filter(Boolean).sort((a, b) => b.localeCompare(a))[0]
            || new Date().toISOString().slice(0, 7);
        const periodRows = rows.filter(row => row.month === period);
        const amountOf = (row: FinanceExpenseRow) => Number(row.amount || 0);
        const totalBilled = periodRows.reduce((sum, row) => sum + amountOf(row), 0);
        const totalRevenue = periodRows.filter(row => row.status === 'paid').reduce((sum, row) => sum + amountOf(row), 0);
        const pendingAmount = periodRows.filter(row => row.status === 'pending').reduce((sum, row) => sum + amountOf(row), 0);
        const overdueAmount = periodRows.filter(row => row.status === 'overdue').reduce((sum, row) => sum + amountOf(row), 0);
        const billedUnitIds = new Set(periodRows.map(row => row.unit_id).filter((id): id is string => Boolean(id)));
        const pendingUnitIds = new Set(periodRows.filter(row => row.status !== 'paid').map(row => row.unit_id).filter((id): id is string => Boolean(id)));
        const paidUnitIds = new Set(periodRows.filter(row => row.status === 'paid').map(row => row.unit_id).filter((id): id is string => Boolean(id)));

        const overdueCounts = new Map<string, number>();
        rows.filter(row => row.status === 'overdue' && row.unit_id).forEach(row => {
            overdueCounts.set(row.unit_id!, (overdueCounts.get(row.unit_id!) || 0) + 1);
        });

        const monthTotals = new Map<string, number>();
        rows.forEach(row => {
            if (!row.month) return;
            monthTotals.set(row.month, (monthTotals.get(row.month) || 0) + amountOf(row));
        });
        const monthlyTrend = Array.from(monthTotals.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(-6)
            .map(([month, monto]) => ({
                month: new Date(`${month}-02T12:00:00`).toLocaleDateString('es-CL', { month: 'short' }),
                monto,
            }));

        const categoryLabels: Record<string, string> = {
            water: 'Agua',
            electricity: 'Electricidad',
            salaries: 'Remuneraciones',
            maintenance: 'Mantencion',
            security: 'Seguridad',
            other: 'Otros',
        };
        const categoryTotals = new Map<string, number>();
        let reserveFund = 0;
        periodRows.flatMap(row => row.items || []).forEach(item => {
            const rawCategory = item.category || 'other';
            const category = categoryLabels[rawCategory] || item.label || 'Otros';
            const amount = Number(item.amount || 0);
            categoryTotals.set(category, (categoryTotals.get(category) || 0) + amount);
            if ((item.label || '').toLocaleLowerCase('es-CL').includes('fondo')) reserveFund += amount;
        });

        const recentActivity = rows
            .filter(row => row.status === 'paid' && row.paid_at)
            .sort((a, b) => String(b.paid_at).localeCompare(String(a.paid_at)))
            .slice(0, 8)
            .map(row => ({
                id: row.id,
                type: 'income' as const,
                title: `Pago de gasto comun ${row.month || ''}`.trim(),
                amount: amountOf(row),
                date: row.paid_at!,
            }));

        return {
            period,
            totalRevenue,
            totalBilled,
            totalExpenses: totalBilled,
            reserveFund,
            pendingAmount,
            overdueAmount,
            collectionRate: totalBilled > 0 ? Math.round((totalRevenue / totalBilled) * 100) : 0,
            totalUnits: unitsResult.count || 0,
            billedUnits: billedUnitIds.size,
            paidUnits: paidUnitIds.size,
            pendingUnits: pendingUnitIds.size,
            chronicDebtors: Array.from(overdueCounts.values()).filter(count => count >= 3).length,
            monthlyTrend,
            categoryBreakdown: Array.from(categoryTotals.entries()).map(([name, value]) => ({ name, value })),
            recentActivity,
        };
    },
};
