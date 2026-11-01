import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { markdownToDocx } from '@/lib/coco/docx';
import { LEGAL_DRAFT_MARKER } from '@/lib/coco/legalDrafts';

export const dynamic = 'force-dynamic';
const MAX_CHARS = 120_000;

/** Convierte un borrador legal de CoCo (texto del chat) en un .docx descargable. No guarda nada. */
export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'coco.legal_draft_docx', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'Inicia sesión para descargar el borrador.' }, { status: 401 });
    let text = '';
    try {
        const body = await request.json() as { text?: unknown };
        text = typeof body.text === 'string' ? body.text : '';
    } catch {
        return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }
    if (!text.trim()) return NextResponse.json({ error: 'No hay borrador para descargar.' }, { status: 400 });
    if (text.length > MAX_CHARS) return NextResponse.json({ error: 'El borrador es demasiado extenso.' }, { status: 413 });
    const content = text.includes(LEGAL_DRAFT_MARKER) ? text : `**${LEGAL_DRAFT_MARKER}**\n\n${text}`;
    const file = markdownToDocx(content);
    return new NextResponse(new Uint8Array(file), {
        headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': 'attachment; filename="borrador-coco.docx"',
            'Cache-Control': 'no-store',
        },
    });
}
