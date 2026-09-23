import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { addCommunityExpense, BillingError, DATE_PATTERN, MONTH_PATTERN } from './billingService';
import { postJournalEntry } from './journalService';

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
  const admin = getSupabaseAdmin();
  const { data: existing } = await admin
    .from('payroll_runs')
    .select('id, status')
    .eq('community_id', communityId)
    .eq('month', month)
    .maybeSingle();
  if (existing?.status === 'paid') {
    throw new BillingError('already_paid', 'Ese mes ya tiene la remuneración pagada.');
  }
  const { data: employees, error } = await admin
    .from('community_employees')
    .select('id, full_name, role_title, monthly_amount')
    .eq('community_id', communityId)
    .eq('active', true);
  if (error) throw error;
  if (!employees?.length) throw new BillingError('empty', 'No hay personas activas para armar la remuneración.');

  const total = employees.reduce((sum, person) => sum + person.monthly_amount, 0);
  let runId = existing?.id;
  if (!runId) {
    const { data: created, error: createError } = await admin
      .from('payroll_runs')
      .insert({ community_id: communityId, month, total_amount: total, created_by: createdBy })
      .select('id')
      .single();
    if (createError || !created) throw createError || new Error('No se pudo armar la remuneración.');
    runId = created.id;
  } else {
    await admin.from('payroll_lines').delete().eq('run_id', runId);
    await admin.from('payroll_runs').update({ total_amount: total }).eq('id', runId);
  }
  const { error: lineError } = await admin.from('payroll_lines').insert(
    employees.map(person => ({
      run_id: runId,
      employee_id: person.id,
      full_name: person.full_name,
      role_title: person.role_title,
      amount: person.monthly_amount,
    })),
  );
  if (lineError) throw lineError;
  return { id: runId, month, total };
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

  const entry = await postJournalEntry(communityId, createdBy, {
    entryDate: input.paidAt,
    memo: `Remuneraciones ${run.month}`,
    source: 'payroll',
    lines: [
      { code: '5100', debit: run.total_amount, credit: 0 },
      { code: '1100', debit: 0, credit: run.total_amount },
    ],
  });

  let expenseId: string | null = null;
  let expenseNote = 'Incluido en los egresos del mes.';
  try {
    const expense = await addCommunityExpense(communityId, createdBy, {
      month: run.month,
      category: 'salaries',
      label: `Remuneraciones ${run.month}`,
      amount: run.total_amount,
      notes: input.reference?.trim() || null,
      prorateMethod: 'share',
    });
    expenseId = expense.id;
  } catch (error) {
    expenseNote = error instanceof BillingError
      ? `${error.message} El pago quedó en el libro; agrégalo a egresos solo si el mes sigue abierto.`
      : 'No se pudo agregar el egreso. El pago quedó en el libro.';
  }

  const { error } = await admin
    .from('payroll_runs')
    .update({
      status: 'paid',
      paid_at: input.paidAt,
      payment_reference: input.reference?.trim().slice(0, 120) || null,
      journal_entry_id: entry.id,
      expense_id: expenseId,
      expense_note: expenseNote,
    })
    .eq('id', run.id);
  if (error) throw error;
  return { id: run.id, expenseNote };
}
