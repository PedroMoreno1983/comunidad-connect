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
    const supabase = getSupabaseAdmin();
    // Sin document_id (el id no sobrevive entre turnos): el último archivo que esta
    // administración adjuntó al chat en las últimas 24 horas.
    const documentId = String(input.document_id || '');
    const query = supabase.from('community_documents')
        .select('id, file_name, storage_path, uploaded_by')
        .eq('community_id', admin.communityId)
        .eq('uploaded_by', admin.id);
    const { data: document } = documentId
        ? await query.eq('id', documentId).maybeSingle()
        : await query.gte('created_at', new Date(Date.now() - 86_400_000).toISOString())
            .order('created_at', { ascending: false }).limit(1).maybeSingle();
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
    const code = String(payload.batchId).slice(0, 8);
    const withEmail = rows.filter(row => row.email).length;
    const warnings = (assessment.warnings || []).slice(0, 6);
    return {
        // Lo que ve la administración al aprobar la revisión: el resumen y el código para cargarla.
        message: [
            `Revisé la nómina (código ${code}): ${rows.length} residentes, ${withEmail} con correo y ${rows.length - withEmail} sin correo (esos quedan con su lote listo, sin acceso todavía). A quien tenga correo y no tenga cuenta le llega un correo de bienvenida para crear su contraseña.`,
            warnings.length ? `Avisos: ${warnings.join(' ')}` : '',
            `Ejemplos: ${rows.slice(0, 4).map(row => `${row.name || '(sin nombre)'}, ${row.unit_id || 'sin lote'}`).join('; ')}.`,
            `Si está bien, dime "carga la nómina ${code}". Nada se ha creado todavía.`,
        ].filter(Boolean).join('\n'),
        batch_id: payload.batchId,
        // El id completo no sobrevive entre turnos; este código corto sí, y apply_resident_import lo acepta.
        codigo: String(payload.batchId).slice(0, 8),
        filas: rows.length,
        listas: assessment.validRows,
        con_correo: rows.filter(row => row.email).length,
        con_telefono: rows.filter(row => row.phone).length,
        con_derechos: rows.filter(row => row.derechos_porcentaje).length,
        avisos: (assessment.warnings || []).slice(0, 6),
        muestra: rows.slice(0, 6).map(row => ({ nombre: row.name, unidad: row.unit_id, correo: row.email ? 'sí' : 'no', telefono: row.phone ? 'sí' : 'no' })),
        nota: 'Muéstrale esto a la administración e incluye el código del lote en tu respuesta. Si está de acuerdo, usa apply_resident_import con ese código. Quien no tiene correo queda con su unidad lista, sin acceso todavía.',
    };
}

/** Aplica un lote revisado: unidades, perfiles de residentes y accesos. Con confirmación. */
export async function applyResidentImport(admin: Admin, input: Record<string, unknown>) {
    if (admin.role !== 'admin') return { error: 'Solo la administración puede cargar residentes.' };
    const supabase = getSupabaseAdmin();
    // El lote se elige por su id o por el código corto de la revisión. Sin ninguno,
    // solo si esta administración tiene UN lote en revisión: con dos, se pregunta
    // cuál, para no cargar una nómina distinta de la que se confirmó.
    const requested = String(input.batch_id || input.codigo || '').trim().toLowerCase();
    const { data: pending } = await supabase.from('onboarding_import_batches')
        .select('id, status, row_count, created_at')
        // Solo lotes que armó CoCo: uno de Admin › Onboarding se aplica desde esa pantalla.
        .eq('community_id', admin.communityId).eq('created_by', admin.id).eq('status', 'review').eq('source', 'agent_center')
        .gte('created_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
        .order('created_at', { ascending: false }).limit(20);
    const candidates = (pending || []).filter(row => !requested || String(row.id).toLowerCase().startsWith(requested));
    if (!candidates.length) return { error: requested ? 'No encontré un lote en revisión con ese código.' : 'No hay una nómina en revisión. Adjunta el archivo y pídeme revisarla primero.' };
    if (candidates.length > 1) {
        return {
            error: 'Hay más de una nómina en revisión. Dime cuál cargar por su código.',
            lotes: candidates.map(row => ({ codigo: String(row.id).slice(0, 8), filas: row.row_count, revisada: String(row.created_at).slice(0, 16).replace('T', ' ') })),
        };
    }
    const batchId = String(candidates[0].id);
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
        // Los derechos que traiga la nómina quedan provisorios salvo que la administración
        // indique la fuente (reglamento, escritura): esa nota los marca como verificados.
        { residents, batchId, rightsSourceNote: typeof input.fuente === 'string' ? input.fuente.trim().slice(0, 1000) : '' },
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
        bienvenidas_enviadas: done.welcomeEmails ?? 0,
        errores: (done.rowResults || []).filter(row => row.status === 'failed').slice(0, 5).map(row => `${row.name} (${row.unit}): ${row.detail}`),
        message: `Listo: ${done.success} residentes con acceso y ${done.unitOnly} unidades sin correo todavía${done.errors ? `; ${done.errors} filas con error` : ''}.${done.welcomeEmails ? ` Les mandé el correo de bienvenida a ${done.welcomeEmails} personas para que creen su contraseña.` : ''}`,
    };
}
