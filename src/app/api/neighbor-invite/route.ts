import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getOrCreateInvite } from '@/lib/onboarding/neighborInvites';

export const runtime = 'nodejs';

/** El enlace personal del residente para invitar vecinos por WhatsApp. */
export async function GET() {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    const invite = await getOrCreateInvite(profile.id);
    if (!invite) return NextResponse.json({ error: 'Solo los residentes invitan vecinos.' }, { status: 403 });
    return NextResponse.json({ invite }, { headers: { 'Cache-Control': 'private, no-store' } });
}
