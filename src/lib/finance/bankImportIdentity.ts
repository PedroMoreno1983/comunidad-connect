export interface BankIdentityRow {
    id: string;
    txnDate: string;
    amount: number;
    description: string;
    reference: string | null;
    importKey: string | null;
}

export interface IncomingBankRow {
    txnDate: string;
    amount: number;
    description: string;
    reference: string | null;
    importKey: string | null;
}

export type BankImportPlan =
    | { kind: 'skip' }
    | { kind: 'insert' }
    | { kind: 'adopt'; id: string };

function sameMovement(stored: BankIdentityRow, row: IncomingBankRow): boolean {
    if (stored.txnDate !== row.txnDate || stored.amount !== row.amount) return false;
    if (row.reference) return stored.reference === row.reference;
    return !stored.reference && stored.description === row.description;
}

/**
 * Una cartola nueva se identifica por archivo y fila. Una fila vieja, guardada
 * sin esa clave, se adopta una sola vez. Otra cartola con el mismo movimiento
 * sigue siendo un registro distinto. Un alta manual sin clave no se repite.
 */
export function planBankImport(
    row: IncomingBankRow,
    existing: readonly BankIdentityRow[],
    claimedIds: ReadonlySet<string>,
): BankImportPlan {
    if (row.importKey && existing.some(item => item.importKey === row.importKey)) return { kind: 'skip' };
    const legacy = existing.find(item => !item.importKey && !claimedIds.has(item.id) && sameMovement(item, row));
    if (row.importKey && legacy) return { kind: 'adopt', id: legacy.id };
    if (!row.importKey && existing.some(item => sameMovement(item, row))) return { kind: 'skip' };
    return { kind: 'insert' };
}
