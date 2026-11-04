/**
 * Informe corto para el comité, con la línea gráfica de Convive.
 * Solo totales. Si el texto no pasa las reglas de privacidad, no se entrega.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { chileTodayISO } from '@/lib/agent-center/chileDate';
import { checkDigestPrivacy } from '@/lib/committeeDigest/privacy';
import { CONVIVE_BRAND as B } from '@/lib/coco/brand';
import { pdfSafe } from '@/lib/coco/pdf';
import { getSupabaseAdmin } from '@/lib/supabase/supabaseAdmin';
import { storeOutboundMedia } from '@/lib/coco/outboundMediaStore';

export type CommitteeReport = {
    title: string;
    community: string;
    paragraphs: string[];
    html: string;
    note?: string;
};

function escapeHtml(value: string) {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function wrap(text: string, max = 86): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length > max) {
            if (current) lines.push(current);
            current = word;
        } else current = next;
    }
    if (current) lines.push(current);
    return lines;
}

export function buildCommitteeReport(input: {
    community: string;
    assemblies: number;
    bookings: number;
    requestedTitle?: string;
    generatedOn?: string;
}): CommitteeReport | { error: string } {
    const community = input.community.replace(/\s+/g, ' ').trim().slice(0, 80) || 'la comunidad';
    const generatedOn = input.generatedOn || chileTodayISO();
    let title = 'Informe para el comité';
    let note: string | undefined;
    const requested = (input.requestedTitle || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (requested) {
        const titled = checkDigestPrivacy(requested);
        if (titled.ok) title = requested;
        else note = 'El título pedido no se usó: el informe del comité no lleva nombres, montos ni datos de contacto.';
    }
    const paragraphs = [
        `Este informe lo preparó CoCo el ${generatedOn} para el comité de ${community}.`,
        `Hay ${input.assemblies} asamblea${input.assemblies === 1 ? '' : 's'} citada${input.assemblies === 1 ? '' : 's'} o en curso.`,
        `Hay ${input.bookings} reserva${input.bookings === 1 ? '' : 's'} de espacios comunes en los próximos días.`,
        'Las cifras son totales de la comunidad. El detalle de cada familia se ve en su propia cuenta, no en este informe.',
    ];
    const privacy = checkDigestPrivacy(paragraphs.join('\n'));
    if (!privacy.ok) return { error: 'El informe no pasó las reglas de privacidad del comité y no se generó.' };

    const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { margin: 0; background: #${B.paper}; color: #${B.ink}; font-family: Georgia, "Times New Roman", serif; }
  main { max-width: 720px; margin: 0 auto; padding: 48px 32px; }
  header { border-top: 8px solid #${B.copper}; padding-top: 24px; }
  p.brand { margin: 0; color: #${B.copper}; font-family: Calibri, "Segoe UI", sans-serif; letter-spacing: 0.08em; text-transform: uppercase; font-size: 12px; }
  h1 { font-size: 32px; line-height: 1.2; margin: 12px 0; }
  p.community { color: #${B.copperDeep}; margin-top: 0; }
  p { line-height: 1.5; }
  footer { margin-top: 40px; color: #${B.inkMuted}; font-family: Calibri, "Segoe UI", sans-serif; font-size: 13px; }
</style>
</head>
<body>
<main>
  <header>
    <p class="brand">${B.name}</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="community">${escapeHtml(community)}</p>
  </header>
  ${paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n  ')}
  <footer>Preparado por CoCo para el comité. Solo totales.</footer>
</main>
</body>
</html>`;
    return { title, community, paragraphs, html, ...(note ? { note } : {}) };
}

export async function committeeReportPdf(report: Pick<CommitteeReport, 'title' | 'community' | 'paragraphs'>): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    doc.setTitle(pdfSafe(report.title));
    doc.setAuthor('CoCo · Convive Connect');
    doc.setLanguage('es-CL');
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const page = doc.addPage([612, 792]);
    const copper = rgb(0x9c / 255, 0x56 / 255, 0x36 / 255);
    const ink = rgb(0x1a / 255, 0x16 / 255, 0x11 / 255);
    page.drawRectangle({ x: 0, y: 760, width: 612, height: 32, color: copper });
    page.drawText('Convive Connect', { x: 48, y: 770, size: 12, font: bold, color: rgb(1, 1, 1) });
    page.drawText(pdfSafe(report.title), { x: 48, y: 710, size: 22, font: bold, color: ink });
    page.drawText(pdfSafe(report.community), { x: 48, y: 684, size: 12, font, color: copper });
    let y = 640;
    for (const paragraph of report.paragraphs) {
        for (const line of wrap(pdfSafe(paragraph))) {
            page.drawText(line, { x: 48, y, size: 11, font, color: ink });
            y -= 16;
        }
        y -= 10;
    }
    page.drawText('Preparado por CoCo para el comite. Solo totales.', { x: 48, y: 48, size: 9, font, color: copper });
    return doc.save();
}

export async function createCommitteeReport(input: {
    communityId: string;
    createdBy: string;
    requestedTitle?: string;
}) {
    const admin = getSupabaseAdmin();
    const today = chileTodayISO();
    const [community, assemblies, bookings] = await Promise.all([
        admin.from('communities').select('name').eq('id', input.communityId).maybeSingle(),
        admin.from('assemblies').select('id', { count: 'exact', head: true })
            .eq('community_id', input.communityId)
            .gte('scheduled_at', `${today}T00:00:00`)
            .in('status', ['cited', 'in_progress']),
        admin.from('bookings').select('id', { count: 'exact', head: true })
            .eq('community_id', input.communityId)
            .gte('date', today)
            .in('status', ['pending', 'confirmed']),
    ]);
    if (community.error || assemblies.error || bookings.error) return { error: 'No pude leer los totales de la comunidad.' };
    const report = buildCommitteeReport({
        community: String(community.data?.name || 'la comunidad'),
        assemblies: assemblies.count || 0,
        bookings: bookings.count || 0,
        requestedTitle: input.requestedTitle,
        generatedOn: today,
    });
    if ('error' in report) return report;
    const pdf = await committeeReportPdf(report);
    const url = await storeOutboundMedia({
        communityId: input.communityId,
        createdBy: input.createdBy,
        filename: 'informe-comite.pdf',
        contentType: 'application/pdf',
        body: Buffer.from(pdf),
    });
    return {
        success: true,
        title: report.title,
        html: report.html,
        pdf_url: url || null,
        note: report.note || (url ? 'El PDF caduca en 15 minutos.' : 'El PDF no se pudo guardar. El HTML sí está listo.'),
        message: url
            ? `Dejé el informe “${report.title}”. El PDF caduca en 15 minutos.`
            : `Dejé el informe “${report.title}” en HTML. El PDF no quedó guardado.`,
    };
}
