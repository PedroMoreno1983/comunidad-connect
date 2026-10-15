import ExcelJS from "exceljs";

interface SpreadsheetTextOptions {
    maxRows?: number;
    /**
     * Números con coma decimal (es-CL) en vez de String(n): 1.125 → "1,125", para
     * que no se lean como miles. Las celdas con formato de porcentaje, que Excel
     * guarda como fracción (0,01125), salen como "1,125%". Solo `spreadsheetBufferToRows`.
     */
    decimalComma?: boolean;
}

/** Número de Excel → texto con coma decimal y sin separador de miles. */
function numberToDecimalComma(value: number, percent: boolean): string {
    const scaled = percent ? value * 100 : value;
    const text = String(Number(scaled.toPrecision(12))).replace(".", ",");
    return percent ? `${text}%` : text;
}

function cellToText(value: ExcelJS.CellValue): string {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "object") {
        if ("text" in value && typeof value.text === "string") return value.text;
        if ("result" in value) return cellToText(value.result as ExcelJS.CellValue);
        if ("richText" in value && Array.isArray(value.richText)) {
            return value.richText.map(part => part.text).join("");
        }
        if ("hyperlink" in value && "text" in value) return String(value.text || value.hyperlink || "");
        return JSON.stringify(value);
    }
    return String(value);
}

function normalizeRows(worksheet: ExcelJS.Worksheet, maxRows: number, decimalComma = false) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= maxRows + 1) return;
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            const raw = cell.value;
            const result = raw && typeof raw === "object" && "result" in raw ? raw.result : raw;
            values[colNumber - 1] = decimalComma && typeof result === "number" && Number.isFinite(result)
                ? numberToDecimalComma(result, typeof cell.numFmt === "string" && cell.numFmt.includes("%"))
                : cellToText(raw).trim();
        });
        if (values.some(Boolean)) rows.push(values);
    });
    return rows;
}

function rowsToNarrative(rows: string[][], maxRows: number) {
    if (rows.length === 0) return [];

    const [headerRow, ...bodyRows] = rows;
    const headers = headerRow.map((header, index) => header || `Columna ${index + 1}`);
    const hasUsefulHeaders = headerRow.filter(Boolean).length >= 2;
    const sourceRows = hasUsefulHeaders ? bodyRows : rows;

    return sourceRows.slice(0, maxRows).map((row, index) => {
        const values = row
            .map((value, columnIndex) => {
                if (!value) return "";
                const label = hasUsefulHeaders ? headers[columnIndex] || `Columna ${columnIndex + 1}` : `Columna ${columnIndex + 1}`;
                return `${label}: ${value}`;
            })
            .filter(Boolean);
        return values.length ? `Fila ${index + 1}: ${values.join(" | ")}` : "";
    }).filter(Boolean);
}

export async function spreadsheetBufferToText(buffer: Buffer, options: SpreadsheetTextOptions = {}) {
    const workbook = new ExcelJS.Workbook();
    const maxRows = options.maxRows ?? 1000;
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const sections: string[] = [];

    workbook.eachSheet((worksheet) => {
        const rowLines = rowsToNarrative(normalizeRows(worksheet, maxRows), maxRows);
        if (rowLines.length > 0) {
            sections.push([`Hoja: ${worksheet.name}`, ...rowLines].join("\n"));
        }
    });

    return sections.join("\n\n");
}

/** Filas de cada hoja (primera fila = encabezados), como texto. */
export async function spreadsheetBufferToRows(buffer: Buffer, options: SpreadsheetTextOptions = {}): Promise<string[][][]> {
    const workbook = new ExcelJS.Workbook();
    const maxRows = options.maxRows ?? 1000;
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
    const sheets: string[][][] = [];
    workbook.eachSheet((worksheet) => {
        const rows = normalizeRows(worksheet, maxRows, options.decimalComma).map(row => Array.from(row, value => value ?? ""));
        if (rows.length > 0) sheets.push(rows);
    });
    return sheets;
}
