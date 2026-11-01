import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';

export const dynamic = 'force-dynamic';
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_TEXT_CHARS = 35_000;

export async function POST(request: Request) {
    const limited = await enforceDistributedRateLimit(request, 'coco.legal_document', { limit: 8, windowMs: 60_000 });
    if (limited) return limited;
    const profile = await getAuthenticatedAgentProfile();
    if (!profile?.community_id) return NextResponse.json({ error: 'Inicia sesión para analizar documentos.' }, { status: 401 });

    try {
        const form = await request.formData();
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Adjunta un documento.' }, { status: 400 });
        if (file.size > MAX_FILE_BYTES) return NextResponse.json({ error: 'El máximo es 5 MB.' }, { status: 413 });
        const extension = file.name.split('.').at(-1)?.toLowerCase();
        if (!['pdf', 'docx', 'txt'].includes(extension || '')) return NextResponse.json({ error: 'Usa PDF, DOCX o TXT.' }, { status: 400 });
        const bytes = Buffer.from(await file.arrayBuffer());
        let text = '';
        if (extension === 'pdf') {
            if (bytes.subarray(0, 5).toString() !== '%PDF-') return NextResponse.json({ error: 'El archivo no es un PDF válido.' }, { status: 400 });
            await import('pdf-parse/worker');
            const { PDFParse } = await import('pdf-parse');
            const parser = new PDFParse({ data: bytes });
            try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
        } else if (extension === 'docx') {
            const mammoth = await import('mammoth');
            text = (await mammoth.extractRawText({ buffer: bytes })).value;
        } else {
            text = bytes.toString('utf8');
        }
        text = text.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
        if (!text) return NextResponse.json({ error: 'No pude extraer texto. Si es un PDF escaneado, usa una versión con OCR.' }, { status: 422 });
        return NextResponse.json({ name: file.name.slice(0, 120), text: text.slice(0, MAX_TEXT_CHARS), truncated: text.length > MAX_TEXT_CHARS }, { headers: { 'Cache-Control': 'no-store' } });
    } catch {
        return NextResponse.json({ error: 'No pude leer el documento. Revisa que no esté dañado o protegido.' }, { status: 422 });
    }
}
