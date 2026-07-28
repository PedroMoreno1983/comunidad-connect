/**
 * reconciliation.ts — Lógica pura de conciliación bancaria.
 *
 * Empareja movimientos de la cartola del banco con los pagos que el administrador
 * ya registró. La regla es deliberadamente conservadora: solo sugiere un match
 * cuando el monto es idéntico y la fecha está dentro de una ventana corta, y
 * NUNCA sugiere un emparejamiento ambiguo (dos candidatos igual de buenos). Un
 * match equivocado mueve plata a la unidad equivocada, así que ante la duda se
 * deja pendiente para que lo resuelva una persona.
 *
 * Sin acceso a base de datos: recibe listas y devuelve sugerencias, para poder
 * testear el criterio de forma exhaustiva.
 */

export interface BankMovement {
    id: string;
    /** Positivo = ingreso. Solo los ingresos se concilian contra pagos. */
    amount: number;
    /** AAAA-MM-DD */
    date: string;
    reference?: string | null;
}

export interface RecordedPayment {
    id: string;
    amount: number;
    /** AAAA-MM-DD */
    paidAt: string;
    reference?: string | null;
}

export interface MatchSuggestion {
    transactionId: string;
    paymentId: string;
    /** Días de diferencia entre el movimiento y el pago (0 = mismo día). */
    dayGap: number;
    /** true cuando además coincide la referencia, no solo el monto y la fecha. */
    referenceMatch: boolean;
}

/** Días absolutos entre dos fechas AAAA-MM-DD. NaN si alguna no parsea. */
export function dayGap(dateA: string, dateB: string): number {
    const a = Date.parse(`${dateA}T00:00:00Z`);
    const b = Date.parse(`${dateB}T00:00:00Z`);
    if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
    return Math.abs(Math.round((a - b) / 86_400_000));
}

function normalizeReference(value?: string | null): string {
    return String(value ?? '').trim().toLowerCase().replace(/[\s.-]/g, '');
}

/**
 * Sugiere emparejamientos uno-a-uno entre movimientos de ingreso y pagos.
 *
 * @param windowDays ventana máxima de días entre movimiento y pago (default 5).
 *
 * Criterio: mismo monto exacto y |fecha| <= ventana. Si la referencia coincide,
 * el match se acepta aunque la fecha esté fuera de ventana (una referencia igual
 * es evidencia más fuerte que la cercanía de fecha). Se prioriza por: referencia
 * coincidente, luego menor diferencia de días. Un movimiento o un pago se usan
 * a lo más una vez. Si un movimiento tiene dos candidatos igual de buenos
 * (misma prioridad), NO se sugiere: la ambigüedad la resuelve una persona.
 */
export function suggestMatches(
    transactions: BankMovement[],
    payments: RecordedPayment[],
    windowDays = 5,
): MatchSuggestion[] {
    const usedPayments = new Set<string>();
    const suggestions: MatchSuggestion[] = [];

    // Solo ingresos, y en orden estable (fecha, luego id) para determinismo.
    const inflows = transactions
        .filter(txn => txn.amount > 0)
        .sort((left, right) => left.date.localeCompare(right.date) || left.id.localeCompare(right.id));

    for (const txn of inflows) {
        const candidates = payments
            .filter(payment => !usedPayments.has(payment.id))
            .filter(payment => Math.round(payment.amount) === Math.round(txn.amount))
            .map(payment => {
                const gap = dayGap(txn.date, payment.paidAt);
                const refMatch = normalizeReference(txn.reference) !== ''
                    && normalizeReference(txn.reference) === normalizeReference(payment.reference);
                return { payment, gap, refMatch };
            })
            .filter(candidate => candidate.refMatch || (Number.isFinite(candidate.gap) && candidate.gap <= windowDays));

        if (candidates.length === 0) continue;

        // Mejor candidato: primero por referencia, luego por menor diferencia de días.
        candidates.sort((left, right) => {
            if (left.refMatch !== right.refMatch) return left.refMatch ? -1 : 1;
            return left.gap - right.gap;
        });

        const best = candidates[0];
        const runnerUp = candidates[1];

        // Empate real (misma referencia-match y misma diferencia de días): ambiguo.
        if (runnerUp && runnerUp.refMatch === best.refMatch && runnerUp.gap === best.gap) {
            continue;
        }

        usedPayments.add(best.payment.id);
        suggestions.push({
            transactionId: txn.id,
            paymentId: best.payment.id,
            dayGap: Number.isFinite(best.gap) ? best.gap : -1,
            referenceMatch: best.refMatch,
        });
    }

    return suggestions;
}

export interface ReconciliationSummary {
    totalTransactions: number;
    matched: number;
    pending: number;
    ignored: number;
    /** Ingresos del banco sin pago registrado que los explique. */
    unexplainedDeposits: number;
    /** Suma de los ingresos pendientes de conciliar. */
    pendingInflowAmount: number;
}

export function summarize(
    transactions: Array<{ amount: number; status: string }>,
): ReconciliationSummary {
    let matched = 0;
    let pending = 0;
    let ignored = 0;
    let unexplainedDeposits = 0;
    let pendingInflowAmount = 0;

    for (const txn of transactions) {
        if (txn.status === 'matched') matched += 1;
        else if (txn.status === 'ignored') ignored += 1;
        else {
            pending += 1;
            if (txn.amount > 0) {
                unexplainedDeposits += 1;
                pendingInflowAmount += Math.round(txn.amount);
            }
        }
    }

    return {
        totalTransactions: transactions.length,
        matched,
        pending,
        ignored,
        unexplainedDeposits,
        pendingInflowAmount,
    };
}
