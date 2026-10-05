/**
 * Carga masiva de pagos desde una planilla.
 *
 * Una administración recibe decenas de transferencias a fin de mes y las tiene
 * en un Excel. Registrarlas una por una es donde se cuelan los errores, así que
 * la planilla se valida completa antes de tocar la base: primero se muestra el
 * plan fila por fila y solo se registra lo que el administrador confirma.
 */

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { PaymentImportResult, PaymentImportRow } from '@/lib/types';
import { BillingError } from './billingService';
import { normalize, parseAmount, parseDate, readSpreadsheetTable } from './bankStatementParser';
import { PAYMENT_METHODS, recordPayment } from './collectionService';

const HEADER_ALIASES = {
    unit: ['unidad', 'depto', 'departamento', 'dpto', 'casa', 'unit'],
    amount: ['monto', 'abono', 'importe', 'monto pagado', 'amount'],
    date: ['fecha', 'fecha pago', 'fecha de pago', 'date'],
    method: ['medio', 'medio de pago', 'metodo', 'forma de pago', 'method'],
    reference: ['referencia', 'comprobante', 'n comprobante', 'numero operacion', 'n operacion', 'folio', 'reference'],
};

const METHOD_ALIASES: Record<string, string> = {
    transferencia: 'transfer',
    transfer: 'transfer',
    efectivo: 'cash',
    cash: 'cash',
    cheque: 'check',
    check: 'check',
    tarjeta: 'card',
    card: 'card',
    'en linea': 'online',
    online: 'online',
    webpay: 'online',
    otro: 'other',
    other: 'other',
};

const MAX_ROWS = 500;

export interface ImportUnit {
    id: string;
    number: string;
    tower: string | null;
}

function unitKey(value: unknown): string {
    return normalize(value)
        .replace(/\b(departamento|depto|dpto|unidad|casa|torre|of|oficina)\b/g, ' ')
        .replace(/[^a-z0-9]/g, '');
}

export function unitDisplayLabel(unit: ImportUnit): string {
    return unit.tower && unit.tower !== 'A' ? `${unit.tower}-${unit.number}` : unit.number;
}

/**
 * Índice de unidades por cómo las escribe una persona: "101", "B-101", "Depto 101".
 * Un número que se repite en dos torres no se acepta solo: sería imputar el
 * pago a la unidad equivocada.
 */
export function buildUnitIndex(units: ImportUnit[]): Map<string, ImportUnit | 'ambiguous'> {
    const index = new Map<string, ImportUnit | 'ambiguous'>();
    const add = (key: string, unit: ImportUnit) => {
        if (!key) return;
        const existing = index.get(key);
        if (existing && existing !== 'ambiguous' && existing.id !== unit.id) index.set(key, 'ambiguous');
        else if (!existing) index.set(key, unit);
    };
    for (const unit of units) {
        add(unitKey(`${unit.tower ?? ''}${unit.number}`), unit);
        add(unitKey(unitDisplayLabel(unit)), unit);
        add(unitKey(unit.number), unit);
    }
    return index;
}

export function planPaymentImport(table: unknown[][], units: ImportUnit[]): PaymentImportRow[] {
    const headerIndex = table.findIndex(row => row.some(cell => HEADER_ALIASES.unit.includes(normalize(cell))));
    if (headerIndex < 0) throw new BillingError('missing_headers', 'No se encontró una columna Unidad o Depto.');
    const headers = table[headerIndex].map(normalize);
    const column = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
    const unitColumn = column(HEADER_ALIASES.unit);
    const amountColumn = column(HEADER_ALIASES.amount);
    const dateColumn = column(HEADER_ALIASES.date);
    if (amountColumn < 0) throw new BillingError('missing_headers', 'Falta la columna Monto.');
    if (dateColumn < 0) throw new BillingError('missing_headers', 'Falta la columna Fecha.');
    const methodColumn = column(HEADER_ALIASES.method);
    const referenceColumn = column(HEADER_ALIASES.reference);

    const body = table.slice(headerIndex + 1).filter(row => row.some(cell => String(cell ?? '').trim()));
    if (body.length === 0) throw new BillingError('empty_file', 'La planilla no tiene pagos debajo de la cabecera.');
    if (body.length > MAX_ROWS) throw new BillingError('too_many_rows', `La planilla supera ${MAX_ROWS} pagos. Divídela en partes.`);

    const index = buildUnitIndex(units);
    const seenReferences = new Set<string>();

    return body.map((row, offset) => {
        const line = headerIndex + offset + 2;
        const rawUnit = String(row[unitColumn] ?? '').trim();
        const base: PaymentImportRow = {
            line,
            rawUnit,
            unitId: null,
            unitLabel: null,
            amount: 0,
            paidAt: '',
            method: 'transfer',
            reference: referenceColumn >= 0 ? String(row[referenceColumn] ?? '').trim().slice(0, 120) || null : null,
            status: 'ready',
            message: null,
        };
        try {
            const match = index.get(unitKey(rawUnit));
            if (!rawUnit || !match) throw new BillingError('unit_not_found', `No existe la unidad "${rawUnit || '(vacía)'}".`);
            if (match === 'ambiguous') {
                throw new BillingError('unit_ambiguous', `"${rawUnit}" coincide con más de una unidad. Escribe la torre, por ejemplo B-101.`);
            }
            const amount = parseAmount(row[amountColumn]);
            if (amount <= 0) throw new BillingError('bad_amount', 'El monto debe ser mayor que cero.');
            const rawMethod = methodColumn >= 0 ? normalize(row[methodColumn]) : '';
            const method = rawMethod ? METHOD_ALIASES[rawMethod] : 'transfer';
            if (!method || !PAYMENT_METHODS.has(method)) {
                throw new BillingError('bad_method', `Medio de pago no reconocido: ${String(row[methodColumn])}.`);
            }
            if (base.reference) {
                const key = `${match.id}:${base.reference}`;
                if (seenReferences.has(key)) {
                    throw new BillingError('duplicate_reference', `La referencia ${base.reference} se repite en la planilla para la misma unidad.`);
                }
                seenReferences.add(key);
            }
            return {
                ...base,
                unitId: match.id,
                unitLabel: unitDisplayLabel(match),
                amount,
                paidAt: parseDate(row[dateColumn]),
                method,
            };
        } catch (error) {
            return { ...base, status: 'error', message: error instanceof Error ? error.message : 'Fila inválida.' };
        }
    });
}

async function loadImportUnits(communityId: string): Promise<ImportUnit[]> {
    const { data, error } = await getSupabaseAdmin()
        .from('units')
        .select('id, number, tower')
        .eq('community_id', communityId);
    if (error) throw error;
    return (data ?? []).map(row => ({
        id: String(row.id),
        number: String(row.number ?? ''),
        tower: row.tower ? String(row.tower) : null,
    }));
}

/**
 * Con `commit = false` solo devuelve el plan. Con `commit = true` registra las
 * filas listas una por una: una referencia ya registrada antes no frena el
 * resto, queda informada en su fila.
 */
export async function importPayments(
    communityId: string,
    recordedBy: string | null,
    file: File,
    commit: boolean,
): Promise<PaymentImportResult> {
    const [{ table }, units] = await Promise.all([
        readSpreadsheetTable(file, 'La planilla de pagos'),
        loadImportUnits(communityId),
    ]);
    const rows = planPaymentImport(table, units);

    if (commit) {
        for (const row of rows) {
            if (row.status !== 'ready' || !row.unitId) continue;
            try {
                await recordPayment(communityId, recordedBy, {
                    unitId: row.unitId,
                    amount: row.amount,
                    paidAt: row.paidAt,
                    method: row.method,
                    reference: row.reference,
                    notes: 'Carga masiva desde planilla',
                });
                row.status = 'recorded';
            } catch (error) {
                row.status = 'error';
                row.message = error instanceof BillingError ? error.message : 'No se pudo registrar este pago.';
            }
        }
    }

    const ready = rows.filter(row => row.status === 'ready' || row.status === 'recorded');
    return {
        committed: commit,
        rows,
        readyCount: ready.length,
        errorCount: rows.filter(row => row.status === 'error').length,
        totalAmount: ready.reduce((sum, row) => sum + row.amount, 0),
    };
}
