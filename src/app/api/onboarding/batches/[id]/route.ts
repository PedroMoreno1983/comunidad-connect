import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { assessResidents, extractResidentsFromBuffer, residentDedupeKey } from '@/lib/onboarding/documentExtractor';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const { id } = await context.params;
    const admin = getSupabaseAdmin();
    const [{ data: batch, error }, { data: documents }, { data: rows }] = await Promise.all([
        admin.from('onboarding_import_batches').select('*').eq('id', id).eq('community_id', profile.community_id).maybeSingle(),
        admin.from('onboarding_import_documents').select('id, file_name, document_kind, summary, status, extracted_rows, error, size_bytes, created_at').eq('batch_id', id).eq('community_id', profile.community_id).order('created_at'),
        admin.from('onboarding_import_rows').select('id, name, unit_number, email, phone, status, warnings, error, document_id').eq('batch_id', id).eq('community_id', profile.community_id).order('created_at'),
    ]);
    if (error || !batch) return NextResponse.json({ error: 'Lote no encontrado.' }, { status: 404 });
    return NextResponse.json({
        batch, documents: documents || [],
        data: (rows || []).map(row => ({ id: row.id, name: row.name, unit_id: row.unit_number, email: row.email, phone: row.phone, status: row.status, warnings: row.warnings, error: row.error, documentId: row.document_id })),
    });
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const body = await request.json().catch(() => ({})) as { action?: string };
    if (body.action !== 'retry_failed') return NextResponse.json({ error: 'Accion no soportada.' }, { status: 400 });
    const { id } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: batch } = await admin.from('onboarding_import_batches').select('id').eq('id', id).eq('community_id', profile.community_id).maybeSingle();
    if (!batch) return NextResponse.json({ error: 'Lote no encontrado.' }, { status: 404 });
    const { data: failedDocuments, error } = await admin.from('onboarding_import_documents')
        .select('id, file_name, storage_path, mime_type').eq('batch_id', id).eq('community_id', profile.community_id).eq('status', 'failed');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    let recovered = 0;
    for (const document of failedDocuments || []) {
        try {
            const { data: stored, error: downloadError } = await admin.storage.from('onboarding-documents').download(document.storage_path);
            if (downloadError || !stored) throw downloadError || new Error('No se pudo recuperar el original.');
            const extraction = await extractResidentsFromBuffer(document.file_name, document.mime_type || '', Buffer.from(await stored.arrayBuffer()), {
                userId: profile.id, communityId: profile.community_id, role: profile.role,
            });
            const rows = extraction.rows.map((row, index) => ({
                batch_id: id, document_id: document.id, community_id: profile.community_id, row_index: index,
                name: row.name, unit_number: row.unit_id, email: row.email, phone: row.phone,
                dedupe_key: residentDedupeKey(row), status: 'staged', warnings: [], raw_data: row,
            }));
            if (rows.length) {
                const { error: rowsError } = await admin.from('onboarding_import_rows').upsert(rows, { onConflict: 'batch_id,dedupe_key', ignoreDuplicates: true });
                if (rowsError) throw rowsError;
            }
            await admin.from('onboarding_import_documents').update({
                status: 'extracted', extracted_rows: rows.length, checksum: extraction.checksum,
                document_kind: extraction.knowledge.documentKind, summary: extraction.knowledge.summary,
                search_text: extraction.knowledge.searchText, error: null, updated_at: new Date().toISOString(),
            }).eq('id', document.id);
            recovered++;
        } catch (retryError) {
            await admin.from('onboarding_import_documents').update({ error: retryError instanceof Error ? retryError.message : 'Reintento fallido.', updated_at: new Date().toISOString() }).eq('id', document.id);
        }
    }
    const { data: storedRows } = await admin.from('onboarding_import_rows').select('id, name, unit_number, email, phone').eq('batch_id', id).order('created_at');
    const normalized = (storedRows || []).map(row => ({ name: row.name, unit_id: row.unit_number, email: row.email, phone: row.phone }));
    const assessment = assessResidents(normalized);
    const remaining = Math.max(0, (failedDocuments || []).length - recovered);
    const warnings = [...assessment.warnings, ...(remaining ? [`${remaining} documento(s) siguen con error.`] : [])];
    await admin.from('onboarding_import_batches').update({
        status: storedRows?.length ? 'review' : 'failed', row_count: storedRows?.length || 0,
        valid_row_count: assessment.validRows, warning_count: warnings.length, warnings, updated_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({
        recovered, remaining, assessment: { ...assessment, warnings },
        data: (storedRows || []).map(row => ({ id: row.id, name: row.name, unit_id: row.unit_number, email: row.email, phone: row.phone })),
    });
}
