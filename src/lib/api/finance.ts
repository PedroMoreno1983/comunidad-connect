import { supabase } from '../supabase';
import type { FinanceCommitteeMember, FinanceCommitteeReview, FinanceCommitteeResidentOption } from '../types';
import { periodCollectionStats, resolveBillingPeriod } from '@/lib/finance/periodCollection';
import { CommunityFinance, ResidentFinanceExpense, UnitStatement, User } from '../types';
import type {
    CommunityEmployeeRecord,
    ExpenseDatabaseRow,
    FinanceUnitOption,
    FinancialStatements,
    JournalView,
    PaymentAgreement,
    PayrollEmployeeInput,
    PayrollRunRecord,
    PayrollSettings,
} from '../types';
import { financeWrite, isUuid, readApi } from './_shared';

export const FinanceCommitteeService = {
    async getAssignedAgreements(): Promise<PaymentAgreement[]> {
        const response = await fetch('/api/finance/agreement-review', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar los convenios.');
        return data.agreements;
    },
    async decideAgreement(agreementId: string, decision: 'approved' | 'rejected', note: string): Promise<void> {
        const response = await fetch('/api/finance/agreement-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agreementId, decision, note }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo guardar la decisión.');
    },
    async getMembers(): Promise<{ members: FinanceCommitteeMember[]; residents: FinanceCommitteeResidentOption[] }> {
        const response = await fetch('/api/admin/finance-committee', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el comité.');
        return data;
    },
    async appoint(residentId: string): Promise<void> {
        const response = await fetch('/api/admin/finance-committee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ residentId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo designar al integrante.');
    },
    async endMembership(membershipId: string): Promise<void> {
        const response = await fetch('/api/admin/finance-committee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'end', membershipId }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo terminar la designación.');
    },
    async getAdmin(month: string): Promise<{ reviewers: FinanceCommitteeResidentOption[]; review: FinanceCommitteeReview | null }> {
        const response = await fetch(`/api/admin/billing-review?month=${encodeURIComponent(month)}`, { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar la revisión.');
        return data;
    },
    async request(input: { month: string; dueDate: string; reviewerId: string; quotaAmount?: number; quotaMethod: 'share' | 'equal' }): Promise<{ review: FinanceCommitteeReview; warnings: string[] }> {
        const response = await fetch('/api/admin/billing-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo solicitar la revisión.');
        return data;
    },
    async getAssigned(): Promise<FinanceCommitteeReview[]> {
        const response = await fetch('/api/finance/committee-review', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudieron cargar las revisiones.');
        return data.reviews;
    },
    async decide(reviewId: string, decision: 'approved' | 'rejected', note: string): Promise<{ review: FinanceCommitteeReview; warnings: string[] }> {
        const response = await fetch('/api/finance/committee-review', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId, decision, note }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo guardar la decisión.');
        return data;
    },
};

export const ExpensesService = {
    // Fetch expenses for a specific unit, automatically joining items
    async getExpenses(unitId: string): Promise<ExpenseDatabaseRow[]> {
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

        return (data || []) as ExpenseDatabaseRow[];
    }
};

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
    async getOverview(communityId?: string): Promise<CommunityFinance> {
        let expensesQuery = supabase
            .from('expenses')
            .select('id,unit_id,amount,status,month,due_date,paid_at,items:expense_items(category,label,amount)')
            .order('month', { ascending: false })
            .limit(2500);
        let unitsQuery = supabase.from('units').select('id', { count: 'exact', head: true });
        if (isUuid(communityId)) {
            expensesQuery = expensesQuery.eq('community_id', communityId);
            unitsQuery = unitsQuery.eq('community_id', communityId);
        }

        const [{ data, error }, unitsResult] = await Promise.all([
            expensesQuery,
            unitsQuery,
        ]);
        if (error) throw error;
        if (unitsResult.error) throw unitsResult.error;

        const rows = (data || []) as FinanceExpenseRow[];
        const period = resolveBillingPeriod(rows.map(row => row.month));
        const collection = periodCollectionStats(rows, period);
        const periodRows = rows.filter(row => row.month === period);
        const amountOf = (row: FinanceExpenseRow) => Number(row.amount || 0);
        const totalBilled = collection.totalBilled;
        const totalRevenue = collection.totalCollected;
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
            collectionRate: collection.collectionRate,
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

    getPaymentAgreements() {
        return readApi<{ agreements: PaymentAgreement[]; units: FinanceUnitOption[]; reviewers: FinanceCommitteeResidentOption[] }>(
            '/api/admin/agreements',
            'No se pudieron cargar los convenios.',
        );
    },

    createPaymentAgreement(input: {
        unitId: string;
        title: string;
        totalAmount: number;
        installmentCount: number;
        startDate: string;
        notes: string;
        reviewerId?: string;
    }) {
        return readApi<{ agreement: PaymentAgreement }>(
            '/api/admin/agreements',
            'No se pudo abrir el convenio.',
            financeWrite(input),
        );
    },

    payAgreementInstallment(input: { installmentId: string; paidAt: string; method: string; reference: string }) {
        return readApi<{ paymentId: string; warnings: string[] }>(
            '/api/admin/agreements',
            'No se pudo registrar la cuota.',
            financeWrite({ action: 'pay', ...input }),
        );
    },

    cancelPaymentAgreement(agreementId: string) {
        return readApi<{ id: string }>(
            '/api/admin/agreements',
            'No se pudo cerrar el convenio.',
            financeWrite({ action: 'cancel', agreementId }),
        );
    },

    getPayroll() {
        return readApi<{ employees: CommunityEmployeeRecord[]; runs: PayrollRunRecord[]; afps: string[]; indicatorsMonth: string | null; settings: PayrollSettings }>(
            '/api/admin/payroll',
            'No se pudo cargar la remuneración.',
        );
    },

    saveEmployee(input: PayrollEmployeeInput) {
        return readApi<{ employee: CommunityEmployeeRecord }>(
            '/api/admin/payroll',
            'No se pudo guardar a la persona.',
            financeWrite(input),
        );
    },

    savePayrollSettings(input: PayrollSettings) {
        return readApi<{ settings: PayrollSettings }>(
            '/api/admin/payroll',
            'No se pudieron guardar los datos previsionales.',
            financeWrite({ action: 'settings', ...input }),
        );
    },

    createPayrollRun(month: string) {
        return readApi<{ run: { id: string; month: string; total: number; indicatorsMonth: string | null } }>(
            '/api/admin/payroll',
            'No se pudo armar la liquidación.',
            financeWrite({ action: 'run', month }),
        );
    },

    payPayrollRun(input: { runId: string; paidAt: string; reference: string }) {
        return readApi<{ id: string; expenseNote: string }>(
            '/api/admin/payroll',
            'No se pudo registrar el pago de remuneraciones.',
            financeWrite({ action: 'pay', ...input }),
        );
    },

    getJournal() {
        return readApi<JournalView>('/api/admin/journal', 'No se pudo cargar el libro diario.');
    },

    postJournalEntry(input: { entryDate: string; memo: string; lines: Array<{ code: string; debit: number; credit: number }> }) {
        return readApi<{ entry: { id: string; total: number } }>(
            '/api/admin/journal',
            'No se pudo guardar el asiento.',
            financeWrite(input),
        );
    },

    getFinancialStatements(input: { year: number; cutoffMonth: string; openingCash: number }) {
        const params = new URLSearchParams({
            year: String(input.year),
            cutoffMonth: input.cutoffMonth,
            openingCash: String(input.openingCash),
        });
        return readApi<FinancialStatements>(
            `/api/admin/financial-statements?${params.toString()}`,
            'No se pudieron cargar los estados financieros.',
        );
    },
    closeFinancialPeriod(input: { month: string; openingCash: number }) {
        return readApi<FinancialStatements>(
            '/api/admin/financial-statements', 'No se pudo guardar el corte.', financeWrite(input),
        );
    },
};

export const ResidentFinanceService = {
    async getExpensesForResident(user: Pick<User, "id" | "unitId" | "unitName">): Promise<ResidentFinanceExpense[]> {
        let targetUnitId = user.unitId;

        if (!targetUnitId) {
            const { data: profile, error } = await supabase
                .from('profiles')
                .select('unit_id')
                .eq('id', user.id)
                .maybeSingle();

            if (error) throw error;
            targetUnitId = typeof profile?.unit_id === "string" ? profile.unit_id : undefined;
        }

        if (!targetUnitId) return [];

        const { data, error } = await supabase
            .from('expenses')
            .select('*')
            .eq('unit_id', targetUnitId)
            .order('month', { ascending: false });

        if (error) throw error;

        const fallbackUnitNumber = user.unitName?.replace(/^Depto\s+/i, "") || targetUnitId;
        return ((data || []) as Array<Record<string, unknown>>).map(row => ({
            id: String(row.id),
            unit_id: String(row.unit_id || targetUnitId),
            month: String(row.month || new Date().toISOString().slice(0, 7)),
            amount: Number(row.amount || 0),
            status: (String(row.status || "pending") as ResidentFinanceExpense["status"]),
            due_date: String(row.due_date || new Date().toISOString()),
            paid_at: typeof row.paid_at === "string" ? row.paid_at : undefined,
            units: { number: fallbackUnitNumber },
        }));
    },

    async getStatement(): Promise<UnitStatement> {
        const data = await readApi<UnitStatement & { scope?: string }>(
            '/api/finance/statement',
            'No se pudo cargar la cartola.',
        );
        return {
            unitLabel: data.unitLabel,
            entries: data.entries || [],
            balance: data.balance,
            overdueAmount: data.overdueAmount,
            totalCharged: data.totalCharged,
            totalPaid: data.totalPaid,
            expenseBalances: data.expenseBalances || [],
            chargeBalances: data.chargeBalances || [],
            availableCredit: data.availableCredit || 0,
        };
    },

    async reportTransfer(input: { amount: number; paidAt: string; reference: string; expenseId: string }) {
        return readApi<{ reported: true; notified: number }>(
            '/api/finance/transfer-report',
            'No se pudo informar la transferencia.',
            financeWrite(input),
        );
    },

    async getAgreements(): Promise<PaymentAgreement[]> {
        const data = await readApi<{ agreements: PaymentAgreement[] }>(
            '/api/resident/agreements',
            'No se pudieron cargar los convenios.',
        );
        return data.agreements || [];
    },
};

// ==========================================
// FEED / ANUNCIOS (ANNOUNCEMENTS)
// ==========================================
