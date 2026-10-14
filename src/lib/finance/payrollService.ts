import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import type {
  CommunityEmployeeRecord,
  PayrollCalculation,
  PayrollContractType,
  PayrollHealthSystem,
  PayrollEmployeeInput,
  PayrollIndicators,
  Payslip,
  PayrollSettings,
  PayslipDocument,
  PreviredWorker,
} from '@/lib/types';
import { BillingError, DATE_PATTERN, MONTH_PATTERN } from './billingService';
import { calculatePayslip, PayrollInputError } from './payrollChile';
import { buildPreviredFile, PreviredFileError } from './previredFile';
import { parsePreviredIndicators, PREVIRED_INDICATORS_URL } from './previredIndicators';

const EMPLOYEE_COLUMNS = [
  'id, full_name, role_title, monthly_amount, active, created_at',
  'calculation, rut, afp, health_system, isapre_name, isapre_plan_uf, contract_type',
  'gratification, taxable_bonus, meal_allowance, transport_allowance, family_dependents, hire_date',
  'first_names, father_last_name, mother_last_name, sex, foreign_national, isapre_code, part_time',
].join(', ');

const CONTRACT_TYPES: PayrollContractType[] = ['indefinido', 'plazo_fijo', 'indefinido_11'];

export type EmployeeInput = PayrollEmployeeInput;

/** El cálculo legal exige el mes exacto; el listado puede mostrar el último período disponible. */
export async function getPayrollIndicators(month: string, latestAvailable = false) {
  let query = getSupabaseAdmin()
    .from('payroll_indicators')
    .select('month, values');
  query = latestAvailable ? query.lte('month', month) : query.eq('month', month);
  const { data, error } = await query
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { month: data.month as string, values: data.values as PayrollIndicators };
}

export async function listPayroll(communityId: string) {
  const admin = getSupabaseAdmin();
  const [{ data: employees, error: employeeError }, { data: runs, error: runError }, indicators, { data: community, error: communityError }] = await Promise.all([
    admin.from('community_employees').select(EMPLOYEE_COLUMNS).eq('community_id', communityId).order('full_name'),
    admin.from('payroll_runs').select('id, month, status, total_amount, paid_at, payment_reference, expense_id, expense_note, created_at, indicators_month, payroll_lines(id, full_name, role_title, amount, gross_amount, net_amount, breakdown)').eq('community_id', communityId).order('month', { ascending: false }).limit(18),
    getPayrollIndicators('9999-12', true),
    admin.from('communities').select('payroll_ccaf_code, payroll_mutual_code, payroll_accident_rate').eq('id', communityId).single(),
  ]);
  if (employeeError) throw employeeError;
  if (runError) throw runError;
  if (communityError) throw communityError;
  return {
    settings: {
      ccafCode: community.payroll_ccaf_code as string,
      mutualCode: community.payroll_mutual_code as string,
      accidentRate: Number(community.payroll_accident_rate),
    },
    employees: employees || [],
    runs: runs || [],
    afps: Object.keys(indicators?.values.afpWorkerRates || {}),
    indicatorsMonth: indicators?.month || null,
  };
}

function wholePesos(value: unknown) {
  const amount = Math.round(Number(value) || 0);
  return amount > 0 ? amount : 0;
}

const nameField = (value: string | undefined) => value?.trim().replace(/\s+/g, ' ').slice(0, 30) || null;

export async function saveEmployee(communityId: string, input: EmployeeInput) {
  const firstNames = nameField(input.firstNames);
  const fatherLastName = nameField(input.fatherLastName);
  const motherLastName = nameField(input.motherLastName);
  // Con nombres separados, el nombre completo se arma igual que en Previred.
  const fullName = (firstNames && fatherLastName
    ? [firstNames, fatherLastName, motherLastName].filter(Boolean).join(' ')
    : input.fullName.trim()).slice(0, 120);
  const roleTitle = input.roleTitle.trim().slice(0, 80);
  const monthlyAmount = Math.round(Number(input.monthlyAmount));
  if (!fullName || !roleTitle) throw new BillingError('bad_label', 'Indica el nombre y el cargo.');
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    throw new BillingError('bad_amount', 'El sueldo mensual debe ser mayor que cero.');
  }
  const calculation: PayrollCalculation = input.calculation === 'chile' ? 'chile' : 'fixed';
  const healthSystem: PayrollHealthSystem = input.healthSystem === 'isapre' ? 'isapre' : 'fonasa';
  const contractType = CONTRACT_TYPES.includes(input.contractType as PayrollContractType)
    ? input.contractType as PayrollContractType
    : 'indefinido';
  const afp = input.afp?.trim().toLowerCase().slice(0, 30) || null;
  const isaprePlanUf = healthSystem === 'isapre' ? Number(input.isaprePlanUf) || null : null;
  if (calculation === 'chile' && !afp) throw new BillingError('bad_afp', 'Indica la AFP de la persona.');
  if (calculation === 'chile' && healthSystem === 'isapre' && !isaprePlanUf) {
    throw new BillingError('bad_isapre', 'Indica el valor del plan de isapre en UF.');
  }
  if (input.hireDate && !DATE_PATTERN.test(input.hireDate)) {
    throw new BillingError('bad_date', 'La fecha de ingreso debe ir en formato AAAA-MM-DD.');
  }

  const admin = getSupabaseAdmin();
  const payload = {
    community_id: communityId,
    full_name: fullName,
    role_title: roleTitle,
    monthly_amount: monthlyAmount,
    active: input.active !== false,
    calculation,
    rut: input.rut?.trim().slice(0, 12) || null,
    afp,
    health_system: healthSystem,
    isapre_name: healthSystem === 'isapre' ? input.isapreName?.trim().slice(0, 60) || null : null,
    isapre_plan_uf: isaprePlanUf,
    contract_type: contractType,
    gratification: input.gratification !== false,
    taxable_bonus: wholePesos(input.taxableBonus),
    meal_allowance: wholePesos(input.mealAllowance),
    transport_allowance: wholePesos(input.transportAllowance),
    family_dependents: Math.min(20, Math.max(0, Math.round(Number(input.familyDependents) || 0))),
    hire_date: input.hireDate || null,
    first_names: firstNames,
    father_last_name: fatherLastName,
    mother_last_name: motherLastName,
    sex: input.sex === 'M' || input.sex === 'F' ? input.sex : null,
    foreign_national: input.foreignNational === true,
    isapre_code: healthSystem === 'isapre' && /^\d{2}$/.test(input.isapreCode || '') ? input.isapreCode : null,
    part_time: input.partTime === true,
  };
  const query = input.id
    ? admin.from('community_employees').update(payload).eq('id', input.id).eq('community_id', communityId)
    : admin.from('community_employees').insert(payload);
  const { data, error } = await query.select(EMPLOYEE_COLUMNS).single();
  if (error) throw error;
  return data;
}

const CCAF_CODES = ['00', '01', '02', '03', '04'];
const MUTUAL_CODES = ['00', '01', '02', '03'];

export async function savePayrollSettings(communityId: string, input: PayrollSettings) {
  if (!CCAF_CODES.includes(input.ccafCode)) throw new BillingError('bad_ccaf', 'Elige una caja de compensación válida.');
  if (!MUTUAL_CODES.includes(input.mutualCode)) throw new BillingError('bad_mutual', 'Elige una mutual válida.');
  if (!(input.accidentRate >= 0.009 && input.accidentRate < 0.2)) {
    throw new BillingError('bad_rate', 'La tasa de accidentes va entre 0,90% y 20%.');
  }
  const { error } = await getSupabaseAdmin()
    .from('communities')
    .update({
      payroll_ccaf_code: input.ccafCode,
      payroll_mutual_code: input.mutualCode,
      payroll_accident_rate: Math.round(input.accidentRate * 10000) / 10000,
    })
    .eq('id', communityId);
  if (error) throw error;
  return input;
}

interface EmployeeRow {
  id: string;
  full_name: string;
  monthly_amount: number;
  calculation: PayrollCalculation;
  afp: string | null;
  health_system: PayrollHealthSystem;
  isapre_plan_uf: number | null;
  contract_type: PayrollContractType;
  gratification: boolean;
  taxable_bonus: number;
  meal_allowance: number;
  transport_allowance: number;
  family_dependents: number;
}

export async function createPayrollRun(communityId: string, createdBy: string | null, month: string) {
  if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica el mes en formato AAAA-MM.');
  const admin = getSupabaseAdmin();
  const [{ data: employees, error }, { data: community, error: communityError }, indicators] = await Promise.all([
    admin.from('community_employees').select(EMPLOYEE_COLUMNS).eq('community_id', communityId).eq('active', true),
    admin.from('communities').select('payroll_accident_rate').eq('id', communityId).single(),
    getPayrollIndicators(month),
  ]);
  if (error) throw error;
  if (communityError) throw communityError;
  const rows = (employees || []) as unknown as EmployeeRow[];
  if (!rows.length) throw new BillingError('empty', 'No hay personas activas para armar la remuneración.');
  const needsIndicators = rows.some(row => row.calculation === 'chile');
  if (needsIndicators && !indicators) {
    throw new BillingError('no_indicators', 'Faltan los indicadores previsionales del mes exacto. La liquidación legal queda pendiente hasta cargarlos.');
  }

  const lines = rows.map(row => {
    try {
      const slip = calculatePayslip({
        calculation: row.calculation,
        baseSalary: row.monthly_amount,
        afp: row.afp,
        healthSystem: row.health_system,
        isaprePlanUf: row.isapre_plan_uf === null ? null : Number(row.isapre_plan_uf),
        contractType: row.contract_type,
        gratification: row.gratification,
        taxableBonus: row.taxable_bonus,
        mealAllowance: row.meal_allowance,
        transportAllowance: row.transport_allowance,
        familyDependents: row.family_dependents,
        accidentRate: Number(community?.payroll_accident_rate ?? 0.0093),
      }, indicators?.values as PayrollIndicators);
      return {
        employee_id: row.id,
        base: row.monthly_amount,
        amount: slip.employerCost,
        gross: slip.grossPay,
        net: slip.netPay,
        breakdown: slip,
      };
    } catch (calcError) {
      if (calcError instanceof PayrollInputError) {
        throw new BillingError('bad_employee', `${row.full_name}: ${calcError.message}`);
      }
      throw calcError;
    }
  });

  const { data, error: runError } = await admin.rpc('create_payroll_run_with_lines', {
    p_community_id: communityId,
    p_created_by: createdBy,
    p_month: month,
    p_indicators_month: needsIndicators ? indicators?.month ?? null : null,
    p_lines: lines,
  });
  if (runError) throw runError;
  const outcome = data as { status?: string; id?: string; month?: string; total?: number } | null;
  if (outcome?.status === 'already_paid') {
    throw new BillingError('already_paid', 'Ese mes ya tiene la remuneración pagada.', 409);
  }
  if (outcome?.status === 'empty') {
    throw new BillingError('empty', 'No hay personas activas para armar la remuneración.');
  }
  if (outcome?.status === 'stale') {
    throw new BillingError('stale', 'El personal cambió mientras se armaba la liquidación. Vuelve a intentarlo.', 409);
  }
  if (outcome?.status !== 'draft' || !outcome.id || outcome.month !== month || !outcome.total) {
    throw new BillingError('draft_failed', 'No se pudo confirmar el borrador de remuneraciones.', 500);
  }
  return {
    id: outcome.id,
    month,
    total: outcome.total,
    indicatorsMonth: needsIndicators ? indicators?.month ?? null : null,
  };
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

/** Datos para la liquidación en PDF de una línea calculada con la ley chilena. */
export async function getPayslipDocument(communityId: string, lineId: string): Promise<PayslipDocument> {
  const admin = getSupabaseAdmin();
  const { data: line, error } = await admin
    .from('payroll_lines')
    .select('id, full_name, role_title, breakdown, employee_id, payroll_runs!inner(month, community_id, indicators_month)')
    .eq('id', lineId)
    .eq('payroll_runs.community_id', communityId)
    .maybeSingle();
  if (error) throw error;
  if (!line) throw new BillingError('not_found', 'No existe esa liquidación.', 404);
  const slip = line.breakdown as Payslip | null;
  if (!slip || slip.calculation !== 'chile') {
    throw new BillingError('fixed_line', 'Esta persona se paga con monto fijo; no tiene liquidación legal calculada.');
  }
  const run = (Array.isArray(line.payroll_runs) ? line.payroll_runs[0] : line.payroll_runs) as {
    month: string; indicators_month: string | null;
  };
  const [{ data: community }, { data: employee }] = await Promise.all([
    admin.from('communities').select('name, address').eq('id', communityId).maybeSingle(),
    line.employee_id
      ? admin.from('community_employees').select('rut').eq('id', line.employee_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    communityName: community?.name || 'Comunidad',
    communityAddress: community?.address || null,
    month: run.month,
    employee: { fullName: line.full_name, roleTitle: line.role_title, rut: employee?.rut || null },
    slip,
    indicatorsMonth: run.indicators_month,
  };
}

/** Archivo de 105 campos para cargar en Previred la nómina de un mes ya calculado. */
export async function getPreviredFile(communityId: string, runId: string) {
  const admin = getSupabaseAdmin();
  const { data: run, error } = await admin
    .from('payroll_runs')
    .select('id, month, indicators_month, payroll_lines(full_name, breakdown, employee_id)')
    .eq('id', runId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (error) throw error;
  if (!run) throw new BillingError('not_found', 'No existe esa liquidación.', 404);
  if (!run.indicators_month) {
    throw new BillingError('fixed_run', 'Esta nómina no tiene trabajadores con liquidación legal.');
  }
  const lines = (run.payroll_lines || []) as { full_name: string; breakdown: Payslip | null; employee_id: string | null }[];
  const employeeIds = lines.map(line => line.employee_id).filter((id): id is string => Boolean(id));
  const [{ data: employees, error: employeeError }, { data: community, error: communityError }, { data: indicators, error: indicatorsError }] = await Promise.all([
    admin.from('community_employees').select(EMPLOYEE_COLUMNS).in('id', employeeIds),
    admin.from('communities').select('payroll_ccaf_code, payroll_mutual_code').eq('id', communityId).single(),
    admin.from('payroll_indicators').select('values').eq('month', run.indicators_month).single(),
  ]);
  if (employeeError) throw employeeError;
  if (communityError) throw communityError;
  if (indicatorsError) throw indicatorsError;
  const byId = new Map(((employees || []) as unknown as CommunityEmployeeRecord[]).map(row => [row.id, row]));

  const workers: PreviredWorker[] = lines
    .filter(line => line.breakdown?.calculation === 'chile')
    .map(line => {
      const row = line.employee_id ? byId.get(line.employee_id) : undefined;
      return {
        fullName: line.full_name,
        rut: row?.rut ?? null,
        firstNames: row?.first_names ?? null,
        fatherLastName: row?.father_last_name ?? null,
        motherLastName: row?.mother_last_name ?? null,
        sex: row?.sex ?? null,
        foreignNational: row?.foreign_national ?? false,
        contractType: row?.contract_type ?? 'indefinido',
        hireDate: row?.hire_date ?? null,
        familyDependents: row?.family_dependents ?? 0,
        isapreCode: row?.isapre_code ?? null,
        isaprePlanUf: row?.isapre_plan_uf === null || row?.isapre_plan_uf === undefined ? null : Number(row.isapre_plan_uf),
        partTime: row?.part_time ?? false,
        slip: line.breakdown as Payslip,
      };
    });

  try {
    const text = buildPreviredFile({
      month: run.month,
      indicators: indicators.values as PayrollIndicators,
      ccafCode: community.payroll_ccaf_code,
      mutualCode: community.payroll_mutual_code,
      workers,
    });
    return { month: run.month, text };
  } catch (fileError) {
    if (fileError instanceof PreviredFileError) {
      throw new BillingError('previred_incomplete', fileError.problems.join(' '), 422);
    }
    throw fileError;
  }
}

/**
 * Carga los indicadores del mes publicado por Previred si todavía no están.
 * Nunca pisa un mes ya cargado: si Previred corrige un valor, se revisa a mano.
 */
export async function refreshPayrollIndicators(fetchHtml: () => Promise<string>) {
  const parsed = parsePreviredIndicators(await fetchHtml());
  const { data, error } = await getSupabaseAdmin()
    .from('payroll_indicators')
    .upsert({ month: parsed.month, values: parsed.values, source: PREVIRED_INDICATORS_URL }, { onConflict: 'month', ignoreDuplicates: true })
    .select('month');
  if (error) throw error;
  return { month: parsed.month, inserted: Boolean(data?.length) };
}
