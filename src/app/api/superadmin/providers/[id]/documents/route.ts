import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin } from '@/lib/security/superadminAuth';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { mediaFailure } from '@/lib/server/providerAccess';
import { listProviderDocuments, reviewProviderDocument } from '@/lib/services/providerMedia';

export const runtime = 'nodejs';

/** Documentos de un maestro de la Red Convive: los revisa Convive. */
async function networkProvider(id: string) {
    const { data } = await getSupabaseAdmin().from('service_providers').select('id, community_id').eq('id', id).maybeSingle();
    return data && data.community_id === null ? String(data.id) : null;
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    try {
        const providerId = await networkProvider(id);
        if (!providerId) return NextResponse.json({ error: 'Ese maestro no está en la red.' }, { status: 404 });
        return NextResponse.json({ documents: await listProviderDocuments(providerId, true) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return mediaFailure(error);
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const { id } = await params;
    const body = await request.json().catch(() => null) as { documentId?: unknown; approve?: unknown; note?: unknown } | null;
    if (!body || typeof body.approve !== 'boolean') return NextResponse.json({ error: 'Datos no válidos.' }, { status: 400 });
    try {
        const providerId = await networkProvider(id);
        if (!providerId) return NextResponse.json({ error: 'Ese maestro no está en la red.' }, { status: 404 });
        await reviewProviderDocument(providerId, String(body.documentId || ''), body.approve, typeof body.note === 'string' ? body.note : null,
            { id: auth.user.id, role: 'superadmin', email: auth.user.email });
        return NextResponse.json({ ok: true });
    } catch (error) {
        return mediaFailure(error);
    }
}
