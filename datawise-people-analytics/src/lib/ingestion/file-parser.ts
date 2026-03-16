import Papa from "papaparse";
import * as XLSX from "xlsx";

import type { FileType } from "@/lib/validations/ingestion";

export type ParsedUpload = {
  fileName: string;
  fileType: FileType;
  headers: string[];
  rows: Array<Record<string, string>>;
  totalRows: number;
};

type ParseOptions = {
  fileType: FileType;
  hasHeader: boolean;
};

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function toDisplayString(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).trim();
}

function dedupeHeaders(sourceHeaders: string[]) {
  const seen = new Map<string, number>();

  return sourceHeaders.map((value, index) => {
    const base = value.trim() || `column_${index + 1}`;
    const currentCount = seen.get(base) ?? 0;
    seen.set(base, currentCount + 1);
    return currentCount === 0 ? base : `${base}_${currentCount + 1}`;
  });
}

function mapRowsFromMatrix(matrix: unknown[][], hasHeader: boolean) {
  const sanitizedMatrix = matrix
    .map((row) => row.map((cell) => toDisplayString(cell)))
    .filter((row) => row.some((cell) => cell.length > 0));

  if (sanitizedMatrix.length === 0) {
    return {
      headers: [],
      rows: [],
    };
  }

  const headerRow = hasHeader
    ? sanitizedMatrix[0]
    : Array.from(
        { length: Math.max(...sanitizedMatrix.map((row) => row.length)) },
        (_, index) => `column_${index + 1}`,
      );
  const headers = dedupeHeaders(headerRow);
  const dataRows = hasHeader ? sanitizedMatrix.slice(1) : sanitizedMatrix;
  const rows = dataRows.map((row) =>
    headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = row[index] ?? "";
      return record;
    }, {}),
  );

  return { headers, rows };
}

function parseCsv(text: string, hasHeader: boolean) {
  const parsed = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: true,
  });

  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors[0]?.message ?? "No se pudo parsear el archivo CSV.");
  }

  return mapRowsFromMatrix(parsed.data, hasHeader);
}

function parseSpreadsheet(buffer: Buffer, hasHeader: boolean) {
  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("La planilla no contiene hojas.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "yyyy-mm-dd",
  });

  return mapRowsFromMatrix(matrix, hasHeader);
}

export async function parseUploadedFile(file: File, options: ParseOptions) {
  if (file.size === 0) {
    throw new Error("El archivo cargado esta vacio.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("El archivo cargado es demasiado grande. El limite del MVP es 10 MB.");
  }

  if (options.fileType === "csv") {
    const text = await file.text();
    const { headers, rows } = parseCsv(text, options.hasHeader);

    return {
      fileName: file.name,
      fileType: options.fileType,
      headers,
      rows,
      totalRows: rows.length,
    } satisfies ParsedUpload;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { headers, rows } = parseSpreadsheet(buffer, options.hasHeader);

  return {
    fileName: file.name,
    fileType: options.fileType,
    headers,
    rows,
    totalRows: rows.length,
  } satisfies ParsedUpload;
}

export function inferFileTypeFromName(fileName: string): FileType | null {
  const lowerCaseName = fileName.toLowerCase();

  if (lowerCaseName.endsWith(".csv")) {
    return "csv";
  }

  if (lowerCaseName.endsWith(".xlsx")) {
    return "xlsx";
  }

  return null;
}
