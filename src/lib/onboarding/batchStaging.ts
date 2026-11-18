import 'server-only';

import { randomUUID } from 'node:crypto';
import { assessResidents, extractResidentsFromBuffer, residentDedupeKey } from '@/lib/onboarding/documentExtractor';
import type { OnboardingBatchDocumentResult } from '@/lib/types';
import type { ExtractedResidentWithRights, OnboardingRightsExtractResponse, OnboardingRightsMeta } from '@/lib/onboarding/types';
import { rightsFromRawData } from '@/lib/onboarding/unitRightsImport';
import { recordOperationEvent } from '@/lib/operations/audit';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function safeName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120) || 'documento';
}

function rowPayload(row: ExtractedResidentWithRights, index: number, batchId: string, documentId: string, communityId: string) {
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

/** Un archivo ya leído, para dejar sus residentes en revisión (pantalla o CoCo). */
export interface StageFile { name: string; type: string; size: number; bytes: Buffer }

export type StageResult = { status: number; payload: OnboardingRightsExtractResponse | { error: string; batchId?: string | null } };

/**
 * Extrae los residentes de los archivos y los deja en un lote en revisión. La
 * usan Admin › Onboarding y CoCo (preview_resident_import).
 */
export async function stageResidentBatch(profile: { id: string; role: string; community_id: string }, files: StageFile[], source: 'admin_onboarding' | 'agent_center', requestId: string | null = null): Promise<StageResult> {
    const admin = getSupabaseAdmin();
    let batchId = '';
    try {
        const { data: batch, error: batchError } = await admin.from('onboarding_import_batches').insert({
            community_id: profile.community_id, created_by: profile.id, source, status: 'processing', document_count: files.length,
        }).select('id').single();
        if (batchError || !batch) throw batchError || new Error('No se pudo crear el lote.');
        batchId = String(batch.id);

        const documentResults: OnboardingBatchDocumentResult[] = [];
        const seenChecksums = new Set<string>();
        let rightsMeta: OnboardingRightsMeta | null = null;
        for (const file of files) {
            const documentId = randomUUID();
            const buffer = file.bytes;
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
                if (extraction.rights && !rightsMeta) rightsMeta = extraction.rights;
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
            .select('id, name, unit_number, email, phone, status, warnings, document_id, raw_data').eq('batch_id', batchId).order('created_at');
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
            metadata: { source, documents: documentResults, assessment, warnings }, requestId,
        });
        const payload: OnboardingRightsExtractResponse = {
            batchId, status, assessment: { ...assessment, warnings }, documents: documentResults, rights: rightsMeta,
            data: (storedRows || []).map(row => ({
                id: String(row.id), name: row.name ?? '', unit_id: row.unit_number ?? '',
                email: row.email ?? '', phone: row.phone ?? '', derechos_porcentaje: rightsFromRawData(row.raw_data),
            })),
        };
        return { status: 200, payload };
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo procesar el lote.';
        if (batchId) await admin.from('onboarding_import_batches').update({ status: 'failed', warnings: [message], updated_at: new Date().toISOString() }).eq('id', batchId);
        console.error('[OnboardingBatch]', error);
        return { status: 500, payload: { error: 'No se pudo procesar el lote.', batchId: batchId || null } };
    }
}
