import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, DATE_PATTERN, MONTH_PATTERN } from './billingService';

export async function listPayroll(communityId: string) {
  const admin = getSupabaseAdmin();
  const [{ data: employees, error: employeeError }, { data: runs, error: runError }] = await Promise.all([
    admin.from('community_employees').select('id, full_name, role_title, monthly_amount, active, created_at').eq('community_id', communityId).order('full_name'),
    admin.from('payroll_runs').select('id, month, status, total_amount, paid_at, payment_reference, expense_id, expense_note, created_at, payroll_lines(id, full_name, role_title, amount)').eq('community_id', communityId).order('month', { ascending: false }).limit(18),
  ]);
  if (employeeError) throw employeeError;
  if (runError) throw runError;
  return { employees: employees || [], runs: runs || [] };
}

export async function saveEmployee(
  communityId: string,
  input: { id?: string; fullName: string; roleTitle: string; monthlyAmount: number; active?: boolean },
) {
  const fullName = input.fullName.trim().slice(0, 120);
  const roleTitle = input.roleTitle.trim().slice(0, 80);
  const monthlyAmount = Math.round(Number(input.monthlyAmount));
  if (!fullName || !roleTitle) throw new BillingError('bad_label', 'Indica el nombre y el cargo.');
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    throw new BillingError('bad_amount', 'El sueldo mensual debe ser mayor que cero.');
  }
  const admin = getSupabaseAdmin();
  const payload = {
    community_id: communityId,
    full_name: fullName,
    role_title: roleTitle,
    monthly_amount: monthlyAmount,
    active: input.active !== false,
  };
  const query = input.id
    ? admin.from('community_employees').update(payload).eq('id', input.id).eq('community_id', communityId)
    : admin.from('community_employees').insert(payload);
  const { data, error } = await query.select('id, full_name, role_title, monthly_amount, active, created_at').single();
  if (error) throw error;
  return data;
}

export async function createPayrollRun(communityId: string, createdBy: string | null, month: string) {
  if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
  const { data, error } = await getSupabaseAdmin().rpc('create_payroll_run_atomic', {
    p_community_id: communityId,
    p_created_by: createdBy,
    p_month: month,
  });
  if (error) throw error;
  const outcome = data as { status?: string; id?: string; month?: string; total?: number } | null;
  if (outcome?.status === 'already_paid') {
    throw new BillingError('already_paid', 'Ese mes ya tiene la remuneración pagada.', 409);
  }
  if (outcome?.status === 'empty') {
    throw new BillingError('empty', 'No hay personas activas para armar la remuneración.');
  }
  if (outcome?.status !== 'draft' || !outcome.id || outcome.month !== month || !outcome.total) {
    throw new BillingError('draft_failed', 'No se pudo confirmar el borrador de remuneraciones.', 500);
  }
  return { id: outcome.id, month, total: outcome.total };
}

export async function payPayrollRun(
  communityId: string,
  createdBy: string | null,
  input: { runId: string; paidAt: string; reference?: string },
) {
  if (!DATE_PATTERN.test(input.paidAt)) {
    throw new BillingError('bad_date', 'Indica la fecha de pago en formato AAAA-MM-DD.');
  }
  const admin = getSupabaseAdmin();
  const { data: run } = await admin
    .from('payroll_runs')
    .select('id, month, status, total_amount')
    .eq('id', input.runId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (!run) throw new BillingError('not_found', 'No existe esa liquidación.', 404);
  if (run.status === 'paid') throw new BillingError('already_paid', 'Esa liquidación ya está pagada.');
  if (run.total_amount <= 0) throw new BillingError('empty', 'La liquidación no tiene montos.');

  const { data, error } = await admin.rpc('pay_payroll_run_atomic', {
    p_community_id: communityId,
    p_run_id: run.id,
    p_paid_at: input.paidAt,
    p_reference: input.reference?.trim() || null,
    p_actor_id: createdBy,
  });
  if (error) throw error;
  const outcome = data as { status?: string; id?: string } | null;
  if (outcome?.status === 'not_found') throw new BillingError('not_found', 'No existe esa liquidación.', 404);
  if (outcome?.status === 'already_paid') throw new BillingError('already_paid', 'Esa liquidación ya está pagada.', 409);
  if (outcome?.status !== 'paid' || outcome.id !== run.id) {
    throw new BillingError('payment_failed', 'No se pudo confirmar el pago de la remuneración.', 500);
  }
  return { id: run.id, expenseNote: 'Incluido en los egresos del mes.' };
}
