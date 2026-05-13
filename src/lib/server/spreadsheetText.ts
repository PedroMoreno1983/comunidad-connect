import ExcelJS from "exceljs";

interface SpreadsheetTextOptions {
    maxRows?: number;
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

function normalizeRows(worksheet: ExcelJS.Worksheet, maxRows: number) {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
        if (rows.length >= maxRows + 1) return;
        const values: string[] = [];
        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            values[colNumber - 1] = cellToText(cell.value).trim();
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
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);

    const maxRows = options.maxRows ?? 1000;
    const sections: string[] = [];

    workbook.eachSheet((worksheet) => {
        const rowLines = rowsToNarrative(normalizeRows(worksheet, maxRows), maxRows);
        if (rowLines.length > 0) {
            sections.push([`Hoja: ${worksheet.name}`, ...rowLines].join("\n"));
        }
    });

    return sections.join("\n\n");
}
