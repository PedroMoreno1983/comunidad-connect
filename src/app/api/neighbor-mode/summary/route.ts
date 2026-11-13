import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { neighborModeSummary } from '@/lib/onboarding/neighborBuildings';

export const runtime = 'nodejs';

/** Cuántos vecinos del edificio usan Convive (solo en una comunidad sin administrar). */
export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const summary = await neighborModeSummary(profile.community_id);
    return NextResponse.json({ summary }, { headers: { 'Cache-Control': 'private, no-store' } });
}
