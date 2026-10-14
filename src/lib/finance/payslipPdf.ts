import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { pdfSafe } from '@/lib/finance/billPdf';
import type { PayslipDocument } from '@/lib/types';

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 48;
const INK = rgb(0.10, 0.09, 0.08);
const MUTED = rgb(0.38, 0.35, 0.32);
const LINE = rgb(0.80, 0.76, 0.71);

const MONTH_NAMES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

const money = (value: number) => `$${Math.round(value).toLocaleString('es-CL')}`;

/** Liquidación de sueldo mensual en una página, con línea de firma del trabajador. */
export async function renderPayslipPdf(doc: PayslipDocument): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const regular = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let y = PAGE_HEIGHT - MARGIN;

    const text = (value: string, x: number, size = 10, font = regular, color = INK) => {
        page.drawText(pdfSafe(value), { x, y, size, font, color });
    };
    const right = (value: string, size = 10, font = regular) => {
        const safe = pdfSafe(value);
        page.drawText(safe, { x: PAGE_WIDTH - MARGIN - font.widthOfTextAtSize(safe, size), y, size, font, color: INK });
    };
    const rule = () => {
        page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: LINE });
    };
    const row = (label: string, amount: number, font = regular) => {
        text(label, MARGIN + 8, 10, font);
        right(money(amount), 10, font);
        y -= 16;
    };
    const section = (title: string) => {
        y -= 6;
        text(title.toUpperCase(), MARGIN, 8, bold, MUTED);
        y -= 6;
        rule();
        y -= 14;
    };

    const [year, monthIndex] = doc.month.split('-').map(Number);
    text('Liquidación de sueldo', MARGIN, 18, bold);
    y -= 20;
    text(`${MONTH_NAMES[monthIndex - 1]} de ${year}`, MARGIN, 11, regular, MUTED);
    y -= 26;
    text(`Empleador: ${doc.communityName}`, MARGIN, 10);
    y -= 14;
    if (doc.communityAddress) { text(doc.communityAddress, MARGIN, 9, regular, MUTED); y -= 14; }
    text(`Trabajador: ${doc.employee.fullName}${doc.employee.rut ? ` · RUT ${doc.employee.rut}` : ''}`, MARGIN, 10);
    y -= 14;
    text(`Cargo: ${doc.employee.roleTitle}`, MARGIN, 10);
    y -= 10;

    const s = doc.slip;
    section('Haberes imponibles');
    row('Sueldo base', s.baseSalary);
    if (s.gratification) row('Gratificación legal (art. 50)', s.gratification);
    if (s.taxableBonus) row('Bonos imponibles', s.taxableBonus);
    row('Total imponible', s.taxableIncome, bold);

    if (s.mealAllowance || s.transportAllowance || s.familyAllowance) {
        section('Haberes no imponibles');
        if (s.mealAllowance) row('Asignación de colación', s.mealAllowance);
        if (s.transportAllowance) row('Asignación de movilización', s.transportAllowance);
        if (s.familyAllowance) row('Asignación familiar', s.familyAllowance);
    }
    row('Total haberes', s.grossPay, bold);

    section('Descuentos');
    if (s.afp) row(`AFP ${s.afp.name} (${(s.afp.rate * 100).toFixed(2).replace('.', ',')}%)`, s.afp.amount);
    row(s.health.system === 'isapre' ? 'Salud isapre' : 'Salud Fonasa (7%)', s.health.amount);
    if (s.unemploymentWorker) row('Seguro de cesantía', s.unemploymentWorker);
    row('Impuesto único', s.incomeTax);
    row('Total descuentos', s.totalDeductions, bold);

    y -= 6;
    rule();
    y -= 20;
    text('LÍQUIDO A PAGAR', MARGIN, 12, bold);
    right(money(s.netPay), 12, bold);
    y -= 30;

    section('Aportes del empleador (no se descuentan al trabajador)');
    row('Seguro de invalidez y sobrevivencia', s.employer.sis);
    row('Aporte a cuenta individual y Seguro Social', s.employer.afp + s.employer.socialInsurance);
    row('Seguro de cesantía empleador', s.employer.unemployment);
    row('Seguro de accidentes del trabajo', s.employer.accidentInsurance);

    y -= 60;
    page.drawLine({ start: { x: PAGE_WIDTH - MARGIN - 200, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.6, color: INK });
    y -= 14;
    const signature = pdfSafe('Firma del trabajador');
    page.drawText(signature, {
        x: PAGE_WIDTH - MARGIN - 100 - regular.widthOfTextAtSize(signature, 9) / 2, y, size: 9, font: regular, color: MUTED,
    });
    y -= 14;
    const note = 'Declaro haber recibido conforme el monto líquido indicado y no tener cargo ni cobro alguno que hacer.';
    text(note, MARGIN, 8, regular, MUTED);

    y = MARGIN;
    text(
        doc.indicatorsMonth
            ? `Calculada con indicadores previsionales Previred de ${doc.indicatorsMonth}. Generada por ComunidadConnect.`
            : 'Generada por ComunidadConnect.',
        MARGIN, 7, regular, MUTED,
    );

    return pdf.save();
}
