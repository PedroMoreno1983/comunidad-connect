/**
 * Periodo y cobranza compartidos entre el home del admin y /admin/finanzas.
 * Ambos deben usar el último mes con cobros emitidos, no la suma histórica.
 */

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export type PeriodCollectionRow = {
    month?: string | null;
    amount?: number | string | null;
    status?: string | null;
};

export function currentBillingMonth(now = new Date()): string {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
}

export function resolveBillingPeriod(
    months: Array<string | null | undefined>,
    fallback = currentBillingMonth(),
): string {
    const values = months.filter((month): month is string => Boolean(month && MONTH_PATTERN.test(month)));
    if (values.length === 0) return fallback;
    return values.reduce((latest, month) => (month > latest ? month : latest));
}

export function periodCollectionStats(rows: PeriodCollectionRow[], period: string) {
    const periodRows = rows.filter(row => row.month === period);
    const amountOf = (row: PeriodCollectionRow) => Number(row.amount || 0);
    const totalBilled = periodRows.reduce((sum, row) => sum + amountOf(row), 0);
    const totalCollected = periodRows
        .filter(row => row.status === "paid")
        .reduce((sum, row) => sum + amountOf(row), 0);

    return {
        period,
        totalBilled,
        totalCollected,
        collectionRate: totalBilled > 0 ? Math.round((totalCollected / totalBilled) * 100) : 0,
        billedCount: periodRows.length,
        paidCount: periodRows.filter(row => row.status === "paid").length,
    };
}
