import { NextRequest, NextResponse } from 'next/server';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { previewInvite } from '@/lib/onboarding/neighborInvites';

export const runtime = 'nodejs';

/** Público: edificio y nombre de pila de quien invita, para la página /unirse. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
    const limited = await enforceDistributedRateLimit(request, 'neighbor_invite.preview', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const { code } = await params;
    const preview = await previewInvite(code);
    if (!preview) return NextResponse.json({ error: 'Esta invitación ya no es válida.' }, { status: 404 });
    return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'no-store' } });
}
