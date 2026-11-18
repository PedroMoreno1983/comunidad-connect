import 'server-only';

import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { DOCUMENTS_BUCKET } from '@/lib/coco/communityDocuments';
import { stageResidentBatch } from '@/lib/onboarding/batchStaging';
import { syncResidentRoster } from '@/lib/onboarding/rosterSync';
import { MAX_ONBOARDING_FILE_BYTES } from '@/lib/onboarding/documentExtractor';
import { rightsFromRawData } from '@/lib/onboarding/unitRightsImport';

/**
 * CoCo carga la nómina de residentes desde un archivo que la administración
 * adjuntó al chat (Excel, CSV, PDF o Word). Es la misma carga masiva de
 * Admin › Onboarding: primero deja las filas en revisión y muestra qué
 * encontró; recién con la confirmación crea unidades, perfiles y accesos.
 */

type Admin = { id: string; role: string; communityId: string; name?: string | null };

const MIME: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
};

/** Lee el archivo adjunto y deja sus residentes en un lote en revisión. No crea cuentas. */
export async function previewResidentImport(admin: Admin, input: Record<string, unknown>) {
    if (admin.role !== 'admin') return { error: 'Solo la administración puede cargar residentes.' };
    const documentId = String(input.document_id || '');
    const supabase = getSupabaseAdmin();
    const { data: document } = await supabase.from('community_documents')
        .select('id, file_name, storage_path, uploaded_by')
        .eq('id', documentId).eq('community_id', admin.communityId).maybeSingle();
    if (!document) return { error: 'No encontré ese archivo. Adjunta la nómina en el chat y vuelve a pedírmelo.' };
    const { data: blob, error } = await supabase.storage.from(DOCUMENTS_BUCKET).download(String(document.storage_path));
    if (error || !blob) return { error: 'No pude abrir el archivo adjunto.' };
    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > MAX_ONBOARDING_FILE_BYTES) return { error: 'La nómina debe pesar hasta 10 MB. Si es un PDF escaneado, súbela en Excel o CSV.' };
    const extension = String(document.file_name).split('.').at(-1)?.toLowerCase() || '';

    const result = await stageResidentBatch(
        { id: admin.id, role: admin.role, community_id: admin.communityId },
        [{ name: String(document.file_name), type: MIME[extension] || 'application/octet-stream', size: bytes.length, bytes }],
        'agent_center',
    );
    if (result.status !== 200 || !('batchId' in result.payload) || !('data' in result.payload)) {
        return { error: 'No pude leer residentes en ese archivo.' };
    }
    const payload = result.payload;
    const rows = payload.data || [];
    const assessment = payload.assessment || { validRows: 0, warnings: [] as string[] };
    if (!rows.length) return { error: 'No encontré residentes en ese archivo. Revisa que tenga nombre y número de casa o depto.' };
    return {
        batch_id: payload.batchId,
        filas: rows.length,
        listas: assessment.validRows,
        con_correo: rows.filter(row => row.email).length,
        con_telefono: rows.filter(row => row.phone).length,
        con_derechos: rows.filter(row => row.derechos_porcentaje).length,
        avisos: (assessment.warnings || []).slice(0, 6),
        muestra: rows.slice(0, 6).map(row => ({ nombre: row.name, unidad: row.unit_id, correo: row.email ? 'sí' : 'no', telefono: row.phone ? 'sí' : 'no' })),
        nota: 'Muéstrale esto a la administración. Si está de acuerdo, usa apply_resident_import con este batch_id. Quien no tiene correo queda con su unidad lista, sin acceso todavía.',
    };
}

/** Aplica un lote revisado: unidades, perfiles de residentes y accesos. Con confirmación. */
export async function applyResidentImport(admin: Admin, input: Record<string, unknown>) {
    if (admin.role !== 'admin') return { error: 'Solo la administración puede cargar residentes.' };
    const batchId = String(input.batch_id || '');
    const supabase = getSupabaseAdmin();
    const { data: batch } = await supabase.from('onboarding_import_batches')
        .select('id, status').eq('id', batchId).eq('community_id', admin.communityId).maybeSingle();
    if (!batch) return { error: 'No encontré ese lote en tu comunidad.' };
    const { data: rows, error } = await supabase.from('onboarding_import_rows')
        .select('id, name, unit_number, email, phone, raw_data')
        .eq('batch_id', batchId).eq('community_id', admin.communityId).eq('status', 'staged');
    if (error) return { error: 'No pude leer el lote.' };
    if (!rows?.length) return { error: 'Ese lote ya se aplicó o no tiene filas pendientes.' };
    const residents = rows.map(row => ({
        id: String(row.id), name: row.name || '', unit_id: row.unit_number || '', email: row.email || '', phone: row.phone || '',
        derechos_porcentaje: rightsFromRawData(row.raw_data),
    }));
    const result = await syncResidentRoster(
        { id: admin.id, role: admin.role, community_id: admin.communityId, name: admin.name ?? null },
        { residents, batchId, rightsSourceNote: 'Nómina cargada conversando con CoCo.' },
    );
    if (result.status !== 200 || !('processed' in result.payload)) {
        return { error: 'error' in result.payload ? result.payload.error : 'No pude cargar la nómina.' };
    }
    const done = result.payload;
    return {
        success: true,
        procesados: done.processed,
        con_acceso: done.success,
        solo_unidad: done.unitOnly,
        con_error: done.errors,
        errores: (done.rowResults || []).filter(row => row.status === 'failed').slice(0, 5).map(row => `${row.name} (${row.unit}): ${row.detail}`),
        message: `Listo: ${done.success} residentes con acceso y ${done.unitOnly} unidades sin correo todavía${done.errors ? `; ${done.errors} filas con error` : ''}.`,
    };
}
