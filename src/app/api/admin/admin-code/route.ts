import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Código de administración de la comunidad: con él, otra persona se registra
 * como administradora (traspaso o co-administración). Solo lo ve la
 * administración de esa comunidad; antes estaba solo en el panel superadmin.
 */
export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración ve este código.' }, { status: 403 });
    }
    const { data, error } = await getSupabaseAdmin().from('communities').select('admin_code').eq('id', profile.community_id).maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudo leer el código.' }, { status: 500 });
    return NextResponse.json({ adminCode: typeof data?.admin_code === 'string' ? data.admin_code : null },
        { headers: { 'Cache-Control': 'no-store' } });
}
