import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  inferFileTypeFromName,
  parseUploadedFile,
} from "@/lib/ingestion/file-parser";
import { runAnalyticsPipeline } from "@/lib/analytics/pipeline";
import {
  recordFailedImportRun,
  recordSuccessfulImportRun,
} from "@/lib/ingestion/audit";
import { IngestionValidationError, importFromParsedUpload } from "@/lib/ingestion/service";
import {
  datasetSchema,
  fileTypeSchema,
  type DatasetKey,
  type FileType,
} from "@/lib/validations/ingestion";

export const runtime = "nodejs";

function toBoolean(value: FormDataEntryValue | null) {
  return value === "true";
}

function parseMapping(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return {};
  }

  try {
    return JSON.parse(value) as Record<string, string>;
  } catch {
    throw new Error("El mapeo de columnas no es un JSON valido.");
  }
}

export async function POST(request: Request) {
  let auditContext:
    | {
        dataset: DatasetKey;
        fileName: string;
        fileType: FileType;
        hasHeader: boolean;
        totalRows: number;
        companyId?: string;
        companyName?: string;
      }
    | undefined;

  try {
    const formData = await request.formData();
    const fileEntry = formData.get("file");

    if (!(fileEntry instanceof File)) {
      return NextResponse.json(
        { error: "Adjunta un archivo CSV o XLSX antes de importar." },
        { status: 400 },
      );
    }

    const inferredFileType = inferFileTypeFromName(fileEntry.name);
    const dataset = datasetSchema.parse(formData.get("dataset"));
    const fileType = fileTypeSchema.parse(formData.get("fileType") ?? inferredFileType);
    const hasHeader = toBoolean(formData.get("hasHeader"));
    const companyId =
      typeof formData.get("companyId") === "string"
        ? String(formData.get("companyId"))
        : undefined;
    const companyName =
      typeof formData.get("companyName") === "string"
        ? String(formData.get("companyName"))
        : undefined;
    const parsedUpload = await parseUploadedFile(fileEntry, {
      fileType,
      hasHeader,
    });
    auditContext = {
      dataset,
      fileName: fileEntry.name,
      fileType,
      hasHeader,
      totalRows: parsedUpload.totalRows,
      companyId,
      companyName,
    };
    const result = await importFromParsedUpload({
      dataset,
      parsedUpload,
      mapping: parseMapping(formData.get("mapping")),
      companyId,
      companyName,
    });
    await recordSuccessfulImportRun({
      ...auditContext,
      result,
    });
    await runAnalyticsPipeline({
      companyId: result.companyId,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof IngestionValidationError) {
      if (auditContext) {
        await recordFailedImportRun({
          ...auditContext,
          issues: error.issues,
          errorMessage: "La validacion de la importacion fallo.",
        });
      }

      return NextResponse.json(
        {
          error: "La validacion de la importacion fallo.",
          details: error.issues,
        },
        { status: 422 },
      );
    }

    if (error instanceof ZodError) {
      if (auditContext) {
        await recordFailedImportRun({
          ...auditContext,
          errorMessage: "El payload de importacion no es valido.",
        });
      }

      return NextResponse.json(
        {
          error: "El payload de importacion no es valido.",
          details: error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const message =
      error instanceof Error ? error.message : "No se pudieron importar los datos cargados.";

    if (auditContext) {
      await recordFailedImportRun({
        ...auditContext,
        errorMessage: message,
      });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
