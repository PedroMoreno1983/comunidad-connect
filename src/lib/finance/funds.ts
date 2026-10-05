/**
 * Fondos de la comunidad sobre la tabla única reserve_fund_movements.
 *
 * El fondo legal (Ley 21.442) no lleva prefijo. Los demás se distinguen con
 * `[nombre] ` al inicio del label, sin tabla nueva. El aporte automático de
 * cada emisión sigue yendo solo al fondo de reserva.
 */

export const LEGAL_RESERVE_FUND = 'reserva';

const PREFIX = /^\[([^\]]{1,40})\]\s*/;

export function normalizeFundName(value: string | null | undefined): string {
    const name = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
    if (!name || name === LEGAL_RESERVE_FUND || name === 'fondo de reserva' || name === 'reserva legal') {
        return LEGAL_RESERVE_FUND;
    }
    return name;
}

export function parseFundLabel(label: string): { fundName: string; description: string } {
    const trimmed = label.trim();
    const match = trimmed.match(PREFIX);
    if (!match) return { fundName: LEGAL_RESERVE_FUND, description: trimmed };
    const fundName = normalizeFundName(match[1]);
    const description = trimmed.slice(match[0].length).trim() || match[1].trim();
    return { fundName, description };
}

export function formatFundLabel(fundName: string, description: string): string {
    const name = normalizeFundName(fundName);
    const text = description.trim();
    if (!text) return '';
    return name === LEGAL_RESERVE_FUND ? text : `[${name}] ${text}`;
}

export interface FundTotals {
    name: string;
    balance: number;
    totalContributions: number;
    totalWithdrawals: number;
}

export function groupFundMovements(
    movements: Array<{ kind: string; amount: number; label: string }>,
): FundTotals[] {
    const byName = new Map<string, FundTotals>();
    for (const row of movements) {
        const { fundName } = parseFundLabel(row.label);
        const current = byName.get(fundName) ?? {
            name: fundName,
            balance: 0,
            totalContributions: 0,
            totalWithdrawals: 0,
        };
        const amount = Math.round(Number(row.amount) || 0);
        if (row.kind === 'withdrawal') {
            current.totalWithdrawals += amount;
            current.balance -= amount;
        } else {
            current.totalContributions += amount;
            current.balance += amount;
        }
        byName.set(fundName, current);
    }
    const legal = byName.get(LEGAL_RESERVE_FUND);
    const rest = [...byName.values()]
        .filter(fund => fund.name !== LEGAL_RESERVE_FUND)
        .sort((left, right) => left.name.localeCompare(right.name, 'es'));
    return legal ? [legal, ...rest] : rest;
}
