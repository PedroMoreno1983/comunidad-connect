import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { markdownToDocx } from '@/lib/coco/docx';
import { markdownToPdf } from '@/lib/coco/pdf';
import { LEGAL_DRAFT_ADMIN_ONLY_MESSAGE, LEGAL_DRAFT_MARKER, canDraftLegalDocuments } from '@/lib/coco/legalDraftMarker';

export const dynamic = 'force-dynamic';
const MAX_CHARS = 120_000;

async function communityName(communityId: string) {
    try {
        const { data } = await getSupabaseAdmin().from('communities').select('name').eq('id', communityId).maybeSingle();
        return typeof data?.name === 'string' ? data.name : '';
    } catch {
        return '';
    }
}

/** Convierte un borrador legal de CoCo en Word o PDF con la línea editorial de Convive. Solo administración. No guarda nada. */
export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'coco.legal_draft_docx', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'Inicia sesión para descargar el borrador.' }, { status: 401 });
    if (!canDraftLegalDocuments(profile.role)) return NextResponse.json({ error: LEGAL_DRAFT_ADMIN_ONLY_MESSAGE }, { status: 403 });
    let text = '';
    let format = 'docx';
    try {
        const body = await request.json() as { text?: unknown; format?: unknown };
        text = typeof body.text === 'string' ? body.text : '';
        format = body.format === 'pdf' ? 'pdf' : 'docx';
    } catch {
        return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }
    if (!text.trim()) return NextResponse.json({ error: 'No hay borrador para descargar.' }, { status: 400 });
    if (text.length > MAX_CHARS) return NextResponse.json({ error: 'El borrador es demasiado extenso.' }, { status: 413 });
    const content = text.includes(LEGAL_DRAFT_MARKER) ? text : `**${LEGAL_DRAFT_MARKER}**\n\n${text}`;
    const community = await communityName(profile.community_id);
    const file = format === 'pdf' ? await markdownToPdf(content, { community }) : markdownToDocx(content, { community });
    return new NextResponse(new Uint8Array(file), {
        headers: {
            'Content-Type': format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="borrador-convive.${format}"`,
            'Cache-Control': 'no-store',
        },
    });
}
