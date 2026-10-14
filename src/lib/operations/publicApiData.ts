import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError } from '@/lib/finance/billingService';

// Lecturas de la API pública. Devuelven solo lo que un sistema externo
// (contabilidad, banco, control de acceso) necesita: nada de correos,
// teléfonos ni RUT de residentes.
const MAX_ROWS = 1000;

export async function listUnits(communityId: string) {
    const { data, error } = await getSupabaseAdmin()
        .from('units').select('id, number, tower, floor, share_permille')
        .eq('community_id', communityId).order('number').limit(MAX_ROWS);
    if (error) throw error;
    return (data || []).map(row => ({
        id: row.id,
        number: row.number,
        tower: row.tower,
        floor: row.floor,
        sharePermille: row.share_permille === null ? null : Number(row.share_permille),
    }));
}

async function unitNumbers(communityId: string) {
    const units = await listUnits(communityId);
    return new Map(units.map(unit => [String(unit.id), unit.number as string]));
}

/** Cobros de gasto común emitidos para un mes, con su estado de pago. */
export async function listCharges(communityId: string, month: string) {
    const [{ data, error }, numbers] = await Promise.all([
        getSupabaseAdmin().from('expenses')
            .select('id, unit_id, month, amount, status, due_date, paid_at')
            .eq('community_id', communityId).eq('month', month).limit(MAX_ROWS),
        unitNumbers(communityId),
    ]);
    if (error) throw error;
    return (data || []).map(row => ({
        id: row.id,
        unitId: row.unit_id,
        unitNumber: numbers.get(String(row.unit_id)) ?? null,
        month: row.month,
        amount: Math.round(Number(row.amount)),
        status: row.status,
        dueDate: row.due_date,
        paidAt: row.paid_at,
    }));
}

/** Pagos registrados entre dos fechas (inclusive), para cuadrar con la cartola. */
export async function listPayments(communityId: string, from: string, to: string) {
    if (from > to) throw new BillingError('bad_range', 'from debe ser anterior o igual a to.');
    const [{ data, error }, numbers] = await Promise.all([
        getSupabaseAdmin().from('unit_payments')
            .select('id, unit_id, amount, paid_at, method, reference, expense_id, charge_id, created_at')
            .eq('community_id', communityId).gte('paid_at', from).lte('paid_at', to)
            .order('paid_at').limit(MAX_ROWS),
        unitNumbers(communityId),
    ]);
    if (error) throw error;
    return (data || []).map(row => ({
        id: row.id,
        unitId: row.unit_id,
        unitNumber: numbers.get(String(row.unit_id)) ?? null,
        amount: Math.round(Number(row.amount)),
        paidAt: row.paid_at,
        method: row.method,
        reference: row.reference,
        chargeId: row.expense_id ?? row.charge_id ?? null,
        recordedAt: row.created_at,
    }));
}

/** Ingresos de visitas desde una fecha, para sistemas de control de acceso. */
export async function listVisitors(communityId: string, since: string) {
    const [{ data, error }, numbers] = await Promise.all([
        getSupabaseAdmin().from('visitor_logs')
            .select('id, unit_id, visitor_name, entry_time, exit_time, purpose, is_qr')
            .eq('community_id', communityId).gte('entry_time', since)
            .order('entry_time', { ascending: false }).limit(MAX_ROWS),
        unitNumbers(communityId),
    ]);
    if (error) throw error;
    return (data || []).map(row => ({
        id: row.id,
        unitId: row.unit_id,
        unitNumber: row.unit_id ? numbers.get(String(row.unit_id)) ?? null : null,
        visitorName: row.visitor_name,
        entryTime: row.entry_time,
        exitTime: row.exit_time,
        purpose: row.purpose,
        viaQr: Boolean(row.is_qr),
    }));
}
