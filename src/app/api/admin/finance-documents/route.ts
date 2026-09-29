import { createHash, randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { BillingError, addCommunityExpense } from '@/lib/finance/billingService';
import { extractExpenseDocument } from '@/lib/finance/expenseDocumentExtractor';

export const runtime = 'nodejs';
const BUCKET = 'finance-documents';
const MIME_BY_EXTENSION: Record<string, string> = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    txt: 'text/plain',
    csv: 'text/csv',
};
const ALLOWED = new Set(Object.keys(MIME_BY_EXTENSION));

export async function POST(req: NextRequest) {
    const limited = await enforceDistributedRateLimit(req, 'admin.finance_documents', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración puede cargar respaldos.' }, { status: 403 });
    }
    try {
        const form = await req.formData();
        const file = form.get('file');
        if (!(file instanceof File)) throw new BillingError('missing_file', 'Selecciona un respaldo.');
        const extension = file.name.toLowerCase().split('.').pop() || '';
        if (!ALLOWED.has(extension)) throw new BillingError('bad_file', 'Formato de respaldo no soportado.');
        if (file.size === 0 || file.size > 10 * 1024 * 1024) throw new BillingError('bad_size', 'El archivo debe tener entre 1 byte y 10 MB.');
        const action = String(form.get('action') || 'extract');
        if (action === 'extract') {
            const draft = await extractExpenseDocument(file, { userId: profile.id, communityId: profile.community_id });
            return NextResponse.json({ draft });
        }
        if (action !== 'save') throw new BillingError('bad_action', 'Acción no reconocida.');
        const bytes = Buffer.from(await file.arrayBuffer());
        const checksum = createHash('sha256').update(bytes).digest('hex');
        const admin = getSupabaseAdmin();
        const { data: duplicate, error: duplicateError } = await admin.from('community_expenses').select('id')
            .eq('community_id', profile.community_id).eq('document_sha256', checksum).limit(1).maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) throw new BillingError('duplicate_document', 'Este respaldo ya está asociado a un egreso de la comunidad.', 409);
        const path = `${profile.community_id}/${randomUUID()}.${extension}`;
        const { error: uploadError } = await admin.storage.from(BUCKET).upload(path, bytes, {
            contentType: MIME_BY_EXTENSION[extension], upsert: false,
        });
        if (uploadError) throw uploadError;
        try {
            const expense = await addCommunityExpense(profile.community_id, profile.id, {
                month: String(form.get('month') || ''), label: String(form.get('label') || ''),
                amount: Number(form.get('amount')), category: String(form.get('category') || 'other'),
                provider: String(form.get('provider') || ''),
                notes: [String(form.get('documentDate') || ''), String(form.get('documentNumber') || '')]
                    .filter(Boolean).join(' · ').slice(0, 500),
                prorateMethod: form.get('prorateMethod') === 'equal' ? 'equal' : 'share',
                documentPath: path, documentSha256: checksum,
            });
            return NextResponse.json({ expense }, { status: 201 });
        } catch (error) {
            await admin.storage.from(BUCKET).remove([path]);
            throw error;
        }
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo procesar el respaldo.' }, {
            status: error instanceof BillingError ? error.status : 500,
        });
    }
}
