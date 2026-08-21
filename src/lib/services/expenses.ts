/**
 * Gastos comunes: vista del residente y listado administrativo de cuotas.
 *
 * Extraído de `src/lib/api.ts` y de `src/lib/services/supabaseServices.ts`.
 * Se importa desde `@/lib/api`. Ver docs/deuda-arquitectonica.md.
 */

import { supabase } from '../supabase';

// ==========================================
// EXPENSES (GASTOS COMUNES)
// ==========================================
export const ExpensesService = {
    // Fetch expenses for a specific unit, automatically joining items
    async getExpenses(unitId: string) {
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

        return data;
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
