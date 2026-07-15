import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { assessResidents, extractResidentsFromBuffer, MAX_ONBOARDING_BATCH_BYTES, MAX_ONBOARDING_BATCH_FILES, MAX_ONBOARDING_FILE_BYTES, residentDedupeKey, type ExtractedResident } from '@/lib/onboarding/documentExtractor';
import { getRequestId, recordOperationEvent } from '@/lib/operations/audit';
import { enforceRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function safeName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'documento';
}

function rowPayload(row: ExtractedResident, index: number, batchId: string, documentId: string, communityId: string) {
    const warnings: string[] = [];
    if (!row.name) warnings.push('Falta nombre.');
    if (!row.unit_id) warnings.push('Falta unidad.');
    if (!row.email && !row.phone) warnings.push('Falta contacto.');
    return {
        batch_id: batchId, document_id: documentId, community_id: communityId, row_index: index,
        name: row.name, unit_number: row.unit_id, email: row.email, phone: row.phone,
        dedupe_key: residentDedupeKey(row), status: 'staged', warnings, raw_data: row,
    };
}

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const { data, error } = await getSupabaseAdmin().from('onboarding_import_batches')
        .select('id, source, status, document_count, row_count, valid_row_count, warning_count, created_at, updated_at')
        .eq('community_id', profile.community_id).order('created_at', { ascending: false }).limit(20);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ batches: data || [] });
}

export async function POST(request: Request) {
    const limited = enforceRateLimit(request, 'onboarding.batch', { limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const admin = getSupabaseAdmin();
    let batchId = '';
    try {
        const formData = await request.formData();
        const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
        if (!files.length) return NextResponse.json({ error: 'Selecciona al menos un documento.' }, { status: 400 });
        if (files.length > MAX_ONBOARDING_BATCH_FILES) return NextResponse.json({ error: `Maximo ${MAX_ONBOARDING_BATCH_FILES} documentos por lote.` }, { status: 413 });
        if (files.some(file => file.size > MAX_ONBOARDING_FILE_BYTES)) return NextResponse.json({ error: 'Cada documento debe pesar hasta 10 MB.' }, { status: 413 });
        if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ONBOARDING_BATCH_BYTES) return NextResponse.json({ error: 'El lote completo debe pesar hasta 50 MB.' }, { status: 413 });
        const source = formData.get('source') === 'agent_center' ? 'agent_center' : 'admin_onboarding';
        const { data: batch, error: batchError } = await admin.from('onboarding_import_batches').insert({
            community_id: profile.community_id, created_by: profile.id, source, status: 'processing', document_count: files.length,
        }).select('id').single();
        if (batchError || !batch) throw batchError || new Error('No se pudo crear el lote.');
        batchId = String(batch.id);

        const documentResults: Array<{ id: string; fileName: string; status: string; rows: number; error?: string }> = [];
        const seenChecksums = new Set<string>();
        for (const file of files) {
            const documentId = randomUUID();
            const buffer = Buffer.from(await file.arrayBuffer());
            const storagePath = `${profile.community_id}/${batchId}/${documentId}/${safeName(file.name)}`;
            const { error: uploadError } = await admin.storage.from('onboarding-documents').upload(storagePath, buffer, { contentType: file.type || undefined, upsert: false });
            if (uploadError) throw uploadError;
            const { error: documentError } = await admin.from('onboarding_import_documents').insert({
                id: documentId, batch_id: batchId, community_id: profile.community_id, file_name: file.name,
                storage_path: storagePath, mime_type: file.type || null, size_bytes: file.size, status: 'processing',
            });
            if (documentError) {
                await admin.storage.from('onboarding-documents').remove([storagePath]);
                throw documentError;
            }
            try {
                const extraction = await extractResidentsFromBuffer(file.name, file.type, buffer, {
                    userId: profile.id, communityId: profile.community_id, role: profile.role,
                });
                if (seenChecksums.has(extraction.checksum)) {
                    await admin.from('onboarding_import_documents').update({ status: 'extracted', checksum: extraction.checksum, extracted_rows: 0, error: 'Documento duplicado dentro del lote.' }).eq('id', documentId);
                    documentResults.push({ id: documentId, fileName: file.name, status: 'duplicate', rows: 0 });
                    continue;
                }
                seenChecksums.add(extraction.checksum);
                const payload = extraction.rows.map((row, index) => rowPayload(row, index, batchId, documentId, profile.community_id!));
                if (payload.length) {
                    const { error: rowsError } = await admin.from('onboarding_import_rows').upsert(payload, { onConflict: 'batch_id,dedupe_key', ignoreDuplicates: true });
                    if (rowsError) throw rowsError;
                }
                await admin.from('onboarding_import_documents').update({
                    status: 'extracted', checksum: extraction.checksum, extracted_rows: extraction.rows.length,
                    document_kind: extraction.knowledge.documentKind, summary: extraction.knowledge.summary,
                    search_text: extraction.knowledge.searchText, error: null, updated_at: new Date().toISOString(),
                }).eq('id', documentId);
                documentResults.push({ id: documentId, fileName: file.name, status: 'extracted', rows: extraction.rows.length });
            } catch (error) {
                const message = error instanceof Error ? error.message : 'No se pudo procesar el documento.';
                await admin.from('onboarding_import_documents').update({ status: 'failed', error: message, updated_at: new Date().toISOString() }).eq('id', documentId);
                documentResults.push({ id: documentId, fileName: file.name, status: 'failed', rows: 0, error: message });
            }
        }

        const { data: storedRows, error: rowsReadError } = await admin.from('onboarding_import_rows')
            .select('id, name, unit_number, email, phone, status, warnings, document_id').eq('batch_id', batchId).order('created_at');
        if (rowsReadError) throw rowsReadError;
        const normalizedRows = (storedRows || []).map(row => ({ name: row.name, unit_id: row.unit_number, email: row.email, phone: row.phone }));
        const assessment = assessResidents(normalizedRows);
        const failedDocuments = documentResults.filter(item => item.status === 'failed').length;
        const warnings = [...assessment.warnings];
        if (failedDocuments) warnings.push(`${failedDocuments} documento(s) no pudieron procesarse y pueden reintentarse.`);
        const status = storedRows?.length ? 'review' : 'failed';
        await admin.from('onboarding_import_batches').update({
            status, row_count: storedRows?.length || 0, valid_row_count: assessment.validRows,
            warning_count: warnings.length, warnings, updated_at: new Date().toISOString(),
        }).eq('id', batchId);
        await recordOperationEvent({
            communityId: profile.community_id, actorId: profile.id, actorRole: profile.role,
            action: 'onboarding.batch_extracted', entityType: 'onboarding_import_batch', entityId: batchId,
            severity: warnings.length ? 'warning' : 'success', status: warnings.length ? 'pending' : 'success',
            summary: `Lote procesado: ${files.length} documento(s), ${assessment.validRows} fila(s) listas`,
            metadata: { source, documents: documentResults, assessment, warnings }, requestId: getRequestId(request),
        });
        return NextResponse.json({ batchId, status, data: (storedRows || []).map(row => ({ id: row.id, name: row.name, unit_id: row.unit_number, email: row.email, phone: row.phone })), assessment: { ...assessment, warnings }, documents: documentResults });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo procesar el lote.';
        if (batchId) await admin.from('onboarding_import_batches').update({ status: 'failed', warnings: [message], updated_at: new Date().toISOString() }).eq('id', batchId);
        console.error('[OnboardingBatch]', error);
        return NextResponse.json({ error: message, batchId: batchId || null }, { status: 500 });
    }
}
