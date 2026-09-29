import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    const chargeId = req.nextUrl.searchParams.get('chargeId');
    if (!chargeId || !profile.community_id) return NextResponse.json({ error: 'Falta el cobro.' }, { status: 400 });
    const admin = getSupabaseAdmin();
    const { data: charge } = await admin.from('expenses').select('id, unit_id')
        .eq('id', chargeId).eq('community_id', profile.community_id).maybeSingle();
    if (!charge || (profile.role !== 'admin' && charge.unit_id !== profile.unit_id)) {
        return NextResponse.json({ error: 'Cobro no disponible.' }, { status: 403 });
    }
    const { data: items, error } = await admin.from('expense_items')
        .select('source_expense_id').eq('expense_id', chargeId).not('source_expense_id', 'is', null);
    if (error) return NextResponse.json({ error: 'No se pudieron cargar los respaldos.' }, { status: 500 });
    const ids = [...new Set((items ?? []).map(item => item.source_expense_id).filter(Boolean))];
    if (ids.length === 0) return NextResponse.json({ documents: [] });
    const { data: documents, error: documentError } = await admin.from('community_expenses')
        .select('id, label').in('id', ids).eq('community_id', profile.community_id).not('document_url', 'is', null);
    if (documentError) return NextResponse.json({ error: 'No se pudieron cargar los respaldos.' }, { status: 500 });
    return NextResponse.json({ documents: documents ?? [] });
}
