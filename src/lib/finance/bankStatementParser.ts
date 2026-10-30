import ExcelJS from 'exceljs';
import { createHash } from 'node:crypto';
import type { BankTransactionInput } from '@/lib/types';
import { BillingError } from './billingService';
import 'pdf-parse/worker';
import { PDFParse } from 'pdf-parse';

const HEADER_ALIASES = {
    date: ['fecha', 'fecha movimiento', 'fecha operacion', 'date'],
    amount: ['monto', 'importe', 'amount'],
    inflow: ['abono', 'abonos', 'deposito', 'depositos', 'cargo haber'],
    outflow: ['cargo', 'cargos', 'egreso', 'egresos', 'retiro', 'retiros'],
    description: ['descripcion', 'detalle', 'glosa', 'concepto', 'description'],
    reference: ['referencia', 'numero operacion', 'n operacion', 'folio', 'documento', 'reference'],
};

export function normalize(value: unknown): string {
    return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function csvSeparator(content: string): ';' | ',' {
    let quoted = false;
    let semicolons = 0;
    let commas = 0;
    for (let i = 0; i < content.length; i += 1) {
        const char = content[i];
        if (char === '"') {
            if (quoted && content[i + 1] === '"') { i += 1; continue; }
            quoted = !quoted;
            continue;
        }
        if (quoted) continue;
        if (char === '\n' || char === '\r') {
            if (semicolons > 0 || commas > 0) return semicolons > commas ? ';' : ',';
            if (char === '\r' && content[i + 1] === '\n') i += 1;
            continue;
        }
        if (char === ';') semicolons += 1;
        else if (char === ',') commas += 1;
    }
    return semicolons > commas ? ';' : ',';
}

function displayedCell(value: unknown): unknown {
    if (value == null || typeof value !== 'object' || value instanceof Date) return value;
    const record = value as { result?: unknown; text?: unknown; error?: unknown; richText?: { text?: string }[] };
    if ('result' in record) return displayedCell(record.result);
    if (Array.isArray(record.richText)) return record.richText.map(part => part?.text ?? '').join('');
    if ('text' in record) return record.text;
    if (typeof record.error === 'string') return record.error;
    return value;
}

function csvRows(content: string): string[][] {
    const separator = csvSeparator(content);
    const rows: string[][] = [];
    let row: string[] = [], cell = '', quoted = false;
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        if (char === '"') {
            if (quoted && content[i + 1] === '"') { cell += '"'; i++; }
            else quoted = !quoted;
        } else if (char === separator && !quoted) {
            row.push(cell); cell = '';
        } else if ((char === '\n' || char === '\r') && !quoted) {
            if (char === '\r' && content[i + 1] === '\n') i++;
            row.push(cell); if (row.some(value => value.trim())) rows.push(row);
            row = []; cell = '';
        } else cell += char;
    }
    if (quoted) throw new BillingError('bad_csv', 'La cartola contiene comillas sin cerrar.');
    row.push(cell); if (row.some(value => value.trim())) rows.push(row);
    return rows;
}

export function parseAmount(value: unknown): number {
    const raw = String(value ?? '').trim();
    if (!raw) return 0;
    const cleaned = raw.replace(/[^\d,.-]/g, '');
    const comma = cleaned.lastIndexOf(',');
    const dot = cleaned.lastIndexOf('.');
    const decimal = comma > dot ? ',' : dot > comma ? '.' : '';
    const digitsAfter = decimal ? cleaned.length - Math.max(comma, dot) - 1 : 0;
    const normalized = digitsAfter === 2
        ? cleaned.replace(decimal === ',' ? /\./g : /,/g, '').replace(',', '.')
        : cleaned.replace(/[,.]/g, '');
    const number = Number(normalized);
    if (!Number.isFinite(number)) throw new BillingError('bad_amount', `Monto inválido: ${raw}`);
    return Math.round(number);
}

export function parseDate(value: unknown): string {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    const raw = String(value ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const parsed = new Date(`${raw}T12:00:00Z`);
        if (!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === raw) return raw;
        throw new BillingError('bad_date', `Fecha inválida: ${raw}`);
    }
    const match = /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/.exec(raw);
    if (!match) throw new BillingError('bad_date', `Fecha inválida: ${raw || '(vacía)'}`);
    const date = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
    const parsed = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
        throw new BillingError('bad_date', `Fecha inválida: ${raw}`);
    }
    return date;
}

/** Lee la primera hoja de un XLSX o un CSV como tabla de celdas visibles. */
export async function readSpreadsheetTable(file: File, documentName: string): Promise<{ table: unknown[][]; bytes: Buffer }> {
    if (file.size > 5 * 1024 * 1024) throw new BillingError('large_file', `${documentName} supera 5 MB.`);
    const extension = file.name.toLowerCase().split('.').pop();
    const bytes = Buffer.from(await file.arrayBuffer());
    if (extension === 'pdf') {
        if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new BillingError('bad_pdf', 'El archivo no es un PDF válido.');
        const parser = new PDFParse({ data: bytes });
        try {
            const extracted = await parser.getTable();
            const tables = extracted.mergedTables.length > 0
                ? extracted.mergedTables
                : extracted.pages.flatMap(page => page.tables);
            return { table: tableFromPdf(tables), bytes };
        } catch (error) {
            if (error instanceof BillingError) throw error;
            throw new BillingError('bad_pdf', 'No pude leer la tabla del PDF. Exporta la cartola a CSV o XLSX.');
        } finally {
            await parser.destroy();
        }
    }
    if (extension === 'csv') {
        return { table: csvRows(bytes.toString('utf8').replace(/^\uFEFF/, '')), bytes };
    }
    if (extension === 'xlsx') {
        const book = new ExcelJS.Workbook();
        await book.xlsx.load(bytes as unknown as Parameters<typeof book.xlsx.load>[0]);
        const sheet = book.worksheets[0];
        if (!sheet) throw new BillingError('empty_file', 'La planilla no tiene hojas.');
        const table: unknown[][] = [];
        sheet.eachRow(row => table.push((row.values as unknown[]).slice(1).map(displayedCell)));
        return { table, bytes };
    }
    throw new BillingError('bad_file', `Sube ${documentName.toLowerCase()} en PDF, CSV o XLSX.`);
}

/** Solo acepta tablas PDF con encabezados inequívocos; nunca interpreta saldos como pagos. */
export function tableFromPdf(tables: string[][][]): string[][] {
    const candidates = tables.filter(table => table.some(row => row.some(cell => HEADER_ALIASES.date.includes(normalize(cell)))));
    if (!candidates.length) throw new BillingError('pdf_no_table', 'No encontré una tabla legible con Fecha y Monto en el PDF. Exporta CSV o XLSX.');
    const first = candidates[0];
    const firstHeader = first.findIndex(row => row.some(cell => HEADER_ALIASES.date.includes(normalize(cell))));
    const header = first[firstHeader].map(normalize);
    const hasAmount = header.some(cell => [...HEADER_ALIASES.amount, ...HEADER_ALIASES.inflow, ...HEADER_ALIASES.outflow].includes(cell));
    if (!hasAmount) throw new BillingError('pdf_no_amount', 'La tabla PDF no identifica Monto o Abonos/Cargos. Exporta CSV o XLSX.');
    const output = first.slice(firstHeader);
    for (const table of candidates.slice(1)) {
        const headerIndex = table.findIndex(row => row.some(cell => HEADER_ALIASES.date.includes(normalize(cell))));
        if (table[headerIndex].map(normalize).join('|') !== header.join('|')) {
            throw new BillingError('pdf_mixed_tables', 'El PDF contiene tablas con columnas distintas. Exporta CSV o XLSX.');
        }
        output.push(...table.slice(headerIndex + 1));
    }
    return output;
}

export async function parseBankStatement(file: File): Promise<BankTransactionInput[]> {
    const { table, bytes } = await readSpreadsheetTable(file, 'La cartola');
    const fileIdentity = createHash('sha256').update(bytes).digest('hex');

    const headerIndex = table.findIndex(row => row.some(cell => HEADER_ALIASES.date.includes(normalize(cell))));
    if (headerIndex < 0) throw new BillingError('missing_headers', 'No se encontró una columna Fecha.');
    const headers = table[headerIndex].map(normalize);
    const column = (aliases: string[]) => headers.findIndex(header => aliases.includes(header));
    const dateColumn = column(HEADER_ALIASES.date);
    const amountColumn = column(HEADER_ALIASES.amount);
    const inflowColumn = column(HEADER_ALIASES.inflow);
    const outflowColumn = column(HEADER_ALIASES.outflow);
    if (amountColumn < 0 && inflowColumn < 0 && outflowColumn < 0) {
        throw new BillingError('missing_headers', 'Falta Monto o columnas Abonos/Cargos.');
    }
    const descriptionColumn = column(HEADER_ALIASES.description);
    const referenceColumn = column(HEADER_ALIASES.reference);
    const rows = table.slice(headerIndex + 1).filter(row => row.some(cell => String(cell ?? '').trim()));
    if (rows.length > 500) throw new BillingError('too_many_rows', 'La cartola supera 500 movimientos. Divídela por periodos.');
    return rows.map((row, index) => {
        try {
            const amount = amountColumn >= 0 ? parseAmount(row[amountColumn])
                : parseAmount(row[inflowColumn]) - Math.abs(parseAmount(row[outflowColumn]));
            if (amount === 0) throw new BillingError('bad_amount', 'El monto es cero.');
            return {
                txnDate: parseDate(row[dateColumn]), amount,
                description: descriptionColumn >= 0 ? String(row[descriptionColumn] ?? '').slice(0, 300) : '',
                reference: referenceColumn >= 0 ? String(row[referenceColumn] ?? '').slice(0, 120) : '',
                importKey: createHash('sha256').update(`${fileIdentity}:${headerIndex + index + 2}`).digest('hex'),
            };
        } catch (error) {
            throw new BillingError('bad_row', `Fila ${headerIndex + index + 2}: ${error instanceof Error ? error.message : 'datos inválidos'}`);
        }
    });
}
