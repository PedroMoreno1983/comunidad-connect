import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getCommunityInsights } from '@/lib/coco/usageSignals';

export const dynamic = 'force-dynamic';

/**
 * Uso de CoCo en la comunidad, agregado: cuántos vecinos y sobre qué temas.
 * Sin texto ni nombres, y nada de grupos de menos de 3 personas.
 */
export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile || profile.role !== 'admin' || !profile.community_id) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    try {
        return NextResponse.json({ insights: await getCommunityInsights(profile.community_id, 30) });
    } catch (error) {
        console.error('[coco insights] failed', error);
        return NextResponse.json({ error: 'No pude calcular los datos de uso.' }, { status: 500 });
    }
}
