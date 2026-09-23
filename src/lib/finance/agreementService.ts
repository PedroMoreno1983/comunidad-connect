import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, DATE_PATTERN } from './billingService';
import { recordPayment } from './collectionService';
import { postJournalEntry } from './journalService';
import { splitInstallments } from './operationalFlows';

function unitLabel(row: { number?: unknown; tower?: unknown }) {
  const number = String(row.number ?? '');
  const tower = String(row.tower ?? '');
  return tower && tower !== 'A' ? `${tower}-${number}` : number;
}

async function loadAgreements(communityId: string, unitIds?: string[]) {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('payment_agreements')
    .select('id, unit_id, title, total_amount, installment_count, status, notes, created_at, units(number, tower), payment_agreement_installments(id, sequence_number, due_date, amount, status, paid_at)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });
  if (unitIds) query = query.in('unit_id', unitIds);
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(row => {
    const unit = Array.isArray(row.units) ? row.units[0] : row.units;
    const installments = [...(row.payment_agreement_installments || [])]
      .sort((a, b) => a.sequence_number - b.sequence_number);
    return {
      id: row.id,
      unitId: row.unit_id,
      unitLabel: unit ? unitLabel(unit) : '',
      title: row.title,
      totalAmount: row.total_amount,
      installmentCount: row.installment_count,
      status: row.status,
      notes: row.notes,
      createdAt: row.created_at,
      paidAmount: installments.filter(item => item.status === 'paid').reduce((sum, item) => sum + item.amount, 0),
      installments: installments.map(item => ({
        id: item.id,
        sequence: item.sequence_number,
        dueDate: item.due_date,
        amount: item.amount,
        status: item.status,
        paidAt: item.paid_at,
      })),
    };
  });
}

export async function listAgreements(communityId: string) {
  return loadAgreements(communityId);
}

export async function listAgreementsForUnits(communityId: string, unitIds: string[]) {
  if (!unitIds.length) return [];
  return loadAgreements(communityId, unitIds);
}

export async function createAgreement(
  communityId: string,
  createdBy: string | null,
  input: { unitId: string; title: string; totalAmount: number; installmentCount: number; startDate: string; notes?: string },
) {
  const title = input.title.trim().slice(0, 140);
  if (!title) throw new BillingError('bad_label', 'El convenio necesita un título.');
  const installments = splitInstallments(input.totalAmount, input.installmentCount, input.startDate);
  const admin = getSupabaseAdmin();
  const { data: unit } = await admin
    .from('units')
    .select('id, owner_id, number, tower')
    .eq('id', input.unitId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (!unit) throw new BillingError('unit_not_found', 'Esa unidad no existe en tu comunidad.', 404);

  const { data: existing } = await admin
    .from('payment_agreements')
    .select('id')
    .eq('community_id', communityId)
    .eq('unit_id', input.unitId)
    .eq('status', 'active')
    .maybeSingle();
  if (existing) {
    throw new BillingError('active_agreement', 'Esa unidad ya tiene un convenio activo. Ciérralo antes de abrir otro.');
  }

  const { data: agreement, error } = await admin
    .from('payment_agreements')
    .insert({
      community_id: communityId,
      unit_id: input.unitId,
      title,
      total_amount: installments.reduce((sum, item) => sum + item.amount, 0),
      installment_count: installments.length,
      notes: input.notes?.trim().slice(0, 500) || '',
      created_by: createdBy,
    })
    .select('id')
    .single();
  if (error || !agreement) throw error || new Error('No se pudo crear el convenio.');

  const { error: lineError } = await admin.from('payment_agreement_installments').insert(
    installments.map(item => ({
      agreement_id: agreement.id,
      community_id: communityId,
      sequence_number: item.sequence,
      due_date: item.dueDate,
      amount: item.amount,
    })),
  );
  if (lineError) {
    await admin.from('payment_agreements').delete().eq('id', agreement.id);
    throw lineError;
  }

  if (unit.owner_id) {
    await admin.from('notifications').insert({
      user_id: String(unit.owner_id),
      type: 'info',
      category: 'finance_agreement',
      title: 'Convenio de pago',
      body: `La administración abrió el convenio «${title}» en ${installments.length} cuotas.`,
      link: '/expenses',
      community_id: communityId,
    }).then(() => undefined, () => undefined);
  }

  const [created] = await loadAgreements(communityId, [input.unitId]);
  if (!created) throw new Error('El convenio se guardó, pero no se pudo volver a leer.');
  return created;
}

export async function payInstallment(
  communityId: string,
  recordedBy: string | null,
  input: { installmentId: string; paidAt: string; method: string; reference?: string },
) {
  if (!DATE_PATTERN.test(input.paidAt)) {
    throw new BillingError('bad_date', 'Indica la fecha de pago en formato AAAA-MM-DD.');
  }
  const admin = getSupabaseAdmin();
  const { data: installment } = await admin
    .from('payment_agreement_installments')
    .select('id, agreement_id, amount, status, sequence_number, payment_agreements!inner(id, unit_id, title, status, community_id)')
    .eq('id', input.installmentId)
    .eq('community_id', communityId)
    .maybeSingle();
  const agreement = Array.isArray(installment?.payment_agreements)
    ? installment?.payment_agreements[0]
    : installment?.payment_agreements;
  if (!installment || !agreement) throw new BillingError('not_found', 'Esa cuota no existe.', 404);
  if (agreement.status !== 'active') throw new BillingError('closed', 'Ese convenio ya no está activo.');
  if (installment.status === 'paid') throw new BillingError('already_paid', 'Esa cuota ya está pagada.');

  const reference = input.reference?.trim() || `convenio-${installment.id.slice(0, 8)}-${installment.sequence_number}`;
  let paymentId: string;
  try {
    const payment = await recordPayment(communityId, recordedBy, {
      unitId: agreement.unit_id,
      amount: installment.amount,
      paidAt: input.paidAt,
      method: input.method || 'transfer',
      reference,
      notes: `Cuota ${installment.sequence_number} del convenio «${agreement.title}».`,
    });
    paymentId = payment.id;
  } catch (error) {
    if (!(error instanceof BillingError) || error.code !== 'duplicate_reference') throw error;
    const { data: existing } = await admin
      .from('unit_payments')
      .select('id')
      .eq('community_id', communityId)
      .eq('unit_id', agreement.unit_id)
      .eq('reference', reference)
      .maybeSingle();
    if (!existing?.id) throw error;
    paymentId = String(existing.id);
  }

  await admin
    .from('payment_agreement_installments')
    .update({ status: 'paid', paid_at: input.paidAt, payment_id: paymentId })
    .eq('id', installment.id);

  const { data: pending } = await admin
    .from('payment_agreement_installments')
    .select('id')
    .eq('agreement_id', agreement.id)
    .eq('status', 'pending');
  if (!pending?.length) {
    await admin
      .from('payment_agreements')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', agreement.id);
  } else {
    await admin
      .from('payment_agreements')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', agreement.id);
  }

  await postJournalEntry(communityId, recordedBy, {
    entryDate: input.paidAt,
    memo: `Cuota ${installment.sequence_number} · ${agreement.title}`,
    source: 'agreement',
    lines: [
      { code: '1100', debit: installment.amount, credit: 0 },
      { code: '4100', debit: 0, credit: installment.amount },
    ],
  }).catch(() => undefined);

  return { paymentId };
}

export async function cancelAgreement(communityId: string, agreementId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('payment_agreements')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', agreementId)
    .eq('community_id', communityId)
    .eq('status', 'active')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BillingError('not_found', 'No hay un convenio activo con ese identificador.', 404);
  return data;
}
