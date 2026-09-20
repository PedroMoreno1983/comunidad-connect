import { NextRequest, NextResponse } from 'next/server';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';

function safeFileName(value: string) {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'curso';
}

function wrapText(text: string, maxLength: number) {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const candidate = line ? `${line} ${word}` : word;
        if (candidate.length > maxLength && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);
    return lines;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const limited = await enforceDistributedRateLimit(req, 'training.certificates.download', { limit: 30, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id || !['admin', 'concierge'].includes(profile.role)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }
    const { id } = await params;
    const supabase = getSupabaseAdmin();
    const { data: certificate } = await supabase
        .from('training_certificates')
        .select('id,attempt_id,module_id,user_id,community_id,certificate_number,issued_at,revoked_at')
        .eq('id', id)
        .eq('community_id', profile.community_id)
        .maybeSingle();
    if (!certificate || (profile.role !== 'admin' && certificate.user_id !== profile.id)) {
        return NextResponse.json({ error: 'Constancia no encontrada.' }, { status: 404 });
    }
    if (certificate.revoked_at) return NextResponse.json({ error: 'Esta constancia fue revocada.' }, { status: 410 });

    const [attemptResult, moduleResult, learnerResult, communityResult] = await Promise.all([
        supabase.from('training_attempts').select('score,module_version,completed_at,completion_source').eq('id', certificate.attempt_id).single(),
        supabase.from('training_modules').select('title').eq('id', certificate.module_id).single(),
        supabase.from('profiles').select('name,full_name').eq('id', certificate.user_id).single(),
        supabase.from('communities').select('name').eq('id', certificate.community_id).single(),
    ]);
    if (attemptResult.error || moduleResult.error || learnerResult.error || communityResult.error) {
        return NextResponse.json({ error: 'No se pudo construir la constancia.' }, { status: 500 });
    }

    const learnerName = learnerResult.data.full_name || learnerResult.data.name;
    const courseTitle = moduleResult.data.title;
    const communityName = communityResult.data.name;
    const issuedDate = new Intl.DateTimeFormat('es-CL', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'America/Santiago' }).format(new Date(certificate.issued_at));
    const score = Math.round(Number(attemptResult.data.score || 0));

    const pdf = await PDFDocument.create();
    const page = pdf.addPage([842, 595]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const serif = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const ink = rgb(0.10, 0.09, 0.08);
    const warm = rgb(0.97, 0.95, 0.91);
    const copper = rgb(0.66, 0.29, 0.14);
    const sage = rgb(0.35, 0.49, 0.29);
    page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: warm });
    page.drawRectangle({ x: 22, y: 22, width: 798, height: 551, borderColor: copper, borderWidth: 2 });
    page.drawRectangle({ x: 32, y: 32, width: 778, height: 531, borderColor: rgb(0.78, 0.70, 0.62), borderWidth: 0.7 });
    page.drawCircle({ x: 421, y: 506, size: 30, color: ink });
    page.drawText('C', { x: 410, y: 494, size: 31, font: serif, color: warm });
    page.drawText('C O N V I V E   C O N N E C T', { x: 323, y: 454, size: 10, font: bold, color: copper });
    page.drawText('CONSTANCIA DE APROBACION', { x: 288, y: 410, size: 22, font: bold, color: ink });
    page.drawText('Se certifica que', { x: 367, y: 372, size: 13, font: regular, color: rgb(0.35, 0.32, 0.29) });
    const learnerWidth = bold.widthOfTextAtSize(learnerName, 29);
    page.drawText(learnerName, { x: Math.max(70, (842 - learnerWidth) / 2), y: 327, size: 29, font: serif, color: ink });
    page.drawLine({ start: { x: 160, y: 317 }, end: { x: 682, y: 317 }, thickness: 0.8, color: copper });
    page.drawText('aprobó satisfactoriamente el curso', { x: 321, y: 287, size: 12, font: regular, color: rgb(0.35, 0.32, 0.29) });
    const titleLines = wrapText(courseTitle, 54).slice(0, 2);
    titleLines.forEach((line, index) => {
        const width = bold.widthOfTextAtSize(line, 20);
        page.drawText(line, { x: Math.max(70, (842 - width) / 2), y: 249 - (index * 24), size: 20, font: bold, color: copper });
    });
    page.drawText(`Version ${attemptResult.data.module_version}  |  Resultado ${score}%  |  ${communityName}`, { x: 242, y: 183, size: 11, font: bold, color: sage });
    page.drawText(`Emitida el ${issuedDate}`, { x: 352, y: 151, size: 11, font: regular, color: ink });
    page.drawLine({ start: { x: 102, y: 112 }, end: { x: 740, y: 112 }, thickness: 0.5, color: rgb(0.72, 0.66, 0.59) });
    page.drawText(`Folio verificable: ${certificate.certificate_number}`, { x: 102, y: 88, size: 9, font: bold, color: ink });
    page.drawText('Evidencia emitida por el Aula virtual CoCo', { x: 578, y: 88, size: 8.5, font: regular, color: rgb(0.35, 0.32, 0.29) });
    const bytes = await pdf.save();
    const body = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
    return new NextResponse(body, {
        headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="constancia-${safeFileName(courseTitle)}.pdf"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
