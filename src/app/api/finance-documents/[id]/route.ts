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
        const [{ data: ownedItem }, { data: reviews, error: reviewError }] = await Promise.all([
            admin.from('expense_items')
                .select('expense_id, expenses!inner(unit_id, community_id)')
                .eq('source_expense_id', id)
                .eq('expenses.unit_id', profile.unit_id)
                .eq('expenses.community_id', profile.community_id)
                .limit(1).maybeSingle(),
            admin.from('finance_committee_reviews').select('snapshot')
                .eq('reviewer_id', profile.id).eq('community_id', profile.community_id).limit(100),
        ]);
        if (reviewError) return NextResponse.json({ error: 'No se pudo verificar el acceso al respaldo.' }, { status: 500 });
        const inAssignedReview = (reviews ?? []).some(row => {
            const snapshot = row.snapshot as { sourceExpenses?: Array<{ id?: string; hasDocument?: boolean }> } | null;
            return snapshot?.sourceExpenses?.some(expense => expense.id === id && expense.hasDocument) ?? false;
        });
        if (!ownedItem && !inAssignedReview) return NextResponse.json({ error: 'No tienes acceso a este respaldo.' }, { status: 403 });
    }
    const { data: signed, error: signedError } = await admin.storage.from('finance-documents')
        .createSignedUrl(document.document_url, 60);
    if (signedError || !signed?.signedUrl) return NextResponse.json({ error: 'No se pudo abrir el respaldo.' }, { status: 500 });
    return NextResponse.redirect(signed.signedUrl, { headers: { 'Cache-Control': 'no-store' } });
}
