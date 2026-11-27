import { isBillDate } from './personalBill';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type { ResidentUtilityAccount, ResidentUtilityAccountInput } from '@/lib/types';
import { findUtilityProvider, isPersonalBillService, normalizeCustomerNumber } from './providers';

/**
 * Cuentas personales de luz, agua y gas del residente. Son privadas: cada
 * consulta filtra por el dueño, y la tabla no tiene política de lectura para la
 * administración. Ninguna función de aquí recibe un community_id a propósito.
 */

export class UtilityAccountError extends Error {
    constructor(message: string, public status = 400) { super(message); }
}

const MAX_ACCOUNTS = 12;
const COLUMNS = 'id, service, provider, customer_number, alias, due_day, reminders_enabled, last_paid_period, bill_due_date, bill_amount, last_paid_bill_due_date';

type Row = {
    id: string; service: string; provider: string; customer_number: string; alias: string | null;
    due_day: number | null; reminders_enabled: boolean; last_paid_period: string | null;
    bill_due_date: string | null; bill_amount: number | null; last_paid_bill_due_date: string | null;
};

function mapRow(row: Row): ResidentUtilityAccount {
    return {
        id: row.id,
        service: isPersonalBillService(row.service) ? row.service : 'electricity',
        provider: row.provider,
        customerNumber: row.customer_number,
        alias: row.alias || '',
        dueDay: row.due_day,
        remindersEnabled: row.reminders_enabled,
        lastPaidPeriod: row.last_paid_period,
        billDueDate: row.bill_due_date,
        billAmount: row.bill_amount,
        lastPaidBillDueDate: row.last_paid_bill_due_date,
    };
}

function parseDueDay(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const day = Number(value);
    if (!Number.isInteger(day) || day < 1 || day > 31) throw new UtilityAccountError('El día de vencimiento va del 1 al 31.');
    return day;
}

function parseBillDate(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    if (!isBillDate(value)) throw new UtilityAccountError('La fecha de vencimiento no es válida.');
    return value;
}

function parseBillAmount(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2_147_483_647) {
        throw new UtilityAccountError('Ingresa un monto válido en pesos.');
    }
    return value;
}

export function validateAccountInput(input: Partial<ResidentUtilityAccountInput>) {
    const provider = findUtilityProvider(String(input.provider || ''));
    if (!provider) throw new UtilityAccountError('Elige la empresa de la lista.');
    if (input.service !== undefined && input.service !== provider.service) {
        throw new UtilityAccountError(`${provider.name} no corresponde a ese servicio.`);
    }
    const customerNumber = normalizeCustomerNumber(input.customerNumber);
    if (!customerNumber) throw new UtilityAccountError(`Escribe tu ${provider.customerNumberLabel.toLowerCase()}.`);
    return {
        service: provider.service,
        provider: provider.id,
        customer_number: customerNumber,
        alias: String(input.alias || '').trim().slice(0, 60),
        due_day: parseDueDay(input.dueDay),
        reminders_enabled: input.remindersEnabled !== false,
    };
}

export async function listResidentAccounts(userId: string): Promise<ResidentUtilityAccount[]> {
    const { data, error } = await getSupabaseAdmin().from('resident_utility_accounts').select(COLUMNS)
        .eq('user_id', userId).order('service').order('created_at');
    if (error) throw error;
    return (data as Row[] | null ?? []).map(mapRow);
}

export async function createResidentAccount(userId: string, input: Partial<ResidentUtilityAccountInput>) {
    const values = validateAccountInput(input);
    const admin = getSupabaseAdmin();
    const { count, error: countError } = await admin.from('resident_utility_accounts')
        .select('id', { count: 'exact', head: true }).eq('user_id', userId);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_ACCOUNTS) throw new UtilityAccountError(`Puedes registrar hasta ${MAX_ACCOUNTS} cuentas.`);
    const { data, error } = await admin.from('resident_utility_accounts')
        .insert({ ...values, user_id: userId,
            bill_due_date: parseBillDate(input.billDueDate), bill_amount: parseBillAmount(input.billAmount),
        }).select(COLUMNS).single();
    if (error) {
        if (error.code === '23505') throw new UtilityAccountError('Esa cuenta ya está registrada.', 409);
        throw error;
    }
    return mapRow(data as Row);
}

export async function updateResidentAccount(userId: string, id: string, input: Partial<ResidentUtilityAccountInput> & { paidPeriod?: string | null; paidBillDueDate?: string | null }) {
    const changes: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (input.provider !== undefined || input.customerNumber !== undefined) Object.assign(changes, validateAccountInput(input));
    else {
        if (input.alias !== undefined) changes.alias = String(input.alias).trim().slice(0, 60);
        if (input.dueDay !== undefined) changes.due_day = parseDueDay(input.dueDay);
        if (input.remindersEnabled !== undefined) changes.reminders_enabled = Boolean(input.remindersEnabled);
    }
    if (input.billDueDate !== undefined) changes.bill_due_date = parseBillDate(input.billDueDate);
    if (input.billAmount !== undefined) changes.bill_amount = parseBillAmount(input.billAmount);
    if (input.paidBillDueDate !== undefined) changes.last_paid_bill_due_date = parseBillDate(input.paidBillDueDate);
    if (input.paidPeriod !== undefined) {
        if (input.paidPeriod !== null && !/^\d{4}-(0[1-9]|1[0-2])$/.test(input.paidPeriod)) throw new UtilityAccountError('Mes no válido.');
        changes.last_paid_period = input.paidPeriod;
    }
    const { data, error } = await getSupabaseAdmin().from('resident_utility_accounts')
        .update(changes).eq('id', id).eq('user_id', userId).select(COLUMNS).maybeSingle();
    if (error) {
        if (error.code === '23505') throw new UtilityAccountError('Esa cuenta ya está registrada.', 409);
        throw error;
    }
    if (!data) throw new UtilityAccountError('No encontramos esa cuenta.', 404);
    return mapRow(data as Row);
}

export async function deleteResidentAccount(userId: string, id: string) {
    const { data, error } = await getSupabaseAdmin().from('resident_utility_accounts')
        .delete().eq('id', id).eq('user_id', userId).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new UtilityAccountError('No encontramos esa cuenta.', 404);
}
