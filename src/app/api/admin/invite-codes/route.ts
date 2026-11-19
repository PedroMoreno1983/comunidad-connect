import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Códigos de invitación de la comunidad (residentes, conserjería y
 * administración). El navegador ya no puede leerlos de communities (migración
 * 20261118220000): solo la administración de esa comunidad los recibe aquí.
 */
export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración ve los códigos de invitación.' }, { status: 403 });
    }
    const { data, error } = await getSupabaseAdmin().from('communities')
        .select('resident_code, concierge_code, admin_code').eq('id', profile.community_id).maybeSingle();
    if (error) return NextResponse.json({ error: 'No se pudieron leer los códigos.' }, { status: 500 });
    const code = (value: unknown) => typeof value === 'string' ? value : null;
    return NextResponse.json({
        residentCode: code(data?.resident_code), conciergeCode: code(data?.concierge_code), adminCode: code(data?.admin_code),
    }, { headers: { 'Cache-Control': 'no-store' } });
}
