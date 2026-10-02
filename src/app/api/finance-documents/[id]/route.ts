import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (!profile.community_id) return NextResponse.json({ error: 'Sin comunidad.' }, { status: 403 });
    const { id } = await context.params;
    const admin = getSupabaseAdmin();
    const { data: document, error } = await admin.from('community_expenses')
        .select('id, document_url').eq('id', id).eq('community_id', profile.community_id).maybeSingle();
    if (error || !document?.document_url) return NextResponse.json({ error: 'Respaldo no encontrado.' }, { status: 404 });
    if (profile.role !== 'admin') {
        const { data: ownedItem } = await admin.from('expense_items')
            .select('expense_id, expenses!inner(unit_id, community_id)')
            .eq('source_expense_id', id)
            .eq('expenses.unit_id', profile.unit_id)
            .eq('expenses.community_id', profile.community_id)
            .limit(1).maybeSingle();
        if (!ownedItem) return NextResponse.json({ error: 'No tienes acceso a este respaldo.' }, { status: 403 });
    }
    const { data: file, error: downloadError } = await admin.storage.from('finance-documents')
        .download(document.document_url);
    if (downloadError || !file) return NextResponse.json({ error: 'No se pudo abrir el respaldo.' }, { status: 500 });
    const extension = document.document_url.split('.').pop()?.toLowerCase() || '';
    const mime: Record<string, string> = {
        pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
        txt: 'text/plain; charset=utf-8', csv: 'text/csv; charset=utf-8',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    const disposition = ['pdf', 'png', 'jpg', 'jpeg', 'txt'].includes(extension) ? 'inline' : 'attachment';
    return new NextResponse(file, {
        headers: {
            'Content-Type': mime[extension] || 'application/octet-stream',
            'Content-Disposition': `${disposition}; filename="respaldo-${id}.${extension || 'bin'}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}
