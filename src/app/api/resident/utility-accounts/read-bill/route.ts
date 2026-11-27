import { NextRequest, NextResponse } from 'next/server';
import { extractPdfText } from '@/lib/coco/pdfText';
import { enforceDistributedRateLimit } from '@/lib/security/rateLimit';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { parsePersonalBill } from '@/lib/utilities/personalBill';

export const runtime = 'nodejs';

const FILE_LIMIT = 3 * 1024 * 1024;

export async function POST(request: NextRequest) {
    const limited = await enforceDistributedRateLimit(request, 'resident.utility_bill_read', { limit: 10, windowMs: 60_000 });
    if (limited) return limited;
    if (!await getAuthenticatedAgentProfile()) return NextResponse.json({ error: 'Inicia sesión para leer tu boleta.' }, { status: 401 });
    if (Number(request.headers.get('content-length')) > FILE_LIMIT + 65_536) {
        return NextResponse.json({ error: 'El PDF debe pesar hasta 3 MB.' }, { status: 413 });
    }
    const form = await request.formData().catch(() => null);
    const pdf = form?.get('file');
    if (!(pdf instanceof File) || pdf.size === 0 || pdf.size > FILE_LIMIT) {
        return NextResponse.json({ error: 'Selecciona una boleta PDF de hasta 3 MB.' }, { status: 400 });
    }
    try {
        const { text } = await extractPdfText(new Uint8Array(await pdf.arrayBuffer()));
        const bill = parsePersonalBill(text.slice(0, 120_000));
        if (!bill.dueDate && bill.amount === null && !bill.customerNumber) {
            return NextResponse.json({ error: 'No encontré datos legibles. Descarga el PDF original de la empresa o completa los campos a mano.' }, { status: 422 });
        }
        return NextResponse.json(bill, { headers: { 'Cache-Control': 'private, no-store' } });
    } catch {
        return NextResponse.json({ error: 'No pude abrir el PDF. Revisa que sea una boleta PDF sin contraseña.' }, { status: 422 });
    }
}
