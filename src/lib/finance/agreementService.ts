import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { BillingError, DATE_PATTERN } from './billingService';
import { PAYMENT_METHODS, reconcileUnitStatuses } from './collectionService';
import { agreementDueDates, splitInstallments } from './operationalFlows';
import { AGREEMENT_SIGNED_ADMIN_COPY, AGREEMENT_SIGNING_COPY } from './agreementCopy';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { activeCommitteeMembers, requireActiveCommitteeMember } from './committeeMembers';
import { recordOperationEvent } from '@/lib/operations/audit';

function unitLabel(row: { number?: unknown; tower?: unknown }) {
  const number = String(row.number ?? '');
  const tower = String(row.tower ?? '');
  return tower && tower !== 'A' ? `${tower}-${number}` : number;
}

async function loadAgreements(communityId: string, unitIds?: string[], reviewerId?: string) {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('payment_agreements')
    .select('id, unit_id, title, total_amount, installment_count, status, notes, created_at, committee_reviewer_id, committee_reviewed_at, committee_review_note, units(number, tower), payment_agreement_installments(id, sequence_number, due_date, amount, status, paid_at)')
    .eq('community_id', communityId)
    .order('created_at', { ascending: false });
  if (unitIds) query = query.in('unit_id', unitIds);
  if (reviewerId) query = query.eq('committee_reviewer_id', reviewerId);
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
      committeeReviewerId: row.committee_reviewer_id,
      committeeReviewedAt: row.committee_reviewed_at,
      committeeReviewNote: row.committee_review_note,
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

export async function listAgreementsForReviewer(communityId: string, reviewerId: string) {
  return loadAgreements(communityId, undefined, reviewerId);
}

export async function createAgreement(
  communityId: string,
  createdBy: string | null,
  input: { unitId: string; title: string; totalAmount: number; installmentCount: number; notes?: string; reviewerId?: string },
) {
  const title = input.title.trim().slice(0, 140);
  if (!title) throw new BillingError('bad_label', 'El convenio necesita un título.');
  // La primera cuota vence el día de la firma. Sin comité, el convenio queda
  // firmado (vigente) hoy. Con comité, estas fechas son provisorias: se vuelven
  // a calcular el día en que el comité lo aprueba (`decideAgreementReview`).
  const installments = splitInstallments(input.totalAmount, input.installmentCount, chileTodayISO());
  const admin = getSupabaseAdmin();
  const { data: unit } = await admin
    .from('units')
    .select('id, owner_id, number, tower')
    .eq('id', input.unitId)
    .eq('community_id', communityId)
    .maybeSingle();
  if (!unit) throw new BillingError('unit_not_found', 'Esa unidad no existe en tu comunidad.', 404);

  const committee = await activeCommitteeMembers(communityId);
  if (committee.length > 0 && (!input.reviewerId || !committee.some(member => member.id === input.reviewerId))) {
    throw new BillingError('committee_reviewer_required', 'Selecciona un integrante vigente del comité para revisar el convenio.', 409);
  }
  const pendingCommittee = committee.length > 0;

  const { data: existing } = await admin
    .from('payment_agreements')
    .select('id')
    .eq('community_id', communityId)
    .eq('unit_id', input.unitId)
    .in('status', ['active', 'pending_committee'])
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
      status: pendingCommittee ? 'pending_committee' : 'active',
      committee_reviewer_id: pendingCommittee ? input.reviewerId : null,
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

  if (pendingCommittee && input.reviewerId) {
    await admin.from('notifications').insert({
      user_id: input.reviewerId, type: 'warning', category: 'finance_agreement',
      title: 'Revisa un convenio de pago', body: `La administración propone el convenio «${title}».`,
      link: '/expenses/committee-review', community_id: communityId,
    }).then(() => undefined, () => undefined);
  } else if (unit.owner_id) {
    await admin.from('notifications').insert({
      user_id: String(unit.owner_id),
      type: 'info',
      category: 'finance_agreement',
      title: 'Tu convenio de pago está vigente',
      body: `La administración abrió el convenio «${title}» en ${installments.length} cuotas y hoy quedó firmado. ${AGREEMENT_SIGNING_COPY}`,
      link: '/expenses',
      community_id: communityId,
    }).then(() => undefined, () => undefined);
  }

  const [created] = await loadAgreements(communityId, [input.unitId]);
  if (!created) throw new Error('El convenio se guardó, pero no se pudo volver a leer.');
  return created;
}

/**
 * El convenio con comité se firma el día en que el comité lo aprueba: ahí vence
 * la primera cuota y desde ahí corren las siguientes (`agreementDueDates`). Se
 * hace ANTES de pasar el convenio a `active`: si falla, no se aprueba con las
 * fechas provisorias (que dejarían la primera cuota vencida desde el inicio).
 */
async function redateOnSigning(communityId: string, reviewerId: string, agreementId: string, signedOn: string) {
  const admin = getSupabaseAdmin();
  const { data: agreement, error } = await admin.from('payment_agreements')
    .select('id, payment_agreement_installments(id, sequence_number, status)')
    .eq('id', agreementId).eq('community_id', communityId).eq('committee_reviewer_id', reviewerId)
    .eq('status', 'pending_committee').maybeSingle();
  if (error) throw error;
  if (!agreement) throw new BillingError('review_not_found', 'El convenio no está pendiente para tu revisión.', 409);
  const lines = [...(agreement.payment_agreement_installments || [])].sort((a, b) => a.sequence_number - b.sequence_number);
  const dueDates = agreementDueDates(signedOn, lines.length);
  for (const [index, line] of lines.entries()) {
    const { error: lineError } = await admin.from('payment_agreement_installments')
      .update({ due_date: dueDates[index] })
      .eq('id', line.id).eq('agreement_id', agreementId).eq('community_id', communityId).eq('status', 'pending');
    if (lineError) throw lineError;
  }
}

export async function decideAgreementReview(
  communityId: string, reviewerId: string, agreementId: string,
  decision: 'approved' | 'rejected', note: string,
) {
  await requireActiveCommitteeMember(communityId, reviewerId);
  if (decision === 'rejected' && !note.trim()) throw new BillingError('missing_reason', 'Indica por qué rechazas el convenio.');
  const admin = getSupabaseAdmin();
  const status = decision === 'approved' ? 'active' : 'rejected';
  if (decision === 'approved') await redateOnSigning(communityId, reviewerId, agreementId, chileTodayISO());
  const { data, error } = await admin.from('payment_agreements').update({
    status, committee_reviewed_at: new Date().toISOString(),
    committee_review_note: note.trim().slice(0, 1000) || null, updated_at: new Date().toISOString(),
  }).eq('id', agreementId).eq('community_id', communityId).eq('committee_reviewer_id', reviewerId)
    .eq('status', 'pending_committee').select('id, unit_id, title, created_by').maybeSingle();
  if (error) throw error;
  if (!data) throw new BillingError('review_not_found', 'El convenio no está pendiente para tu revisión.', 409);
  const { data: unit } = await admin.from('units').select('owner_id').eq('id', data.unit_id).eq('community_id', communityId).maybeSingle();
  const recipients = [data.created_by, ...(decision === 'approved' ? [unit?.owner_id] : [])].filter((id): id is string => typeof id === 'string');
  for (const recipient of new Set(recipients)) {
    await admin.from('notifications').insert({ community_id: communityId, user_id: recipient,
      type: decision === 'approved' ? 'success' : 'warning', category: 'finance_agreement',
      title: `Convenio ${decision === 'approved' ? 'aprobado' : 'rechazado'}`,
      body: decision === 'approved'
        ? `El comité aprobó «${data.title}» y hoy quedó firmado. ${recipient === data.created_by ? AGREEMENT_SIGNED_ADMIN_COPY : AGREEMENT_SIGNING_COPY}`
        : `El comité rechazó «${data.title}».`,
      link: recipient === data.created_by ? '/admin/finanzas/convenios' : '/expenses',
    }).then(() => undefined, () => undefined);
  }
  await recordOperationEvent({ communityId, actorId: reviewerId, actorRole: 'resident',
    action: `finance.agreement_${decision}`, entityType: 'payment_agreement', entityId: agreementId,
    summary: `Convenio «${data.title}» ${decision === 'approved' ? 'aprobado' : 'rechazado'} por el comité`,
    metadata: { decision, note: note.trim().slice(0, 1000) },
  });
  return { id: data.id, status };
}

export async function payInstallment(
  communityId: string,
  recordedBy: string | null,
  input: { installmentId: string; paidAt: string; method: string; reference?: string },
) {
  if (!DATE_PATTERN.test(input.paidAt)) {
    throw new BillingError('bad_date', 'Indica la fecha de pago en formato AAAA-MM-DD.');
  }
  if (!PAYMENT_METHODS.has(input.method || 'transfer')) {
    throw new BillingError('bad_method', 'Medio de pago no válido.');
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

  await reconcileUnitStatuses(communityId, agreement.unit_id);
  const { data, error } = await admin.rpc('pay_agreement_installment_atomic', {
    p_community_id: communityId,
    p_installment_id: input.installmentId,
    p_paid_at: input.paidAt,
    p_method: input.method || 'transfer',
    p_reference: input.reference?.trim() || '',
    p_recorded_by: recordedBy,
  });
  if (error?.code === '23505') throw new BillingError('duplicate_reference', 'Ya existe un pago con esa referencia para la unidad.', 409);
  if (error) throw error;
  const outcome = data as { status?: string; paymentId?: string } | null;
  if (outcome?.status === 'not_found') throw new BillingError('not_found', 'Esa cuota no existe.', 404);
  if (outcome?.status === 'closed') throw new BillingError('closed', 'Ese convenio ya no está activo.', 409);
  if (outcome?.status === 'already_paid') throw new BillingError('already_paid', 'Esa cuota ya está pagada.', 409);
  if (outcome?.status !== 'paid' || !outcome.paymentId) throw new BillingError('payment_failed', 'No se pudo confirmar el pago de la cuota.', 500);

  const warnings: string[] = [];
  try {
    await reconcileUnitStatuses(communityId, agreement.unit_id);
  } catch {
    warnings.push('El pago y su asiento se guardaron, pero la actualización de saldos quedó pendiente. Revisa la cartola de la unidad.');
  }
  const { data: unit } = await admin.from('units').select('owner_id')
    .eq('id', agreement.unit_id).eq('community_id', communityId).maybeSingle();
  if (unit?.owner_id) {
    await admin.from('notifications').insert({
      user_id: String(unit.owner_id), type: 'success', category: 'finance_payment',
      title: 'Pago registrado',
      body: `La administración registró tu pago de $${Number(installment.amount).toLocaleString('es-CL')} con fecha ${input.paidAt}.`,
      link: '/resident/finances', community_id: communityId,
    }).then(() => undefined, () => undefined);
  }
  return { paymentId: outcome.paymentId, warnings };
}

export async function cancelAgreement(communityId: string, agreementId: string) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from('payment_agreements')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', agreementId)
    .eq('community_id', communityId)
    .in('status', ['active', 'pending_committee'])
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new BillingError('not_found', 'No hay un convenio abierto con ese identificador.', 404);
  return data;
}
