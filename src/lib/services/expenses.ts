/**
 * Gastos comunes: vista del residente y listado administrativo de cuotas.
 *
 * Extraído de `src/lib/api.ts` y de `src/lib/services/supabaseServices.ts`.
 * Se importa desde `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';

export type ResidentExpenseStatus = 'paid' | 'pending' | 'overdue' | string;

export type ResidentExpenseItem = {
    label: string;
    amount: number;
};

/** Vista del residente para un gasto común; no es el mismo modelo que `ExpenseRecord`. */
export type ResidentExpense = {
    id: string;
    unitId: string;
    month: string;
    amount: number;
    status: ResidentExpenseStatus;
    dueDate: string;
    paidAt?: string | null;
    paymentAmount?: number | null;
    breakdown?: ResidentExpenseItem[];
};

export type ExpenseItemRow = {
    label?: string | null;
    amount?: number | string | null;
};

export type SupabaseExpenseRow = {
    id: string;
    unit_id?: string | null;
    month?: string | null;
    amount?: number | string | null;
    status?: ResidentExpenseStatus | null;
    due_date?: string | null;
    paid_at?: string | null;
    payment_metadata?: { amount?: number | string | null } | null;
    items?: ExpenseItemRow[] | null;
};

export function mapExpenseRow(expense: SupabaseExpenseRow): ResidentExpense {
    return {
        id: expense.id,
        unitId: expense.unit_id || "",
        month: expense.month || new Date().toISOString().slice(0, 7),
        amount: Number(expense.amount || 0),
        status: expense.status || "pending",
        dueDate: expense.due_date || new Date().toISOString(),
        paidAt: expense.paid_at || null,
        paymentAmount: expense.payment_metadata?.amount != null ? Number(expense.payment_metadata.amount) : null,
        breakdown: (expense.items || []).map(item => ({
            label: item.label || "Concepto",
            amount: Number(item.amount || 0),
        })),
    };
}

// ==========================================
// EXPENSES (GASTOS COMUNES)
// ==========================================
export const ExpensesService = {
    // Fetch expenses for a specific unit, automatically joining items
    async getExpenses(unitId: string): Promise<ResidentExpense[]> {
        const { data, error } = await supabase
            .from('expenses')
            .select(`
                *,
                items:expense_items(*)
            `)
            .eq('unit_id', unitId)
            .order('month', { ascending: false });

        if (error) {
            console.error("Error fetching expenses:", error);
            throw error;
        }

        return ((data || []) as SupabaseExpenseRow[]).map(mapExpenseRow);
    }
};

export const CondoFeeService = {
    async getAll() {
        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .order('month', { ascending: false });

        if (error) throw error;

        const expenses = data || [];
        const unitIds = Array.from(new Set(expenses.map((expense: { unit_id?: string }) => expense.unit_id).filter(Boolean)));

        if (unitIds.length === 0) {
            return expenses.map((expense: { unit_id?: string }) => ({
                ...expense,
                units: {
                    number: expense.unit_id || 'Sin unidad',
                    tower: 'A',
                },
            }));
        }

        const { data: units, error: unitsError } = await supabase
            .from('units')
            .select('id, number, unit_number, tower')
            .in('id', unitIds);

        if (unitsError) {
            console.warn('[CondoFeeService] Units lookup unavailable, using unit ids as labels:', unitsError.message || unitsError);
        }

        type UnitLookup = { id: string; number?: string; unit_number?: string; tower?: string };
        const unitsById = new Map<string, UnitLookup>(
            ((units || []) as UnitLookup[]).map(unit => [unit.id, unit])
        );

        return expenses.map((expense: { unit_id?: string }) => {
            const unit = expense.unit_id ? unitsById.get(expense.unit_id) : null;
            return {
                ...expense,
                units: {
                    number: unit?.number || unit?.unit_number || expense.unit_id || 'Sin unidad',
                    tower: unit?.tower || 'A',
                },
            };
        });
    },

    async markAsPaid(expenseId: string) {
        const { error } = await supabase
            .from('expenses')
            .update({
                status: 'paid',
                paid_at: new Date().toISOString(),
            })
            .eq('id', expenseId);

        if (error) throw error;
    }
};
