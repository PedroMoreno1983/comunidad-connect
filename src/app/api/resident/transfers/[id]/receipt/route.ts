import { NextResponse } from 'next/server';
import { getAuthenticatedAgentProfile } from '@/lib/server/agentIdentity';
import { BillingError } from '@/lib/finance/billingService';
import { getTransferReceipt } from '@/lib/finance/transferReportService';

export const runtime = 'nodejs';

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character] || character);

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    const profile = await getAuthenticatedAgentProfile();
    if (!profile) return NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
    if (!profile.community_id || (profile.role !== 'admin' && (profile.role !== 'resident' || !profile.unit_id))) {
        return NextResponse.json({ error: 'Comprobante no disponible.' }, { status: 403 });
    }
    try {
        const { id } = await context.params;
        const receipt = await getTransferReceipt(profile.community_id,
            profile.role === 'admin' ? null : profile.unit_id ?? null, id);
        const money = `$${receipt.amount.toLocaleString('es-CL')}`;
        const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Comprobante de pago</title><style>body{font:16px system-ui,sans-serif;max-width:640px;margin:48px auto;padding:0 20px;color:#24201b}h1{font-size:26px}dl{display:grid;grid-template-columns:1fr 2fr;gap:12px;border-top:1px solid #ccc;padding-top:20px}dt{color:#665d55}dd{margin:0;font-weight:600}.note{margin-top:28px;color:#665d55;font-size:13px}</style></head><body><h1>Comprobante de pago registrado</h1><p>La administración confirmó una transferencia recibida para el gasto común indicado.</p><dl><dt>Unidad</dt><dd>${escapeHtml(receipt.unitLabel)}</dd><dt>Período</dt><dd>${escapeHtml(receipt.month)}</dd><dt>Monto</dt><dd>${escapeHtml(money)}</dd><dt>Fecha de transferencia</dt><dd>${escapeHtml(receipt.paidAt)}</dd><dt>Número de operación</dt><dd>${escapeHtml(receipt.reference)}</dd><dt>Folio del pago</dt><dd>${escapeHtml(receipt.paymentId)}</dd></dl><p class="note">Emitido por Convive Connect tras la confirmación de la administración.</p></body></html>`;
        return new NextResponse(html, { headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Disposition': `inline; filename="comprobante-${receipt.paymentId}.html"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        } });
    } catch (error) {
        if (error instanceof BillingError) return NextResponse.json({ error: error.message }, { status: error.status });
        return NextResponse.json({ error: 'No se pudo abrir el comprobante.' }, { status: 500 });
    }
}
