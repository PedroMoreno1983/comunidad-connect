/**
 * Lee la glosa de un abono y propone una sola unidad.
 *
 * Un número suelto solo cuenta si tiene al menos tres dígitos y pertenece a
 * una única unidad. «12» dentro de «1204», o «150» dentro de «150.000», no
 * eligen departamento. Si la glosa nombra dos unidades, o el mismo número
 * existe en dos torres, no hay propuesta.
 */

import type { DepositUnitCandidate, DepositOpenCharge, DepositMovement, DepositPaymentCandidate, DepositSuggestion } from '@/lib/types';
export type { DepositUnitCandidate } from '@/lib/types';
import { suggestMatches } from './reconciliation';

/** A named unit restricts every automatic match, including amount/date matches. */
export function suggestUnitMatches(movements: DepositMovement[], payments: DepositPaymentCandidate[], units: DepositUnitCandidate[]) {
    const reserved = new Set<string>();
    return [...movements].sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id)).flatMap(movement => {
        const text = `${movement.description} ${movement.reference || ''}`;
        const unit = matchUnitFromGlosa(text, units);
        if (!unit && /\b(departamento|depto|dpto|unidad|casa|torre|gc)\b/.test(normalizeGlosa(text))) return [];
        const result = suggestMatches(
            [{ id: movement.id, amount: movement.amount, date: movement.date || '', reference: movement.reference }],
            payments.filter(payment => !reserved.has(payment.id) && (!unit || payment.unitId === unit.id))
                .map(payment => ({ ...payment, paidAt: payment.paidAt || '' })),
        );
        for (const suggestion of result) reserved.add(suggestion.paymentId);
        return result;
    });
}

function moneyPattern() {
    return /\$?\s*\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?/g;
}

export function normalizeGlosa(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

export function depositUnitLabel(unit: Pick<DepositUnitCandidate, 'number' | 'tower'>): string {
    const tower = unit.tower.trim();
    const number = unit.number.trim();
    return tower && tower.toUpperCase() !== 'A' ? `${tower}-${number}` : number;
}

function sameNumber(stored: string, found: string): boolean {
    const left = stored.trim().toLowerCase();
    const right = found.trim().toLowerCase();
    if (left === right) return true;
    if (/^\d{1,6}$/.test(left) && /^\d{1,6}$/.test(right)) {
        return String(Number(left)) === String(Number(right));
    }
    return false;
}

function sameTower(stored: string, found: string): boolean {
    const left = normalizeGlosa(stored).replace(/[^a-z0-9]+/g, '');
    const right = normalizeGlosa(found).replace(/[^a-z0-9]+/g, '');
    if (!left || !right) return false;
    if (left === right) return true;
    return (left.endsWith(right) && right.length <= 2) || (right.endsWith(left) && left.length <= 2);
}

function isCalendarYear(value: string): boolean {
    return /^(19|20)\d{2}$/.test(value);
}

function resolvePool(pool: DepositUnitCandidate[], text: string, towerFromMatch: string): DepositUnitCandidate[] | null {
    if (towerFromMatch) {
        const filtered = pool.filter(unit => sameTower(unit.tower, towerFromMatch));
        if (filtered.length > 1) return null;
        return filtered;
    }
    if (pool.length <= 1) return pool;
    const hint = text.match(/\btorre\s+([a-z0-9]{1,2})\b/);
    if (!hint) return null;
    const filtered = pool.filter(unit => sameTower(unit.tower, hint[1]));
    return filtered.length === 1 ? filtered : null;
}

/** Devuelve la única unidad nombrada en el texto, o null si no hay una sola. */
export function matchUnitFromGlosa(text: string, units: DepositUnitCandidate[]): DepositUnitCandidate | null {
    const raw = normalizeGlosa(text).replace(moneyPattern(), ' ');
    const explicit = /\b(?:departamento|depto|dpto|unidad|casa|gasto comun|gc)\s*([a-z]{1,2})?\s*[-/]?\s*(\d{1,6})\b/g;
    const towerNumber = /\b([a-z])\s*[-/]\s*(\d{1,6})\b/g;
    const bareNumber = /\b(\d{3,6})\b/g;
    const hits = new Map<string, DepositUnitCandidate>();
    const rejectedNumbers = new Set<string>();

    const add = (pool: DepositUnitCandidate[] | null, number: string, towerFromMatch: string) => {
        if (pool === null) return 'ambiguous' as const;
        if (towerFromMatch && pool.length === 0) rejectedNumbers.add(number.replace(/^0+/, '') || '0');
        if (pool.length === 1) hits.set(pool[0].id, pool[0]);
        return 'ok' as const;
    };

    for (const match of raw.matchAll(explicit)) {
        const tower = match[1] ?? '';
        const number = match[2];
        const pool = units.filter(unit => sameNumber(unit.number, number));
        if (add(resolvePool(pool, raw, tower), number, tower) === 'ambiguous') return null;
    }

    for (const match of raw.matchAll(towerNumber)) {
        const pool = units.filter(unit => sameNumber(unit.number, match[2]));
        if (add(resolvePool(pool, raw, match[1]), match[2], match[1]) === 'ambiguous') return null;
    }

    for (const match of raw.matchAll(bareNumber)) {
        if (isCalendarYear(match[1])) continue;
        const bareKey = String(Number(match[1]));
        if (rejectedNumbers.has(bareKey)) continue;
        const pool = units.filter(unit => sameNumber(unit.number, match[1]));
        const resolved = resolvePool(pool, raw, '');
        if (resolved === null) {
            const alreadyNamed = pool.filter(unit => hits.has(unit.id));
            if (alreadyNamed.length === 1 && hits.size === 1) continue;
            return null;
        }
        add(resolved, match[1], '');
    }

    if (hits.size !== 1) return null;
    return [...hits.values()][0];
}

/** Solo preselecciona un mes cuando hay un único saldo que coincide. */
export function chooseOpenCharge(
    charges: DepositOpenCharge[],
    amount: number,
): { charge: DepositOpenCharge | null; amountMatches: boolean } {
    if (charges.length === 0) return { charge: null, amountMatches: false };
    const exact = charges.filter(charge => Math.round(charge.amount) === Math.round(amount));
    return { charge: exact.length === 1 ? exact[0] : null, amountMatches: exact.length === 1 };
}

/**
 * Propone unidad y mes para abonos que todavía no tienen un calce de pago.
 * Un pago ya registrado del mismo monto se cruza; no se crea otro.
 */
export function suggestDeposits(
    movements: DepositMovement[],
    units: DepositUnitCandidate[],
    charges: DepositOpenCharge[],
    payments: DepositPaymentCandidate[],
    skipTransactionIds: ReadonlySet<string>,
    reservedPaymentIds: ReadonlySet<string> = new Set(),
): DepositSuggestion[] {
    const usedPayments = new Set(reservedPaymentIds);
    const proposals: DepositSuggestion[] = [];

    const ordered = [...movements]
        .filter(movement => movement.amount > 0 && !skipTransactionIds.has(movement.id))
        .sort((left, right) => left.id.localeCompare(right.id));

    for (const movement of ordered) {
        const text = `${movement.description} ${movement.reference ?? ''}`;
        const unit = matchUnitFromGlosa(text, units);
        if (!unit) continue;
        // A candidate reserved by another proposal cannot become a second cash entry.
        if (payments.some(payment => payment.unitId === unit.id
            && Math.round(payment.amount) === Math.round(movement.amount)
            && usedPayments.has(payment.id))) continue;

        const sameAmount = payments.filter(payment => (
            payment.unitId === unit.id
            && Math.round(payment.amount) === Math.round(movement.amount)
            && !usedPayments.has(payment.id)
        ));
        if (sameAmount.length > 1) continue;

        if (sameAmount.length === 1) {
            const payment = sameAmount[0];
            if (movement.date && payment.paidAt && !suggestMatches(
                [{ id: movement.id, amount: movement.amount, date: movement.date, reference: movement.reference }],
                [{ id: payment.id, amount: payment.amount, paidAt: payment.paidAt, reference: payment.reference }],
            ).length) continue;
            usedPayments.add(sameAmount[0].id);
            proposals.push({
                kind: 'match',
                transactionId: movement.id,
                unitId: unit.id,
                unitLabel: depositUnitLabel(unit),
                paymentId: sameAmount[0].id,
                expenseId: null,
                month: null,
                amountMatchesCharge: false,
                openCharges: [],
            });
            continue;
        }

        const open = charges.filter(charge => charge.unitId === unit.id);
        const chosen = chooseOpenCharge(open, movement.amount);
        proposals.push({
            kind: 'record',
            transactionId: movement.id,
            unitId: unit.id,
            unitLabel: depositUnitLabel(unit),
            paymentId: null,
            expenseId: chosen.charge?.id ?? null,
            month: chosen.charge?.month ?? null,
            amountMatchesCharge: chosen.amountMatches,
            openCharges: open,
        });
    }

    return proposals;
}
