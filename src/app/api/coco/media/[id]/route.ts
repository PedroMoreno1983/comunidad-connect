import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { verifyMediaAccess } from '@/lib/coco/outboundMedia';

export const dynamic = 'force-dynamic';

/** Twilio baja el archivo con la firma. No hay sesión: la firma y el vencimiento son el permiso. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const expiresAtMs = Number(request.nextUrl.searchParams.get('e'));
    const signature = request.nextUrl.searchParams.get('s') || '';
    if (!/^[0-9a-f-]{36}$/i.test(id) || !verifyMediaAccess(id, expiresAtMs, signature)) {
        return NextResponse.json({ ok: true }, { status: 404 });
    }
    const { data, error } = await getSupabaseAdmin()
        .from('coco_outbound_media')
        .select('filename, content_type, body, expires_at')
        .eq('id', id)
        .maybeSingle();
    if (error || !data?.body || new Date(String(data.expires_at)).getTime() < Date.now()) {
        return NextResponse.json({ ok: true }, { status: 404 });
    }
    const bytes = Buffer.from(String(data.body), 'base64');
    return new NextResponse(new Uint8Array(bytes), {
        headers: {
            'Content-Type': String(data.content_type || 'application/octet-stream'),
            'Content-Disposition': `attachment; filename="${String(data.filename || 'archivo').replace(/"/g, '')}"`,
            'Cache-Control': 'private, no-store',
        },
    });
}
