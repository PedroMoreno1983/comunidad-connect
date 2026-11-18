import { NextResponse } from 'next/server';
import { MAX_ONBOARDING_BATCH_BYTES, MAX_ONBOARDING_BATCH_FILES, MAX_ONBOARDING_FILE_BYTES } from '@/lib/onboarding/documentExtractor';
import { stageResidentBatch } from '@/lib/onboarding/batchStaging';
import { getRequestId } from '@/lib/operations/audit';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const { data, error } = await getSupabaseAdmin().from('onboarding_import_batches')
        .select('id, source, status, document_count, row_count, valid_row_count, warning_count, created_at, updated_at')
        .eq('community_id', profile.community_id).order('created_at', { ascending: false }).limit(20);
    if (error) {
        console.error('[onboarding batches] query failed', error);
        return NextResponse.json({ error: 'No se pudieron cargar los lotes.' }, { status: 500 });
    }
    return NextResponse.json({ batches: data || [] });
}

export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'onboarding.batch', { limit: 6, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    const formData = await request.formData();
    const files = formData.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
    if (!files.length) return NextResponse.json({ error: 'Selecciona al menos un documento.' }, { status: 400 });
    if (files.length > MAX_ONBOARDING_BATCH_FILES) return NextResponse.json({ error: `Maximo ${MAX_ONBOARDING_BATCH_FILES} documentos por lote.` }, { status: 413 });
    if (files.some(file => file.size > MAX_ONBOARDING_FILE_BYTES)) return NextResponse.json({ error: 'Cada documento debe pesar hasta 10 MB.' }, { status: 413 });
    if (files.reduce((sum, file) => sum + file.size, 0) > MAX_ONBOARDING_BATCH_BYTES) return NextResponse.json({ error: 'El lote completo debe pesar hasta 50 MB.' }, { status: 413 });
    const source = formData.get('source') === 'agent_center' ? 'agent_center' : 'admin_onboarding';
    const staged = await Promise.all(files.map(async file => ({ name: file.name, type: file.type, size: file.size, bytes: Buffer.from(await file.arrayBuffer()) })));
    const result = await stageResidentBatch({ id: profile.id, role: profile.role, community_id: profile.community_id }, staged, source, getRequestId(request));
    return NextResponse.json(result.payload, { status: result.status });
}
