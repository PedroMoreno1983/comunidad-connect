import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { recordOperationEvent } from '@/lib/operations/audit';
import type { FinanceCommitteeReview, FinanceCommitteeResidentOption, FinanceCommitteeReviewSnapshot } from '@/lib/types';
import { BillingError, DATE_PATTERN, MONTH_PATTERN, previewBilling, type BillingQuota } from './billingService';
import { committeeReviewDigest, committeeReviewSnapshot, sourceExpenseSnapshot } from './committeeReviewDigest';

type ReviewRow = {
    id: string; community_id: string; month: string; reviewer_id: string; requested_by: string;
    status: 'pending' | 'approved' | 'rejected'; due_date: string;
    quota_amount: number | null; quota_method: 'share' | 'equal' | null;
    requested_at: string; reviewed_at: string | null; review_note: string | null;
    snapshot_digest: string; snapshot: FinanceCommitteeReviewSnapshot;
};

function normalizeQuota(amount: unknown, method: unknown): BillingQuota | null {
    if (amount === null || amount === undefined || amount === '' || Number(amount) === 0) return null;
    const rounded = Math.round(Number(amount));
    if (!Number.isFinite(rounded) || rounded <= 0) throw new BillingError('bad_quota', 'La cuota fija debe ser mayor que cero.');
    return { amount: rounded, method: method === 'equal' ? 'equal' : 'share' };
}

async function sourceExpenses(communityId: string, month: string): Promise<FinanceCommitteeReviewSnapshot['sourceExpenses']> {
    const { data, error } = await getSupabaseAdmin().from('community_expenses')
        .select('id, label, category, amount, document_url, document_sha256')
        .eq('community_id', communityId).eq('month', month);
    if (error) throw error;
    return sourceExpenseSnapshot(data ?? []);
}

function mapReview(row: ReviewRow, reviewerName = ''): FinanceCommitteeReview {
    return {
        id: row.id, communityId: row.community_id, month: row.month,
        reviewerId: row.reviewer_id, reviewerName, requestedBy: row.requested_by,
        status: row.status, dueDate: row.due_date,
        quotaAmount: row.quota_amount === null ? null : Number(row.quota_amount),
        quotaMethod: row.quota_method, requestedAt: row.requested_at,
        reviewedAt: row.reviewed_at, reviewNote: row.review_note, snapshot: row.snapshot,
    };
}

async function latestReview(communityId: string, month: string): Promise<ReviewRow | null> {
    const { data, error } = await getSupabaseAdmin().from('finance_committee_reviews').select('*')
        .eq('community_id', communityId).eq('month', month)
        .order('requested_at', { ascending: false }).order('id', { ascending: false })
        .limit(1).maybeSingle();
    if (error) throw error;
    return data as ReviewRow | null;
}

async function reviewerName(id: string): Promise<string> {
    const { data, error } = await getSupabaseAdmin().from('profiles').select('name, email').eq('id', id).maybeSingle();
    if (error) throw error;
    return String(data?.name || data?.email || 'Residente');
}

export async function adminCommitteeReview(communityId: string, month: string, adminId: string) {
    if (!MONTH_PATTERN.test(month)) throw new BillingError('bad_month', 'Indica un mes válido.');
    const admin = getSupabaseAdmin();
    const [{ data: residents, error }, review] = await Promise.all([
        admin.from('profiles').select('id, name, email').eq('community_id', communityId).eq('role', 'resident').neq('id', adminId).order('name'),
        latestReview(communityId, month),
    ]);
    if (error) throw error;
    const options: FinanceCommitteeResidentOption[] = (residents ?? []).map(row => ({
        id: String(row.id), name: String(row.name || row.email || 'Residente'), email: String(row.email || ''),
    }));
    return { reviewers: options, review: review ? mapReview(review, options.find(option => option.id === review.reviewer_id)?.name || await reviewerName(review.reviewer_id)) : null };
}

export async function requestCommitteeReview(
    communityId: string, adminId: string,
    input: { month: string; dueDate: string; reviewerId: string; quotaAmount?: unknown; quotaMethod?: unknown },
) {
    if (!MONTH_PATTERN.test(input.month)) throw new BillingError('bad_month', 'Indica un mes válido.');
    if (!DATE_PATTERN.test(input.dueDate) || Number.isNaN(Date.parse(`${input.dueDate}T00:00:00Z`))) {
        throw new BillingError('bad_due_date', 'Indica una fecha de vencimiento válida.');
    }
    if (input.reviewerId === adminId) throw new BillingError('same_reviewer', 'El revisor debe ser otra persona.');
    const admin = getSupabaseAdmin();
    const { data: reviewer, error: reviewerError } = await admin.from('profiles').select('id, name, email, role')
        .eq('community_id', communityId).eq('id', input.reviewerId).maybeSingle();
    if (reviewerError) throw reviewerError;
    if (!reviewer || reviewer.role !== 'resident') throw new BillingError('bad_reviewer', 'Selecciona un residente de esta comunidad.', 403);
    const quota = normalizeQuota(input.quotaAmount, input.quotaMethod);
    const preview = await previewBilling(communityId, input.month, { quota });
    const sources = await sourceExpenses(communityId, input.month);
    if (preview.issuedRun) throw new BillingError('already_issued', 'Este mes ya fue emitido.', 409);
    if (preview.totalCharged <= 0 || preview.totalCharged !== preview.totalExpenses) {
        throw new BillingError('invalid_preview', 'El reparto debe tener un monto positivo y cuadrar antes de enviarse a revisión.', 409);
    }
    const { data, error } = await admin.from('finance_committee_reviews').insert({
        community_id: communityId, month: input.month, reviewer_id: reviewer.id, requested_by: adminId,
        due_date: input.dueDate, quota_amount: quota?.amount ?? null, quota_method: quota?.method ?? null,
        snapshot_digest: committeeReviewDigest(input.month, input.dueDate, quota, preview, sources),
        snapshot: committeeReviewSnapshot(preview, sources),
    }).select('*').single();
    if (error) throw error;
    const review = mapReview(data as ReviewRow, String(reviewer.name || reviewer.email || 'Residente'));
    const warnings: string[] = [];
    const { error: noticeError } = await admin.from('notifications').insert({
        community_id: communityId, user_id: reviewer.id, type: 'warning', category: 'finance_charge',
        title: `Revisa el gasto común de ${input.month}`,
        body: 'La administración te designó para revisar el prorrateo antes de emitirlo.',
        link: '/expenses/committee-review',
    });
    if (noticeError) warnings.push('La solicitud quedó guardada, pero no se pudo crear el aviso. Comparte el enlace de revisión con la persona designada.');
    const audit = await recordOperationEvent({ communityId, actorId: adminId, actorRole: 'admin',
        action: 'billing.committee_review_requested', entityType: 'finance_committee_review', entityId: review.id,
        summary: `Revisión del gasto común ${input.month} solicitada`,
        metadata: { reviewerId: reviewer.id, dueDate: input.dueDate, totalCharged: preview.totalCharged },
    });
    if (!audit.ok) warnings.push('La solicitud quedó guardada, pero falló el registro de auditoría.');
    return { review, warnings };
}

export async function reviewerCommitteeReviews(communityId: string, reviewerId: string) {
    const { data, error } = await getSupabaseAdmin().from('finance_committee_reviews').select('*')
        .eq('community_id', communityId)
        .order('requested_at', { ascending: false }).order('id', { ascending: false }).limit(200);
    if (error) throw error;
    const latestByMonth = new Map<string, ReviewRow>();
    for (const row of (data ?? []) as ReviewRow[]) {
        if (!latestByMonth.has(row.month)) latestByMonth.set(row.month, row);
    }
    return [...latestByMonth.values()].filter(row => row.reviewer_id === reviewerId).map(row => mapReview(row));
}

export async function decideCommitteeReview(
    communityId: string, reviewerId: string, reviewId: string,
    decision: 'approved' | 'rejected', note: string,
) {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.from('finance_committee_reviews').select('*')
        .eq('id', reviewId).eq('community_id', communityId).eq('reviewer_id', reviewerId).maybeSingle();
    if (error) throw error;
    if (!data) throw new BillingError('review_not_found', 'No tienes una revisión asignada con ese identificador.', 404);
    const row = data as ReviewRow;
    const latest = await latestReview(communityId, row.month);
    if (latest?.id !== reviewId || row.status !== 'pending') {
        throw new BillingError('review_superseded', 'Esta revisión ya no está pendiente o fue reemplazada.', 409);
    }
    if (decision === 'rejected' && !note.trim()) throw new BillingError('missing_reason', 'Indica qué debe corregir la administración.');
    if (decision === 'approved') {
        const quota = normalizeQuota(row.quota_amount, row.quota_method);
        const current = await previewBilling(communityId, row.month, { quota });
        const sources = await sourceExpenses(communityId, row.month);
        if (current.issuedRun || committeeReviewDigest(row.month, row.due_date, quota, current, sources) !== row.snapshot_digest) {
            throw new BillingError('review_stale', 'El cálculo cambió desde la solicitud. Pide a la administración una nueva revisión.', 409);
        }
    }
    const { data: updated, error: updateError } = await admin.from('finance_committee_reviews')
        .update({ status: decision, reviewed_at: new Date().toISOString(), review_note: note.trim() || null })
        .eq('id', reviewId).eq('community_id', communityId).eq('reviewer_id', reviewerId).eq('status', 'pending')
        .select('*').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new BillingError('review_conflict', 'La revisión ya fue respondida.', 409);
    const warnings: string[] = [];
    const { error: noticeError } = await admin.from('notifications').insert({
        community_id: communityId, user_id: row.requested_by, type: decision === 'approved' ? 'success' : 'warning',
        category: 'finance_charge', title: `Revisión ${decision === 'approved' ? 'aprobada' : 'rechazada'}: ${row.month}`,
        body: decision === 'approved' ? 'Puedes emitir el gasto común si el cálculo sigue igual.' : note.trim().slice(0, 500),
        link: '/admin/finanzas/egresos',
    });
    if (noticeError) warnings.push('La decisión quedó guardada, pero no se pudo crear el aviso a administración.');
    const audit = await recordOperationEvent({ communityId, actorId: reviewerId, actorRole: 'resident',
        action: `billing.committee_review_${decision}`, entityType: 'finance_committee_review', entityId: reviewId,
        summary: `Revisión del gasto común ${row.month} ${decision === 'approved' ? 'aprobada' : 'rechazada'}`,
        metadata: { month: row.month, note: note.trim().slice(0, 500) },
    });
    if (!audit.ok) warnings.push('La decisión quedó guardada, pero falló el registro de auditoría.');
    return { review: mapReview(updated as ReviewRow), warnings };
}
