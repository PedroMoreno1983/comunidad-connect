import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { BillNotice } from '@/lib/types';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 42;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const INK = rgb(0.10, 0.09, 0.08);
const MUTED = rgb(0.38, 0.35, 0.32);
const LINE = rgb(0.80, 0.76, 0.71);
const WARM = rgb(0.97, 0.95, 0.91);
const COPPER = rgb(0.66, 0.29, 0.14);

const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

// Las fuentes estándar de PDF solo codifican WinAnsi: un carácter fuera de esa
// tabla hace fallar el documento completo, no solo esa línea.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');

export function pdfSafe(text: string): string {
    return Array.from(text.normalize('NFC').replace(/[\u0000-\u001f]/g, ' ')).map(char => {
        const code = char.charCodeAt(0);
        if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || WIN_ANSI_EXTRA.has(char)) return char;
        const base = char.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return base && base.charCodeAt(0) <= 0x7e ? base : '?';
    }).join('');
}

export function money(value: number): string {
    const rounded = Math.round(value);
    const formatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${rounded < 0 ? '-' : ''}$${formatted}`;
}

export function periodLabel(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    const name = MONTH_NAMES[mon - 1] ?? month;
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

function longDate(iso: string): string {
    const [year, mon, day] = iso.slice(0, 10).split('-').map(Number);
    return `${day} de ${MONTH_NAMES[mon - 1]} de ${year}`;
}

interface Fonts { regular: PDFFont; bold: PDFFont }

class Writer {
    y = PAGE_HEIGHT - MARGIN;
    constructor(private page: PDFPage, private fonts: Fonts) {}

    fit(text: string, size: number, font: PDFFont, maxWidth: number): string {
        let value = pdfSafe(text);
        if (font.widthOfTextAtSize(value, size) <= maxWidth) return value;
        while (value.length > 1 && font.widthOfTextAtSize(`${value}...`, size) > maxWidth) value = value.slice(0, -1);
        return `${value}...`;
    }

    text(text: string, x: number, y: number, options: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; maxWidth?: number; align?: 'left' | 'right' } = {}) {
        const size = options.size ?? 9;
        const font = options.bold ? this.fonts.bold : this.fonts.regular;
        const value = this.fit(text, size, font, options.maxWidth ?? CONTENT_WIDTH);
        const drawX = options.align === 'right' ? x - font.widthOfTextAtSize(value, size) : x;
        this.page.drawText(value, { x: drawX, y, size, font, color: options.color ?? INK });
    }

    rule(y: number, color = LINE) {
        this.page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color });
    }

    section(title: string) {
        this.y -= 18;
        this.text(title.toUpperCase(), MARGIN, this.y, { size: 8, bold: true, color: COPPER });
        this.y -= 6;
        this.rule(this.y);
        this.y -= 13;
    }

    row(label: string, amount: string, options: { bold?: boolean; muted?: boolean; indent?: number } = {}) {
        const indent = options.indent ?? 0;
        const color = options.muted ? MUTED : INK;
        this.text(label, MARGIN + indent, this.y, { bold: options.bold, color, maxWidth: CONTENT_WIDTH - 110 - indent });
        this.text(amount, PAGE_WIDTH - MARGIN, this.y, { bold: options.bold, color, align: 'right' });
        this.y -= 12;
    }

    /** Lista acotada: lo que no cabe en la hoja se resume en una sola línea. */
    list<T>(rows: T[], limit: number, draw: (row: T) => void, rest: (hidden: T[]) => void) {
        const visible = rows.length > limit ? rows.slice(0, limit - 1) : rows;
        visible.forEach(draw);
        if (rows.length > limit) rest(rows.slice(limit - 1));
    }
}

function drawNotice(page: PDFPage, fonts: Fonts, notice: BillNotice, siteUrl: string, generatedAt: string) {
    const w = new Writer(page, fonts);

    w.text(notice.community.name, MARGIN, w.y, { size: 13, bold: true });
    w.text('AVISO DE COBRO DE GASTOS COMUNES', PAGE_WIDTH - MARGIN, w.y, { size: 9, bold: true, color: COPPER, align: 'right' });
    w.y -= 13;
    if (notice.community.address) w.text(notice.community.address, MARGIN, w.y, { color: MUTED, maxWidth: 300 });
    w.text(`Periodo ${periodLabel(notice.month)}`, PAGE_WIDTH - MARGIN, w.y, { color: MUTED, align: 'right' });
    w.y -= 20;

    const boxTop = w.y;
    const boxHeight = 64;
    page.drawRectangle({ x: MARGIN, y: boxTop - boxHeight, width: CONTENT_WIDTH, height: boxHeight, color: WARM, borderColor: LINE, borderWidth: 0.6 });
    w.text(`Unidad ${notice.unit.label}`, MARGIN + 14, boxTop - 20, { size: 12, bold: true, maxWidth: 260 });
    w.text(notice.unit.ownerName ? `Propietario: ${notice.unit.ownerName}` : 'Propietario no registrado', MARGIN + 14, boxTop - 35, { color: MUTED, maxWidth: 260 });
    const share = notice.unit.sharePermille === null
        ? 'Prorrateo en partes iguales'
        : `Proporción en gastos comunes: ${(notice.unit.sharePermille / 10).toLocaleString('es-CL', { maximumFractionDigits: 3 })}%`;
    w.text(share, MARGIN + 14, boxTop - 50, { color: MUTED, maxWidth: 260 });
    w.text('TOTAL A PAGAR', PAGE_WIDTH - MARGIN - 14, boxTop - 20, { size: 8, bold: true, color: MUTED, align: 'right' });
    w.text(notice.totalDue < 0 ? `${money(-notice.totalDue)} a favor` : money(notice.totalDue), PAGE_WIDTH - MARGIN - 14, boxTop - 40, { size: 18, bold: true, align: 'right' });
    w.text(notice.dueDate ? `Vence el ${longDate(notice.dueDate)}` : 'Sin vencimiento emitido', PAGE_WIDTH - MARGIN - 14, boxTop - 54, { color: MUTED, align: 'right' });
    w.y = boxTop - boxHeight;

    w.section('Gasto común del periodo');
    if (notice.items.length === 0 && notice.gastoComun > 0) w.row('Gasto común', money(notice.gastoComun));
    w.list(notice.items, 10,
        item => w.row(item.label, money(item.amount), { indent: 6 }),
        hidden => w.row(`Otros ${hidden.length} conceptos`, money(hidden.reduce((sum, item) => sum + item.amount, 0)), { indent: 6 }));
    if (notice.gastoComun === 0) w.row('Sin gasto común emitido para este periodo', money(0), { muted: true });
    else w.row('Total gasto común', money(notice.gastoComun), { bold: true });
    if (notice.reserveContribution > 0) {
        w.row('De este monto, aporte al fondo común de reserva', money(notice.reserveContribution), { muted: true, indent: 6 });
    }

    if (notice.monthCharges.length > 0) {
        w.section('Otros cargos y descuentos del periodo');
        w.list(notice.monthCharges, 4,
            charge => w.row(`${charge.kind}: ${charge.label}`, money(charge.amount), { indent: 6 }),
            hidden => w.row(`Otros ${hidden.length} cargos`, money(hidden.reduce((sum, row) => sum + row.amount, 0)), { indent: 6 }));
    }

    w.section('Estado de cuenta');
    w.row(notice.previousBalance < 0 ? 'Saldo a favor de periodos anteriores' : 'Saldo de periodos anteriores', money(notice.previousBalance));
    w.row('Cargos del periodo', money(notice.periodCharges));
    w.row('Pagos recibidos desde el inicio del periodo', money(-notice.paymentsSinceStart));
    w.row('Total a pagar', notice.totalDue < 0 ? `${money(-notice.totalDue)} a favor` : money(notice.totalDue), { bold: true });

    w.section('Intereses y multas adeudados');
    if (notice.unpaidPenalties.length === 0) {
        w.row('La unidad no registra intereses ni multas impagos', money(0), { muted: true });
    } else {
        w.list(notice.unpaidPenalties, 3,
            penalty => w.row(`${penalty.kind} ${penalty.month}: ${penalty.label}`, money(penalty.amount), { indent: 6 }),
            hidden => w.row(`Otros ${hidden.length} intereses o multas`, money(hidden.reduce((sum, row) => sum + row.amount, 0)), { indent: 6 }));
        w.row('Total intereses y multas', money(notice.unpaidPenalties.reduce((sum, row) => sum + row.amount, 0)), { bold: true });
    }

    w.section('Información del condominio (art. 31, Ley 21.442)');
    w.row(`Ingresos del periodo (recaudación de ${periodLabel(notice.month).toLowerCase()})`, money(notice.summary.monthIncome));
    w.row('Egresos del periodo', money(notice.summary.monthExpenses));
    w.row(notice.summary.cashBalanceIsEstimate ? 'Saldo de caja (estimado según registros)' : 'Saldo de caja', money(notice.summary.cashBalance));
    w.row('Saldo del fondo común de reserva', money(notice.summary.reserveFundBalance));

    w.section('Evolución del gasto común de la unidad');
    const columnWidth = CONTENT_WIDTH / notice.history.length;
    notice.history.forEach((period, index) => {
        const x = MARGIN + columnWidth * index;
        w.text(periodLabel(period.month), x, w.y, { size: 8, color: MUTED, maxWidth: columnWidth - 4 });
        w.text(period.amount > 0 ? money(period.amount) : '-', x, w.y - 12, { size: 9, bold: period.month === notice.month, maxWidth: columnWidth - 4 });
    });
    w.y -= 24;

    w.rule(MARGIN + 42);
    w.text(`Paga en línea o revisa tu cartola en ${siteUrl}/expenses. Si pagaste por transferencia, envía el comprobante a la administración.`, MARGIN, MARGIN + 28, { size: 8, color: MUTED });
    w.text(`Documento generado el ${longDate(generatedAt)} a partir de los registros de la comunidad. Pagos posteriores a esa fecha no están reflejados.`, MARGIN, MARGIN + 16, { size: 7.5, color: MUTED });
}

export async function renderBillNoticesPdf(notices: BillNotice[], options: { siteUrl: string; generatedAt: string }): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    pdf.setTitle(pdfSafe(notices.length === 1
        ? `Aviso de cobro ${notices[0].unit.label} ${periodLabel(notices[0].month)}`
        : `Avisos de cobro ${notices[0] ? periodLabel(notices[0].month) : ''}`));
    const fonts = {
        regular: await pdf.embedFont(StandardFonts.Helvetica),
        bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    };
    for (const notice of notices) {
        const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        drawNotice(page, fonts, notice, options.siteUrl.replace(/\/$/, ''), options.generatedAt);
    }
    return pdf.save();
}
