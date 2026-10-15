import { NextResponse } from 'next/server';
import { getSupabaseUserClient } from '@/lib/server/agentIdentity';
import { supabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { reconcileParkingPayoutCredits } from '@/lib/parkingPayouts/reconcileCredits';
import { reconcileUnitStatuses } from '@/lib/finance/collectionService';

/**
 * Recalcula el estado de los cobros de las unidades que recibieron un abono por
 * liquidación de estacionamiento (p. ej. tras "Liquidar ahora" en la vista de
 * administración, que abona desde la base). Solo la administración de la
 * comunidad; no recibe ids: trabaja sobre su propia comunidad.
 */
export async function POST(req: Request) {
    const limited = await enforceDistributedRateLimit(req, 'parking.payouts.reconcile', { limit: 20, windowMs: 60_000 });
    if (limited) return limited;

    const supabaseUser = await getSupabaseUserClient();
    const { data: { user } } = await supabaseUser.auth.getUser();
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, community_id')
        .eq('id', user.id)
        .maybeSingle();
    if (profile?.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'Solo la administración puede hacer esto.' }, { status: 403 });
    }

    try {
        const reconciled = await reconcileParkingPayoutCredits(String(profile.community_id), reconcileUnitStatuses);
        return NextResponse.json({ reconciled }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        console.error('[parking/payouts/reconcile]', error);
        return NextResponse.json({ error: 'No se pudo recalcular las cuentas abonadas.' }, { status: 500 });
    }
}
